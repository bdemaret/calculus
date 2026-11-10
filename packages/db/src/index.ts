import { PrismaClient, Prisma } from "@prisma/client";
import {
  ACHIEVEMENTS,
  DAILY_GRACE_MS,
  DAILY_LATE_MS,
  DAILY_ROUNDS,
  DEFAULT_TITLE_ID,
  GAMES,
  GAME_IDS,
  INITIAL_RATING,
  NO_TITLE,
  PLACEMENT_GAMES,
  buildReport,
  checkDailyBot,
  closestAnswers,
  computeRatingChanges,
  countersDelta,
  dailyDate,
  dailyQuestion,
  dailyStreak,
  dailyTimeLimitMs,
  describeRatingChange,
  dungeonFactsOf,
  evaluateAchievements,
  evaluateDungeonAchievements,
  factsOf,
  fallbackBomb,
  longestDailyStreak,
  progressOf,
  wornTitle,
  type AchievementCategory,
  type DailyStreak,
  type AchievementTier,
  type AnswerRecord,
  type BotRule,
  type Counters,
  type Difficulty,
  type DungeonSummary,
  type GameFacts,
  type GameId,
  type GameModeId,
  type GameReport,
  type GameSettings,
  type OpTag,
  type PlayerState,
  type Puzzle,
  type Question,
  type RatingChange,
  type RoundRecord,
  type Standing,
  type Unlock,
} from "@calculus/game-core";
import { randomBytes, randomUUID } from "node:crypto";
import { FEEDBACK_GUESTS_PER_HOUR, FEEDBACK_PER_USER_PER_HOUR, type FeedbackKindName } from "./feedback";
import { GUILD_MAX_MEMBERS, GUILD_MAX_PENDING_INVITES, GUILD_NAME_MIN, GUILD_ONLINE_MS, cleanGuildName } from "./guild";

export { Prisma };
export type { PrismaClient };

/* Un seul client Prisma par processus (évite d'ouvrir des connexions à chaque rechargement en dev). */
const globalForPrisma = globalThis as unknown as { __prisma?: PrismaClient };
export const prisma: PrismaClient = globalForPrisma.__prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.__prisma = prisma;

/* ------------------------------------------------------------------ */
/* Enregistrement d'une partie terminée                                 */
/* ------------------------------------------------------------------ */

export interface SaveGameInput {
  code: string | null;
  solo: boolean;
  hostUserId: string | null;
  settings: GameSettings;
  seed: string;
  startedAt: Date;
  endedAt: Date;
  standings: Standing[];
  history: RoundRecord[];
  /** Pour chaque joueur de la partie : l'id de son compte, ou null pour un invité. */
  userIds: Record<string, string | null>;
}

export interface SavedGame {
  id: string;
  /** Effet sur l'Elo de chaque joueur, par clé de joueur (vide si la partie n'est pas classée). Jamais l'Elo caché d'un joueur en placement. */
  ratings: Record<string, RatingChange>;
  /** Succès débloqués par cette partie, par clé de joueur. */
  unlocks: Record<string, Unlock[]>;
}

/** Ce que chaque compte gagne à cette partie. Pur : une erreur ici fait perdre un succès, jamais une partie. */
function computeProgress(input: SaveGameInput, rated: boolean): Map<string, { userId: string; facts: GameFacts; delta: Record<string, number> }> {
  const progress = new Map<string, { userId: string; facts: GameFacts; delta: Record<string, number> }>();
  try {
    const accounts = input.standings.filter((s) => input.userIds[s.player.id]).length;
    const source = { solo: input.solo, settings: input.settings, endedAt: input.endedAt.getTime(), rated, accounts, standings: input.standings, history: input.history };
    for (const { player } of input.standings) {
      const userId = input.userIds[player.id];
      const facts = userId ? factsOf(source, player.id) : null;
      if (userId && facts) progress.set(player.id, { userId, facts, delta: countersDelta(facts) });
    }
  } catch (err) {
    console.error("[succès] échec du calcul", err);
    progress.clear();
  }
  return progress;
}

/** Inscrit des succès obtenus et les titres qu'ils offrent. Deux parties simultanées ne les doublent pas. */
async function grantUnlocks(
  tx: Prisma.TransactionClient,
  grants: { userId: string; unlock: Unlock; gameId: string | null; backfilledAt?: { unlockedAt: Date; seenAt: Date } }[],
): Promise<void> {
  if (grants.length === 0) return;
  await tx.userAchievement.createMany({
    data: grants.map(({ userId, unlock, gameId, backfilledAt }) => ({ userId, achievementId: unlock.achievementId, gameId, ...backfilledAt })),
    skipDuplicates: true,
  });
  const titles = grants.flatMap(({ userId, unlock, backfilledAt }) =>
    unlock.titleId ? [{ userId, titleId: unlock.titleId, source: "achievement", sourceRef: unlock.achievementId, unlockedAt: backfilledAt?.unlockedAt }] : [],
  );
  if (titles.length) await tx.userTitle.createMany({ data: titles, skipDuplicates: true });
}

/** Ajoute à leurs compteurs ce que la partie a apporté, puis débloque ce qui est atteint. */
async function applyAchievements(
  tx: Prisma.TransactionClient,
  progress: ReadonlyMap<string, { userId: string; facts: GameFacts; delta: Record<string, number> }>,
  gameId: string,
): Promise<Record<string, Unlock[]>> {
  const unlocks: Record<string, Unlock[]> = {};
  if (progress.size === 0) return unlocks;
  const increments = [...progress.values()].flatMap(({ userId, delta }) => Object.entries(delta).map(([key, value]) => ({ userId, key, value })));
  if (increments.length) {
    // Une seule requête, en incrément : la transaction reste courte à 12 joueurs, et deux parties simultanées ne s'écrasent pas.
    await tx.$executeRaw`
      INSERT INTO "user_counter" ("userId", "key", "value")
      SELECT * FROM unnest(${increments.map((i) => i.userId)}::text[], ${increments.map((i) => i.key)}::text[], ${increments.map((i) => i.value)}::int[])
      ON CONFLICT ("userId", "key") DO UPDATE SET "value" = "user_counter"."value" + EXCLUDED."value"`;
  }
  const userIds = [...progress.values()].map((p) => p.userId);
  const [counterRows, ownedRows] = await Promise.all([
    tx.userCounter.findMany({ where: { userId: { in: userIds } } }),
    tx.userAchievement.findMany({ where: { userId: { in: userIds } }, select: { userId: true, achievementId: true } }),
  ]);
  const grants: { userId: string; unlock: Unlock; gameId: string }[] = [];
  for (const [playerKey, { userId, facts }] of progress) {
    const counters = Object.fromEntries(counterRows.filter((r) => r.userId === userId).map((r) => [r.key, r.value]));
    const owned = new Set(ownedRows.filter((r) => r.userId === userId).map((r) => r.achievementId));
    try {
      const earned = evaluateAchievements(facts, counters, owned);
      if (earned.length) unlocks[playerKey] = earned;
      for (const unlock of earned) grants.push({ userId, unlock, gameId });
    } catch (err) {
      console.error("[succès] échec de l'évaluation", err);
    }
  }
  await grantUnlocks(tx, grants);
  return unlocks;
}

/**
 * Enregistre la partie, ses calculs, les réponses, puis met à jour les statistiques et l'Elo.
 * Seules les parties en ligne entre au moins deux comptes sont classées : les invités n'ont pas d'Elo
 * et ne comptent pas comme adversaires (sinon on pourrait gagner de l'Elo contre ses propres invités).
 * Les comptes en placement n'en donnent pas non plus aux joueurs classés (voir `computeRatingChanges`).
 */
export async function saveGame(input: SaveGameInput): Promise<SavedGame> {
  const gameId = randomUUID();
  const playerRowId = new Map<string, string>();
  for (const s of input.standings) playerRowId.set(s.player.id, randomUUID());
  const multiplayer = input.standings.length > 1;
  const { game, mode, difficulty } = input.settings;
  const ratings: Record<string, RatingChange> = {};
  /** Elo avant, variation et parties jouées après celle-ci, pour chaque joueur classé (valeurs internes). */
  const stored = new Map<string, { before: number; delta: number; games: number }>();
  let unlocks: Record<string, Unlock[]> = {};

  await prisma.$transaction(async (tx) => {
    // Elo : calculé avant de créer les joueurs, pour garder « avant / variation » sur chaque ligne.
    const rated = input.solo ? [] : input.standings.filter((s) => input.userIds[s.player.id]);
    if (rated.length >= 2) {
      const rows = await tx.rating.findMany({
        where: { game, mode, difficulty, userId: { in: rated.map((s) => input.userIds[s.player.id]!) } },
      });
      const current = new Map(rows.map((r) => [r.userId, r]));
      const entries = rated.map((s) => {
        const row = current.get(input.userIds[s.player.id]!);
        const games = row?.games ?? 0;
        return { id: s.player.id, rating: row?.rating ?? INITIAL_RATING, rank: s.rank, provisional: games < PLACEMENT_GAMES, games };
      });
      const deltas = computeRatingChanges(entries);
      for (const e of entries) {
        const delta = deltas[e.id] ?? 0;
        stored.set(e.id, { before: e.rating, delta, games: e.games + 1 });
        ratings[e.id] = describeRatingChange(e.rating, e.rating + delta, e.games + 1);
        const userId = input.userIds[e.id]!;
        // Incrément plutôt qu'écriture : deux parties qui se terminent en même temps ne s'écrasent pas.
        await tx.rating.upsert({
          where: { userId_game_mode_difficulty: { userId, game, mode, difficulty } },
          create: { userId, game, mode, difficulty, rating: INITIAL_RATING + delta, games: 1 },
          update: { rating: { increment: delta }, games: { increment: 1 } },
        });
      }
    }

    await tx.game.create({
      data: {
        id: gameId,
        code: input.code,
        solo: input.solo,
        hostId: input.hostUserId,
        settings: input.settings as unknown as Prisma.InputJsonValue,
        game,
        mode,
        difficulty: input.settings.difficulty,
        turnStyle: input.settings.turnStyle,
        seed: input.seed,
        rounds: input.history.length,
        startedAt: input.startedAt,
        endedAt: input.endedAt,
      },
    });

    await tx.gamePlayer.createMany({
      data: input.standings.map(({ rank, player }) => ({
        id: playerRowId.get(player.id)!,
        gameId,
        userId: input.userIds[player.id] ?? null,
        playerKey: player.id,
        displayName: player.name,
        rank,
        score: player.score,
        alive: player.alive,
        eliminatedAt: player.eliminatedAt,
        answered: player.answered,
        correct: player.correct,
        correctTimeMs: Math.round(player.correctTimeMs),
        bestStreak: player.bestStreak,
        ratingBefore: stored.get(player.id)?.before ?? null,
        ratingDelta: stored.get(player.id)?.delta ?? null,
        ratingGames: stored.get(player.id)?.games ?? null,
      })),
    });

    // Un calcul par manche ; à la bombe, un par destinataire (avec son auteur), le tirage dans `puzzle`.
    const questionRows = input.history.flatMap((r) =>
      (r.personal ? Object.entries(r.personal) : [["", { question: r.question, authorId: null }] as const]).map(([forPlayerKey, { question, authorId }]) => ({
        id: randomUUID(),
        gameId,
        position: r.index,
        text: question.text,
        answer: question.answer,
        solution: question.solution,
        puzzle: r.question.puzzle as unknown as Prisma.InputJsonValue,
        tags: question.tags,
        difficulty: question.difficulty,
        timeLimitMs: r.timeLimitMs,
        activePlayerKey: r.activePlayerId,
        forPlayerKey,
        authorPlayerKey: authorId,
      })),
    );
    if (questionRows.length) await tx.question.createMany({ data: questionRows });
    const rowOf = (position: number, playerKey: string) =>
      questionRows.find((q) => q.position === position && q.forPlayerKey === playerKey) ?? questionRows.find((q) => q.position === position)!;

    const answerRows = input.history.flatMap((r) =>
      r.answers
        .filter((a) => playerRowId.has(a.playerId))
        .map((a) => ({
          questionId: rowOf(r.index, a.playerId).id,
          playerId: playerRowId.get(a.playerId)!,
          value: a.value,
          text: a.text,
          correct: a.correct,
          timeMs: Math.round(a.timeMs),
        })),
    );
    if (answerRows.length) await tx.answer.createMany({ data: answerRows });

    // Statistiques des joueurs inscrits
    for (const { rank, player } of input.standings) {
      const userId = input.userIds[player.id];
      if (!userId) continue;
      const won = multiplayer && rank === 1;
      const survival = input.settings.mode === "battle-royale" ? player.score : 0;
      const existing = await tx.userStats.findUnique({ where: { userId } });
      if (!existing) {
        await tx.userStats.create({
          data: {
            userId,
            gamesPlayed: 1,
            onlineGames: input.solo ? 0 : 1,
            soloGames: input.solo ? 1 : 0,
            wins: won ? 1 : 0,
            answered: player.answered,
            correct: player.correct,
            totalCorrectTimeMs: BigInt(Math.round(player.correctTimeMs)),
            bestStreak: player.bestStreak,
            bestSurvival: survival,
          },
        });
      } else {
        await tx.userStats.update({
          where: { userId },
          data: {
            gamesPlayed: { increment: 1 },
            onlineGames: { increment: input.solo ? 0 : 1 },
            soloGames: { increment: input.solo ? 1 : 0 },
            wins: { increment: won ? 1 : 0 },
            answered: { increment: player.answered },
            correct: { increment: player.correct },
            totalCorrectTimeMs: { increment: BigInt(Math.round(player.correctTimeMs)) },
            bestStreak: Math.max(existing.bestStreak, player.bestStreak),
            bestSurvival: Math.max(existing.bestSurvival, survival),
          },
        });
      }
    }

    unlocks = await applyAchievements(tx, computeProgress(input, stored.size >= 2), gameId);
  });

  return { id: gameId, ratings, unlocks };
}

/** Compteurs des succès hors parties (amis, guilde, calcul du jour, donjons), relus à la source plutôt que stockés. */
async function sourceCounters(db: Prisma.TransactionClient, userId: string): Promise<Counters> {
  const [friends, member, dailyWins, dailyDates, dungeons, dungeonWins, hearts] = await Promise.all([
    db.friendship.count({ where: { status: "accepted", OR: [{ requesterId: userId }, { addresseeId: userId }] } }),
    db.guildMember.findUnique({ where: { userId }, select: { role: true } }),
    db.dailyRun.count({ where: { userId, won: true } }),
    dailyPlayedDates(db, userId),
    // Une expédition quittée avant la fin ne compte pas, ni une victoire sans une seule bonne réponse
    // (portée par l'équipe) ; les cœurs donnés avant de partir, si.
    db.dungeonRunPlayer.count({ where: { userId, left: false } }),
    db.dungeonRunPlayer.count({ where: { userId, left: false, correct: { gt: 0 }, run: { outcome: "won" } } }),
    db.dungeonRunPlayer.aggregate({ where: { userId }, _sum: { heartsGiven: true } }),
  ]);
  return {
    friends,
    "guild-member": member ? 1 : 0,
    "guild-leader": member?.role === "leader" ? 1 : 0,
    "daily-wins": dailyWins,
    "daily-streak": longestDailyStreak(dailyDates),
    dungeons,
    "dungeon-wins": dungeonWins,
    "dungeon-hearts": hearts._sum.heartsGiven ?? 0,
  };
}

/** Jours où ce compte a fini son calcul du jour : la matière de sa série. */
async function dailyPlayedDates(db: Prisma.TransactionClient, userId: string): Promise<string[]> {
  const runs = await db.dailyRun.findMany({ where: { userId, finishedAt: { not: null } }, select: { date: true } });
  return runs.map((r) => r.date);
}

/** Succès hors parties que les compteurs de ce compte viennent d'atteindre. */
async function sourceUnlocks(db: Prisma.TransactionClient, userId: string): Promise<Unlock[]> {
  const [counters, owned] = await Promise.all([sourceCounters(db, userId), db.userAchievement.findMany({ where: { userId }, select: { achievementId: true } })]);
  return evaluateAchievements(null, counters, new Set(owned.map((o) => o.achievementId)));
}

/**
 * Succès qui ne viennent pas d'une partie (amis, guilde).
 * Une erreur ici ne doit jamais faire échouer l'action sociale qui l'a déclenchée.
 */
export async function grantSocialAchievements(userIds: string[]): Promise<void> {
  try {
    for (const userId of userIds) {
      const earned = await sourceUnlocks(prisma, userId);
      await prisma.$transaction((tx) => grantUnlocks(tx, earned.map((unlock) => ({ userId, unlock, gameId: null }))));
    }
  } catch (err) {
    console.error("[succès] échec des succès sociaux", err);
  }
}

/** Un succès tel que son propriétaire le voit dans son profil. */
export interface AchievementStatus {
  id: string;
  category: AchievementCategory;
  tier: AchievementTier;
  secret: boolean;
  /** Titre offert. */
  title: string | null;
  /** Date d'obtention (ISO), null tant qu'il n'est pas obtenu. */
  unlockedAt: string | null;
  /** Obtenu depuis la dernière visite de l'onglet. */
  isNew: boolean;
  /** Avancée d'un succès cumulatif. */
  progress: { value: number; target: number } | null;
}

/** Tous les succès du catalogue et leur état pour ce compte. */
export async function getAchievements(userId: string): Promise<AchievementStatus[]> {
  const [owned, rows, social] = await Promise.all([
    prisma.userAchievement.findMany({ where: { userId } }),
    prisma.userCounter.findMany({ where: { userId } }),
    sourceCounters(prisma, userId),
  ]);
  const byId = new Map(owned.map((a) => [a.achievementId, a]));
  const counters = { ...Object.fromEntries(rows.map((r) => [r.key, r.value])), ...social };
  return ACHIEVEMENTS.map((a) => {
    const row = byId.get(a.id);
    return {
      id: a.id,
      category: a.category,
      tier: a.tier,
      secret: a.secret ?? false,
      title: a.title ?? null,
      unlockedAt: row?.unlockedAt.toISOString() ?? null,
      isNew: !!row && !row.seenAt,
      progress: progressOf(a, counters),
    };
  });
}

/** Titres possédés, celui par défaut en tête, et titre porté (null : aucun). */
export async function getTitles(userId: string): Promise<{ owned: string[]; current: string | null }> {
  const [owned, user] = await Promise.all([
    prisma.userTitle.findMany({ where: { userId }, orderBy: { unlockedAt: "asc" }, select: { titleId: true } }),
    prisma.user.findUnique({ where: { id: userId }, select: { titleId: true } }),
  ]);
  return { owned: [DEFAULT_TITLE_ID, ...owned.map((t) => t.titleId)], current: wornTitle(user?.titleId ?? null) };
}

/** Porte un titre (null : aucun). Faux si le joueur ne le possède pas. */
export async function setUserTitle(userId: string, titleId: string | null): Promise<boolean> {
  if (titleId && titleId !== DEFAULT_TITLE_ID && !(await prisma.userTitle.findUnique({ where: { userId_titleId: { userId, titleId } } }))) return false;
  await prisma.user.update({ where: { id: userId }, data: { titleId: titleId ?? NO_TITLE } });
  return true;
}

/** Succès obtenus que le joueur n'a pas encore vus. */
export function countUnseenAchievements(userId: string): Promise<number> {
  return prisma.userAchievement.count({ where: { userId, seenAt: null } });
}

export async function markAchievementsSeen(userId: string): Promise<void> {
  await prisma.userAchievement.updateMany({ where: { userId, seenAt: null }, data: { seenAt: new Date() } });
}

/** Ce que le rattrapage a fait, ou ferait, pour un compte. */
export interface BackfillResult {
  games: number;
  /** Parties illisibles, laissées de côté. */
  skipped: number;
  counters: Counters;
  unlocked: string[];
}

/**
 * Recalcule les compteurs d'un compte depuis ses parties et lui donne ce qu'il aurait dû obtenir.
 * Ne retire jamais un succès. Relançable : les compteurs sont remis à zéro, les déblocages déjà là ignorés.
 * Le verrou sur la ligne `user` fait attendre `saveGame`, dont les clés étrangères la lisent : une partie
 * qui se termine pendant le recalcul n'est ni perdue ni comptée deux fois.
 */
export async function backfillAchievements(userId: string, { dryRun = false } = {}): Promise<BackfillResult> {
  return prisma.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT 1 FROM "user" WHERE "id" = ${userId} FOR UPDATE`;
      const games = await tx.game.findMany({ where: { players: { some: { userId } } }, orderBy: { endedAt: "asc" }, include: GAME_CONTENT });
      const owned = new Set((await tx.userAchievement.findMany({ where: { userId }, select: { achievementId: true } })).map((a) => a.achievementId));
      let counters: Counters = {};
      const grants: Parameters<typeof grantUnlocks>[1] = [];
      const now = new Date();
      const earn = (earned: Unlock[], gameId: string | null, unlockedAt: Date) => {
        for (const unlock of earned) {
          owned.add(unlock.achievementId);
          grants.push({ userId, unlock, gameId, backfilledAt: { unlockedAt, seenAt: now } });
        }
      };

      let skipped = 0;
      for (const game of games) {
        try {
          const { settings, standings, history } = rebuildGame(game);
          // Un compte supprimé garde son Elo sur la ligne : il comptait bien comme compte dans cette partie.
          const accounts = game.players.filter((p) => p.userId || p.ratingBefore !== null).length;
          const source = { solo: game.solo, settings, endedAt: game.endedAt.getTime(), rated: !game.solo && accounts >= 2, accounts, standings, history };
          const facts = factsOf(source, game.players.find((p) => p.userId === userId)!.playerKey);
          if (!facts) continue;
          const after: Record<string, number> = { ...counters };
          for (const [key, value] of Object.entries(countersDelta(facts))) after[key] = (after[key] ?? 0) + value;
          const earned = evaluateAchievements(facts, after, owned);
          counters = after;
          earn(earned, game.id, game.endedAt);
        } catch (err) {
          console.error(`[succès] partie ${game.id} illisible`, err);
          skipped += 1;
        }
      }
      // Amitiés et guildes d'avant les succès : aucun événement ne les débloquerait.
      earn(evaluateAchievements(null, { ...counters, ...(await sourceCounters(tx, userId)) }, owned), null, now);

      if (!dryRun) {
        await tx.userCounter.deleteMany({ where: { userId } });
        await tx.userCounter.createMany({ data: Object.entries(counters).map(([key, value]) => ({ userId, key, value })) });
        await grantUnlocks(tx, grants);
      }
      return { games: games.length, skipped, counters, unlocked: grants.map((g) => g.unlock.achievementId) };
    },
    { timeout: 120_000 },
  );
}

/* ------------------------------------------------------------------ */
/* Lecture : rapport d'une partie enregistrée                           */
/* ------------------------------------------------------------------ */

export interface StoredGameReport {
  id: string;
  code: string | null;
  solo: boolean;
  settings: GameSettings;
  endedAt: Date;
  report: GameReport;
  /** Clé de joueur de chaque compte présent (pour retrouver « moi »). */
  playerKeyByUser: Record<string, string>;
  /** Effet sur l'Elo des joueurs classés, par clé de joueur (sans l'Elo caché des joueurs en placement). */
  ratings: Record<string, RatingChange>;
}

const GAME_CONTENT = {
  players: { orderBy: { rank: "asc" } },
  questions: { orderBy: [{ position: "asc" }, { forPlayerKey: "asc" }], include: { answers: true } },
} satisfies Prisma.GameInclude;

type StoredGame = Prisma.GameGetPayload<{ include: typeof GAME_CONTENT }>;

/** Bombes d'une manche. Le drapeau de secours n'est pas stocké : la bombe de secours se recalcule depuis la graine (voir `GameEngine`). */
function bombsOf(
  seed: string,
  index: number,
  draw: Extract<Puzzle, { game: "bomb" }>,
  personal: NonNullable<RoundRecord["personal"]>,
): NonNullable<RoundRecord["bombs"]> {
  return Object.fromEntries(
    Object.values(personal).map(({ question, authorId }) => [authorId, { expr: question.text, fallback: fallbackBomb(draw, `${seed}:${index}:${authorId}`).expr === question.text }]),
  );
}

/**
 * Remet une partie enregistrée sous la forme qu'elle avait à sa fin. `spared` et, hors course de vitesse,
 * `scorers` ne sont pas stockés : ils restent vides.
 */
function rebuildGame(game: StoredGame): { settings: GameSettings; standings: Standing[]; history: RoundRecord[] } {
  const keyByRow = new Map(game.players.map((p) => [p.id, p.playerKey]));
  const standings: Standing[] = game.players.map((p) => {
    const player: PlayerState = {
      id: p.playerKey,
      name: p.displayName,
      score: p.score,
      alive: p.alive,
      eliminatedAt: p.eliminatedAt,
      connected: true,
      answered: p.answered,
      correct: p.correct,
      correctTimeMs: p.correctTimeMs,
      streak: 0,
      bestStreak: p.bestStreak,
    };
    return { rank: p.rank, player };
  });
  // Les parties d'avant les jeux n'ont pas `game` dans leurs réglages : la colonne fait foi.
  const settings = { ...(game.settings as unknown as GameSettings), game: game.game as GameId };
  const toQuestion = (q: StoredGame["questions"][number]): Question => ({
    index: q.position,
    text: q.text,
    answer: q.answer,
    solution: q.solution ?? String(q.answer),
    // À la bombe, `puzzle` est le tirage de la manche ; le calcul de chacun est un calcul standard.
    puzzle: q.forPlayerKey ? { game: "standard" } : ((q.puzzle as Puzzle | null) ?? { game: "standard" }),
    tags: q.tags as OpTag[],
    difficulty: q.difficulty as Difficulty,
  });
  // Les lignes d'une même manche (une par destinataire à la bombe) sont regroupées.
  const byPosition = new Map<number, StoredGame["questions"]>();
  for (const q of game.questions) byPosition.set(q.position, [...(byPosition.get(q.position) ?? []), q]);
  const history: RoundRecord[] = [...byPosition.values()].map((rows) => {
    const q = rows[0]!;
    const answers = rows
      .flatMap((row) => row.answers)
      .map((a): AnswerRecord => ({ playerId: keyByRow.get(a.playerId) ?? "?", value: a.value, text: a.text, correct: a.correct, timeMs: a.timeMs }))
      .sort((a, b) => a.timeMs - b.timeMs);
    // Le bon compte : personne n'a trouvé, les plus proches l'emportent (recalculé, comme pendant la partie).
    if (!q.activePlayerKey && game.players.length > 1) {
      for (const a of closestAnswers(GAMES[settings.game], toQuestion(q), answers)) a.closest = true;
    }
    // Course de vitesse : le point revient à la première bonne réponse arrivée, sinon à la plus proche.
    const first = settings.mode === "speed-race" ? (answers.find((a) => a.correct) ?? answers.find((a) => a.closest)) : undefined;
    const draw = q.puzzle as Puzzle | null;
    const personal = q.forPlayerKey
      ? Object.fromEntries(rows.map((row) => [row.forPlayerKey, { question: toQuestion(row), authorId: row.authorPlayerKey ?? "?" }]))
      : undefined;
    return {
      index: q.position,
      question:
        personal && draw?.game === "bomb"
          ? { index: q.position, text: draw.tiles.join(" "), answer: 0, solution: "", puzzle: draw, tags: [], difficulty: settings.difficulty }
          : toQuestion(q),
      ...(personal ? { personal, ...(draw?.game === "bomb" ? { bombs: bombsOf(game.seed, q.position, draw, personal) } : {}) } : {}),
      activePlayerId: q.activePlayerKey,
      startedAt: 0,
      timeLimitMs: q.timeLimitMs,
      answers,
      eliminated: [],
      scorers: first ? [first.playerId] : [],
      spared: false,
    };
  });

  return { settings, standings, history };
}

export async function loadGameReport(id: string): Promise<StoredGameReport | null> {
  const game = await prisma.game.findUnique({ where: { id }, include: GAME_CONTENT });
  if (!game) return null;
  const { settings, standings, history } = rebuildGame(game);

  const playerKeyByUser: Record<string, string> = {};
  for (const p of game.players) if (p.userId) playerKeyByUser[p.userId] = p.playerKey;
  const ratings: Record<string, RatingChange> = {};
  for (const p of game.players)
    if (p.ratingBefore != null && p.ratingDelta != null && p.ratingGames != null)
      ratings[p.playerKey] = describeRatingChange(p.ratingBefore, p.ratingBefore + p.ratingDelta, p.ratingGames);

  return {
    id: game.id,
    code: game.code,
    solo: game.solo,
    settings,
    endedAt: game.endedAt,
    report: buildReport(standings, history),
    playerKeyByUser,
    ratings,
  };
}

/* ------------------------------------------------------------------ */
/* Lecture : tableau de bord d'un joueur                                */
/* ------------------------------------------------------------------ */

export interface DashboardData {
  stats: {
    gamesPlayed: number;
    onlineGames: number;
    soloGames: number;
    wins: number;
    answered: number;
    correct: number;
    accuracy: number;
    avgCorrectMs: number | null;
    bestStreak: number;
    bestSurvival: number;
  };
  recent: {
    gameId: string;
    endedAt: string;
    solo: boolean;
    game: string;
    mode: string;
    difficulty: number;
    rank: number;
    players: number;
    score: number;
    accuracy: number;
    avgCorrectMs: number | null;
    /** Effet sur l'Elo (null si la partie n'était pas classée) */
    rating: RatingChange | null;
  }[];
  /** Elo par jeu, mode et difficulté, là où le joueur a déjà joué une partie classée ; `rating` null pendant le placement. */
  ratings: { game: string; mode: string; difficulty: number; rating: number | null; games: number }[];
  byOperation: { tag: OpTag; attempts: number; correct: number; avgCorrectMs: number | null }[];
  /** Totaux par jeu et difficulté (toutes les parties du joueur), pour le tableau filtrable du tableau de bord. */
  breakdown: DashboardBreakdown[];
}

export interface DashboardBreakdown {
  game: string;
  difficulty: number;
  games: number;
  online: number;
  /** Victoires en ligne (1re place d'une partie à plusieurs), comme `UserStats.wins` */
  wins: number;
  answered: number;
  correct: number;
  correctTimeMs: number;
  bestStreak: number;
  bestSurvival: number;
}

/** Jeux comptés dans les statistiques par opération du tableau de bord. */
const OPERATION_STATS_GAMES: GameId[] = GAME_IDS.filter((g) => GAMES[g].operationStats);

export async function getDashboard(userId: string): Promise<DashboardData> {
  const [s, recentRows, answers, ratingRows, breakdownRows] = await Promise.all([
    prisma.userStats.findUnique({ where: { userId } }),
    prisma.gamePlayer.findMany({
      where: { userId },
      orderBy: { game: { endedAt: "desc" } },
      take: 30,
      include: { game: { select: { id: true, endedAt: true, solo: true, game: true, mode: true, difficulty: true, _count: { select: { players: true } } } } },
    }),
    prisma.answer.findMany({
      // Les stats par opération n'ont de sens que pour les jeux dont les étiquettes sont des opérations.
      where: { player: { userId, game: { game: { in: OPERATION_STATS_GAMES } } } },
      orderBy: { player: { game: { endedAt: "desc" } } },
      take: 3000,
      select: { correct: true, timeMs: true, question: { select: { tags: true } } },
    }),
    prisma.rating.findMany({
      where: { userId },
      orderBy: [{ game: "asc" }, { mode: "asc" }, { difficulty: "asc" }],
      select: { game: true, mode: true, difficulty: true, rating: true, games: true },
    }),
    // Mêmes règles que les incréments de `UserStats` dans `saveGame`, ventilées par jeu et difficulté.
    prisma.$queryRaw<
      { game: string; difficulty: number; games: number; online: number; wins: number; answered: number; correct: number; correctTimeMs: bigint; bestStreak: number; bestSurvival: number }[]
    >`
      SELECT g."game", g."difficulty",
        count(*)::int AS "games",
        count(*) FILTER (WHERE NOT g."solo")::int AS "online",
        count(*) FILTER (WHERE p."rank" = 1 AND (SELECT count(*) FROM "game_player" o WHERE o."gameId" = g."id") > 1)::int AS "wins",
        coalesce(sum(p."answered"), 0)::int AS "answered",
        coalesce(sum(p."correct"), 0)::int AS "correct",
        coalesce(sum(p."correctTimeMs"), 0)::bigint AS "correctTimeMs",
        coalesce(max(p."bestStreak"), 0)::int AS "bestStreak",
        coalesce(max(CASE WHEN g."mode" = 'battle-royale' THEN p."score" ELSE 0 END), 0)::int AS "bestSurvival"
      FROM "game_player" p
      JOIN "game" g ON g."id" = p."gameId"
      WHERE p."userId" = ${userId}
      GROUP BY g."game", g."difficulty"
      ORDER BY g."game", g."difficulty"`,
  ]);

  const ops = new Map<OpTag, { tag: OpTag; attempts: number; correct: number; time: number }>();
  for (const a of answers) {
    for (const tag of a.question.tags as OpTag[]) {
      const o = ops.get(tag) ?? { tag, attempts: 0, correct: 0, time: 0 };
      o.attempts += 1;
      if (a.correct) {
        o.correct += 1;
        o.time += a.timeMs;
      }
      ops.set(tag, o);
    }
  }

  const answered = s?.answered ?? 0;
  const correct = s?.correct ?? 0;
  return {
    stats: {
      gamesPlayed: s?.gamesPlayed ?? 0,
      onlineGames: s?.onlineGames ?? 0,
      soloGames: s?.soloGames ?? 0,
      wins: s?.wins ?? 0,
      answered,
      correct,
      accuracy: answered ? correct / answered : 0,
      avgCorrectMs: correct ? Math.round(Number(s?.totalCorrectTimeMs ?? 0) / correct) : null,
      bestStreak: s?.bestStreak ?? 0,
      bestSurvival: s?.bestSurvival ?? 0,
    },
    recent: recentRows.map((r) => ({
      gameId: r.game.id,
      endedAt: r.game.endedAt.toISOString(),
      solo: r.game.solo,
      game: r.game.game,
      mode: r.game.mode,
      difficulty: r.game.difficulty,
      rank: r.rank,
      players: r.game._count.players,
      score: r.score,
      accuracy: r.answered ? r.correct / r.answered : 0,
      avgCorrectMs: r.correct ? Math.round(r.correctTimeMs / r.correct) : null,
      rating:
        r.ratingBefore != null && r.ratingDelta != null && r.ratingGames != null
          ? describeRatingChange(r.ratingBefore, r.ratingBefore + r.ratingDelta, r.ratingGames)
          : null,
    })),
    // L'Elo caché ne quitte jamais la base.
    ratings: ratingRows.map((r) => ({ ...r, rating: r.games >= PLACEMENT_GAMES ? r.rating : null })),
    byOperation: [...ops.values()].map((o) => ({
      tag: o.tag,
      attempts: o.attempts,
      correct: o.correct,
      avgCorrectMs: o.correct ? Math.round(o.time / o.correct) : null,
    })),
    breakdown: breakdownRows.map((r) => ({ ...r, correctTimeMs: Number(r.correctTimeMs) })),
  };
}

/* ------------------------------------------------------------------ */
/* Classement : meilleurs Elo d'un jeu, d'un mode et d'une difficulté   */
/* ------------------------------------------------------------------ */

/** Joueurs affichés dans le classement. */
export const LEADERBOARD_SIZE = 100;
/** Résultats au plus pour une recherche par pseudo. */
export const LEADERBOARD_SEARCH_LIMIT = 20;

export interface LeaderboardEntry {
  /** Place dans le classement (ex æquo : même place, la suivante est sautée) */
  rank: number;
  userId: string;
  name: string;
  /** Titre porté */
  title: string | null;
  rating: number;
  /** Parties classées dans ce jeu, ce mode et cette difficulté */
  games: number;
  /** Parties classées gagnées (1re place) dans ce jeu, ce mode et cette difficulté */
  wins: number;
}

export interface LeaderboardData {
  top: LeaderboardEntry[];
  /** Joueurs classés (placement terminé) dans ce jeu, ce mode et cette difficulté */
  total: number;
  /** Place du joueur connecté, null s'il n'est pas encore classé */
  me: LeaderboardEntry | null;
  /** Parties de placement déjà jouées par le joueur connecté (null s'il est classé, ou sans aucune partie classée) */
  mePlacement: number | null;
}

/** Un classement : un jeu, un mode et une difficulté. */
export interface Board {
  game: string;
  mode: string;
  difficulty: number;
}

/** Seuls les joueurs sortis du placement sont classés : l'Elo caché ne quitte jamais la base. */
const rankedWhere = (board: Board) => ({ ...board, games: { gte: PLACEMENT_GAMES } });
const leaderboardOrder = [{ rating: "desc" }, { games: "desc" }, { userId: "asc" }] satisfies Prisma.RatingOrderByWithRelationInput[];
const leaderboardSelect = { userId: true, rating: true, games: true, user: { select: { name: true, titleId: true } } } as const;
type LeaderboardRow = { userId: string; rating: number; games: number; user: { name: string; titleId: string | null } };

/** Place d'un Elo : 1 + nombre de joueurs classés strictement au-dessus. */
function rankOf(board: Board, rating: number): Promise<number> {
  return prisma.rating.count({ where: { ...rankedWhere(board), rating: { gt: rating } } }).then((n) => n + 1);
}

/** Victoires (1re place d'une partie classée) de chaque joueur dans ce classement. */
async function winsOf(board: Board, userIds: string[]): Promise<Map<string, number>> {
  if (!userIds.length) return new Map();
  const rows = await prisma.gamePlayer.groupBy({
    by: ["userId"],
    where: { userId: { in: userIds }, rank: 1, ratingGames: { not: null }, game: board },
    _count: { _all: true },
  });
  return new Map(rows.map((r) => [r.userId!, r._count._all]));
}

const toEntry = (r: LeaderboardRow, rank: number, wins: Map<string, number>): LeaderboardEntry => ({
  rank,
  userId: r.userId,
  name: r.user.name,
  title: wornTitle(r.user.titleId),
  rating: r.rating,
  games: r.games,
  wins: wins.get(r.userId) ?? 0,
});

/** Top 100 d'un classement, avec la place (ou l'avancée du placement) du joueur connecté. */
export async function getLeaderboard(board: Board, viewerId?: string): Promise<LeaderboardData> {
  const [rows, total, mine] = await Promise.all([
    prisma.rating.findMany({ where: rankedWhere(board), orderBy: leaderboardOrder, take: LEADERBOARD_SIZE, select: leaderboardSelect }),
    prisma.rating.count({ where: rankedWhere(board) }),
    viewerId ? prisma.rating.findUnique({ where: { userId_game_mode_difficulty: { userId: viewerId, ...board } }, select: leaderboardSelect }) : null,
  ]);
  const ranked = mine && mine.games >= PLACEMENT_GAMES ? mine : null;
  const wins = await winsOf(board, [...rows.map((r) => r.userId), ...(ranked ? [ranked.userId] : [])]);

  // Classement « 1, 2, 2, 4 » : un ex æquo prend la place du premier de son Elo.
  const top: LeaderboardEntry[] = [];
  rows.forEach((r, i) => {
    const prev = top[i - 1];
    top.push(toEntry(r, prev && prev.rating === r.rating ? prev.rank : i + 1, wins));
  });

  const me = ranked ? (top.find((e) => e.userId === ranked.userId) ?? toEntry(ranked, await rankOf(board, ranked.rating), wins)) : null;
  return { top, total, me, mePlacement: mine && !ranked ? mine.games : null };
}

/** Joueurs classés dont le pseudo contient `query` (insensible à la casse), avec leur place, même hors du top 100. */
export async function searchLeaderboard(board: Board, query: string): Promise<LeaderboardEntry[]> {
  const q = query.trim();
  if (!q) return [];
  const rows = await prisma.rating.findMany({
    where: { ...rankedWhere(board), user: { name: { contains: q, mode: "insensitive" } } },
    orderBy: leaderboardOrder,
    take: LEADERBOARD_SEARCH_LIMIT,
    select: leaderboardSelect,
  });
  const [wins, ranks] = await Promise.all([
    winsOf(board, rows.map((r) => r.userId)),
    Promise.all(rows.map((r) => rankOf(board, r.rating))),
  ]);
  return rows.map((r, i) => toEntry(r, ranks[i]!, wins));
}

/** Classement d'un joueur dans un jeu, un mode et une difficulté où il a fini son placement. */
export interface PlayerRanking {
  game: string;
  mode: string;
  difficulty: number;
  rank: number;
  /** Joueurs classés dans ce jeu, ce mode et cette difficulté */
  total: number;
  rating: number;
  games: number;
  wins: number;
}

export interface PlayerProfile {
  id: string;
  name: string;
  /** Titre porté */
  title: string | null;
  /** Uniquement là où le placement est terminé : l'Elo caché ne quitte jamais la base. */
  rankings: PlayerRanking[];
  /** Succès obtenus, et les plus prestigieux d'entre eux. */
  achievements: { count: number; best: { id: string; tier: AchievementTier }[] };
  /** Lien avec le joueur connecté, null pour un visiteur */
  friendship: FriendshipState | null;
}

/** Succès montrés sur le profil public. */
const PROFILE_ACHIEVEMENTS = 6;
const TIER_ORDER: readonly AchievementTier[] = ["platinum", "gold", "silver", "bronze"];

/**
 * Profil public d'un joueur, ouvert depuis le classement : ce que le classement rend déjà public
 * (pseudo, Elo, place, parties, % de victoires) et ses succès, jamais l'e-mail ni les statistiques privées.
 */
export async function getPlayerProfile(userId: string, viewerId?: string): Promise<PlayerProfile | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      titleId: true,
      ratings: { where: { games: { gte: PLACEMENT_GAMES } }, orderBy: [{ game: "asc" }, { mode: "asc" }, { difficulty: "asc" }] },
      achievements: { select: { achievementId: true }, orderBy: { unlockedAt: "desc" } },
    },
  });
  if (!user) return null;
  const owned = new Set(user.achievements.map((a) => a.achievementId));
  const best = ACHIEVEMENTS.filter((a) => owned.has(a.id))
    .sort((a, b) => TIER_ORDER.indexOf(a.tier) - TIER_ORDER.indexOf(b.tier))
    .slice(0, PROFILE_ACHIEVEMENTS)
    .map((a) => ({ id: a.id, tier: a.tier }));
  const [rankings, friendship] = await Promise.all([
    Promise.all(
      user.ratings.map(async (r) => {
        const board: Board = { game: r.game, mode: r.mode, difficulty: r.difficulty };
        const [rank, total, wins] = await Promise.all([rankOf(board, r.rating), prisma.rating.count({ where: rankedWhere(board) }), winsOf(board, [userId])]);
        return { game: r.game, mode: r.mode, difficulty: r.difficulty, rank, total, rating: r.rating, games: r.games, wins: wins.get(userId) ?? 0 };
      }),
    ),
    viewerId ? friendshipState(viewerId, userId) : null,
  ]);
  return { id: user.id, name: user.name, title: wornTitle(user.titleId), rankings, achievements: { count: owned.size, best }, friendship };
}

/* ------------------------------------------------------------------ */
/* Amis                                                                 */
/* ------------------------------------------------------------------ */

/** Demandes d'ami en attente qu'un joueur peut avoir envoyées en même temps (limite le spam). */
const MAX_PENDING_REQUESTS = 50;
/** Durée de validité d'une invitation à une partie, en ms. */
export const INVITE_TTL_MS = 10 * 60 * 1000;
/** Invitations en cours d'un même joueur vers un même destinataire (une par lobby) : au-delà, les plus anciennes sautent. */
const MAX_INVITES_PER_PAIR = 5;

export interface FriendSummary {
  id: string;
  name: string;
  /** Adresse de la photo de profil, null sans photo */
  image: string | null;
  gamesPlayed: number;
  /** Victoires en ligne */
  wins: number;
  /** Part de bonnes réponses (0 à 1), null sans aucune réponse */
  accuracy: number | null;
}

export interface FriendRequestSummary {
  id: string;
  name: string;
  image: string | null;
}

export interface FriendsData {
  friends: FriendSummary[];
  /** Demandes reçues, à accepter ou refuser */
  incoming: FriendRequestSummary[];
  /** Demandes envoyées, pas encore acceptées */
  outgoing: FriendRequestSummary[];
}

export type FriendRequestResult =
  | { status: "sent" | "accepted" | "already-sent" | "already-friends"; name: string }
  | { status: "not-found" | "ambiguous" | "self" | "too-many" };

const friendUserSelect = {
  id: true,
  name: true,
  image: true,
  stats: { select: { gamesPlayed: true, wins: true, answered: true, correct: true } },
} as const;

/** Amis, demandes reçues et demandes envoyées d'un joueur. */
export async function getFriends(userId: string): Promise<FriendsData> {
  const rows = await prisma.friendship.findMany({
    where: { OR: [{ requesterId: userId }, { addresseeId: userId }] },
    include: { requester: { select: friendUserSelect }, addressee: { select: friendUserSelect } },
  });
  const data: FriendsData = { friends: [], incoming: [], outgoing: [] };
  for (const r of rows) {
    const other = r.requesterId === userId ? r.addressee : r.requester;
    if (r.status === "accepted") {
      const s = other.stats;
      data.friends.push({
        id: other.id,
        name: other.name,
        image: other.image,
        gamesPlayed: s?.gamesPlayed ?? 0,
        wins: s?.wins ?? 0,
        accuracy: s?.answered ? s.correct / s.answered : null,
      });
    } else if (r.requesterId === userId) data.outgoing.push({ id: other.id, name: other.name, image: other.image });
    else data.incoming.push({ id: other.id, name: other.name, image: other.image });
  }
  const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);
  data.friends.sort(byName);
  data.incoming.sort(byName);
  data.outgoing.sort(byName);
  return data;
}

/**
 * Envoie une demande d'ami à partir d'un pseudo ou d'un e-mail.
 * Si l'autre joueur nous avait déjà fait une demande, elle est acceptée directement.
 * Les pseudos n'étant pas uniques, un pseudo partagé par plusieurs comptes renvoie « ambiguous ».
 */
export async function sendFriendRequest(fromId: string, handle: string): Promise<FriendRequestResult> {
  const found = await findUserByHandle(handle);
  return "status" in found ? found : requestFriendship(fromId, found);
}

/** Compte désigné par un pseudo (insensible à la casse) ou un e-mail ; « ambiguous » si plusieurs comptes portent ce pseudo. */
async function findUserByHandle(handle: string): Promise<{ id: string; name: string } | { status: "not-found" | "ambiguous" }> {
  const h = handle.trim();
  const matches = await prisma.user.findMany({
    where: h.includes("@") ? { email: { equals: h, mode: "insensitive" } } : { name: { equals: h, mode: "insensitive" } },
    select: { id: true, name: true },
    take: 2,
  });
  if (matches.length === 0) return { status: "not-found" };
  if (matches.length > 1) return { status: "ambiguous" };
  return matches[0]!;
}

/** Envoie une demande d'ami à un joueur désigné par son id (depuis son profil public). */
export async function sendFriendRequestTo(fromId: string, targetId: string): Promise<FriendRequestResult> {
  const target = await prisma.user.findUnique({ where: { id: targetId }, select: { id: true, name: true } });
  if (!target) return { status: "not-found" };
  return requestFriendship(fromId, target);
}

async function requestFriendship(fromId: string, target: { id: string; name: string }): Promise<FriendRequestResult> {
  if (target.id === fromId) return { status: "self" };

  const existing = await prisma.friendship.findFirst({
    where: {
      OR: [
        { requesterId: fromId, addresseeId: target.id },
        { requesterId: target.id, addresseeId: fromId },
      ],
    },
  });
  if (existing?.status === "accepted") return { status: "already-friends", name: target.name };
  if (existing && existing.requesterId === fromId) return { status: "already-sent", name: target.name };
  if (existing) {
    await prisma.friendship.update({ where: { id: existing.id }, data: { status: "accepted", acceptedAt: new Date() } });
    await grantSocialAchievements([fromId, target.id]);
    return { status: "accepted", name: target.name };
  }

  const pending = await prisma.friendship.count({ where: { requesterId: fromId, status: "pending" } });
  if (pending >= MAX_PENDING_REQUESTS) return { status: "too-many" };
  try {
    await prisma.friendship.create({ data: { requesterId: fromId, addresseeId: target.id } });
  } catch (err) {
    // Double clic : la demande existe déjà.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return { status: "already-sent", name: target.name };
    throw err;
  }
  return { status: "sent", name: target.name };
}

/** Accepte la demande que `fromId` a envoyée à `userId`. Renvoie false s'il n'y en a pas. */
export async function acceptFriendRequest(userId: string, fromId: string): Promise<boolean> {
  const { count } = await prisma.friendship.updateMany({
    where: { requesterId: fromId, addresseeId: userId, status: "pending" },
    data: { status: "accepted", acceptedAt: new Date() },
  });
  if (count > 0) await grantSocialAchievements([userId, fromId]);
  return count > 0;
}

/** Retire un ami, refuse ou annule une demande : supprime le lien dans les deux sens, et les invitations entre eux. */
export async function removeFriendship(userId: string, otherId: string): Promise<void> {
  await prisma.$transaction([
    prisma.friendship.deleteMany({
      where: {
        OR: [
          { requesterId: userId, addresseeId: otherId },
          { requesterId: otherId, addresseeId: userId },
        ],
      },
    }),
    prisma.gameInvite.deleteMany({
      where: {
        OR: [
          { fromId: userId, toId: otherId },
          { fromId: otherId, toId: userId },
        ],
      },
    }),
  ]);
}

/** Lien entre le joueur connecté et un autre : `outgoing` = demande envoyée, `incoming` = demande reçue. */
export type FriendshipState = "self" | "none" | "outgoing" | "incoming" | "friends";

async function friendshipState(viewerId: string, otherId: string): Promise<FriendshipState> {
  if (viewerId === otherId) return "self";
  const row = await prisma.friendship.findFirst({
    where: {
      OR: [
        { requesterId: viewerId, addresseeId: otherId },
        { requesterId: otherId, addresseeId: viewerId },
      ],
    },
    select: { requesterId: true, status: true },
  });
  if (!row) return "none";
  if (row.status === "accepted") return "friends";
  return row.requesterId === viewerId ? "outgoing" : "incoming";
}

async function areFriends(a: string, b: string): Promise<boolean> {
  const row = await prisma.friendship.findFirst({
    where: {
      status: "accepted",
      OR: [
        { requesterId: a, addresseeId: b },
        { requesterId: b, addresseeId: a },
      ],
    },
    select: { id: true },
  });
  return !!row;
}

/** Ne garde que les `MAX_INVITES_PER_PAIR` invitations les plus récentes de `fromId` vers chacun de `toIds`. */
async function trimGameInvites(fromId: string, toIds: string[]): Promise<void> {
  if (!toIds.length) return;
  const rows = await prisma.gameInvite.findMany({
    where: { fromId, toId: { in: toIds } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { id: true, toId: true },
  });
  const kept = new Map<string, number>();
  const extra: string[] = [];
  for (const r of rows) {
    const n = (kept.get(r.toId) ?? 0) + 1;
    kept.set(r.toId, n);
    if (n > MAX_INVITES_PER_PAIR) extra.push(r.id);
  }
  if (extra.length) await prisma.gameInvite.deleteMany({ where: { id: { in: extra } } });
}

/**
 * Invite un ami dans un lobby. Chaque lobby a sa propre invitation (inviter de nouveau au même lobby la renouvelle),
 * pour que plusieurs invitations du même ami restent visibles. Renvoie false si ce n'est pas un ami.
 */
/** Type de salle visée par une invitation : lobby classique ou donjon. */
export type GameInviteKind = "game" | "dungeon";

export async function sendGameInvite(fromId: string, toId: string, code: string, now: Date, kind: GameInviteKind = "game"): Promise<boolean> {
  if (fromId === toId || !(await areFriends(fromId, toId))) return false;
  const expiresAt = new Date(now.getTime() + INVITE_TTL_MS);
  await prisma.gameInvite.upsert({
    where: { fromId_toId_code: { fromId, toId, code } },
    create: { fromId, toId, code, kind, createdAt: now, expiresAt },
    update: { createdAt: now, expiresAt, kind },
  });
  await trimGameInvites(fromId, [toId]);
  return true;
}

export interface GameInviteSummary {
  id: string;
  code: string;
  fromName: string;
  /** Nom de la guilde quand c'est un lobby de guilde, null pour une invitation entre amis */
  guildName: string | null;
  /** Lobby classique ou donjon : la page à ouvrir pour rejoindre */
  kind: GameInviteKind;
  createdAt: string;
}

/** Invitations encore valables reçues par un joueur ; efface au passage les siennes qui ont expiré. */
export async function getGameInvites(userId: string, now: Date): Promise<GameInviteSummary[]> {
  await prisma.gameInvite.deleteMany({ where: { toId: userId, expiresAt: { lte: now } } });
  const rows = await prisma.gameInvite.findMany({
    where: { toId: userId },
    orderBy: { createdAt: "desc" },
    include: { from: { select: { name: true } }, guild: { select: { name: true } } },
  });
  return rows.map((r) => ({
    id: r.id,
    code: r.code,
    fromName: r.from.name,
    guildName: r.guild?.name ?? null,
    kind: r.kind === "dungeon" ? "dungeon" : "game",
    createdAt: r.createdAt.toISOString(),
  }));
}

/** Supprime une invitation reçue (rejointe ou ignorée). */
export async function dismissGameInvite(userId: string, inviteId: string): Promise<void> {
  await prisma.gameInvite.deleteMany({ where: { id: inviteId, toId: userId } });
}

/** Supprime toutes les invitations vers le lobby `code` : appelé par le serveur de jeu quand la partie démarre ou que le lobby ferme. */
export async function clearLobbyInvites(code: string): Promise<void> {
  await prisma.gameInvite.deleteMany({ where: { code } });
}

/* ------------------------------------------------------------------ */
/* Guildes                                                              */
/* ------------------------------------------------------------------ */

export * from "./guild";

export type GuildRoleName = "leader" | "member";

export interface GuildMemberSummary {
  id: string;
  name: string;
  image: string | null;
  role: GuildRoleName;
  joinedAt: string;
  /** Site ouvert il y a moins de `GUILD_ONLINE_MS` (toujours vrai pour soi-même) */
  online: boolean;
}

/** Invitation envoyée par la guilde, pas encore acceptée. */
export interface GuildPendingInvite {
  id: string;
  userId: string;
  name: string;
  /** Membre qui a invité (null si son compte a été supprimé) */
  fromName: string | null;
  createdAt: string;
}

export interface GuildView {
  id: string;
  name: string;
  crest: string | null;
  createdAt: string;
  myRole: GuildRoleName;
  /** Chef d'abord, puis par pseudo */
  members: GuildMemberSummary[];
  invites: GuildPendingInvite[];
  /** Amis sans guilde et pas encore invités, proposés en un clic */
  invitableFriends: FriendRequestSummary[];
}

/** Invitation à entrer dans une guilde, reçue par un joueur. */
export interface ReceivedGuildInvite {
  id: string;
  guildId: string;
  guildName: string;
  crest: string | null;
  members: number;
  fromName: string | null;
  createdAt: string;
}

export type GuildError =
  | "not-member"
  | "not-leader"
  | "name-invalid"
  | "name-taken"
  | "in-guild"
  | "full"
  | "not-found";

export type GuildInviteResult =
  | { status: "sent" | "already-invited"; name: string }
  | { status: "not-found" | "ambiguous" | "self" | "already-member" | "target-in-guild" | "full" | "too-many" | "not-member" };

/**
 * Violation d'unicité Prisma portant sur `field`. Lu par le code et les champs plutôt que par `instanceof` :
 * empaqueté par Next, le client peut exister en deux exemplaires et la classe d'erreur ne correspond plus.
 */
function isUniqueError(err: unknown, field: string): boolean {
  if (typeof err !== "object" || err === null || (err as { code?: unknown }).code !== "P2002") return false;
  const target = (err as { meta?: { target?: unknown } }).meta?.target;
  return Array.isArray(target) ? target.includes(field) : String(target ?? "").includes(field);
}

/** Clé d'unicité d'un nom de guilde : minuscules, sans accents. */
const guildNameKey = (name: string) => name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

async function sameGuild(a: string, b: string): Promise<boolean> {
  const rows = await prisma.guildMember.findMany({ where: { userId: { in: [a, b] } }, select: { guildId: true } });
  return rows.length === 2 && rows[0]!.guildId === rows[1]!.guildId;
}

/** Guilde du joueur (membres, invitations en cours, amis à inviter), null s'il n'en a pas. */
export async function getMyGuild(userId: string, now: Date): Promise<GuildView | null> {
  const me = await prisma.guildMember.findUnique({ where: { userId }, select: { guildId: true, role: true } });
  if (!me) return null;
  const [guild, friendships] = await Promise.all([
    prisma.guild.findUnique({
      where: { id: me.guildId },
      include: {
        members: { include: { user: { select: { id: true, name: true, image: true } } } },
        invites: { orderBy: { createdAt: "desc" }, include: { to: { select: { id: true, name: true } }, from: { select: { name: true } } } },
      },
    }),
    prisma.friendship.findMany({
      where: { status: "accepted", OR: [{ requesterId: userId }, { addresseeId: userId }] },
      include: {
        requester: { select: { id: true, name: true, image: true, guildMember: { select: { guildId: true } } } },
        addressee: { select: { id: true, name: true, image: true, guildMember: { select: { guildId: true } } } },
      },
    }),
  ]);
  if (!guild) return null;

  const members: GuildMemberSummary[] = guild.members.map((m) => ({
    id: m.user.id,
    name: m.user.name,
    image: m.user.image,
    role: m.role,
    joinedAt: m.joinedAt.toISOString(),
    online: m.userId === userId || (!!m.lastSeenAt && now.getTime() - m.lastSeenAt.getTime() < GUILD_ONLINE_MS),
  }));
  members.sort((a, b) => (a.role === b.role ? a.name.localeCompare(b.name) : a.role === "leader" ? -1 : 1));

  const invited = new Set(guild.invites.map((i) => i.toId));
  const invitableFriends = friendships
    .map((f) => (f.requesterId === userId ? f.addressee : f.requester))
    .filter((u) => !u.guildMember && !invited.has(u.id))
    .map((u) => ({ id: u.id, name: u.name, image: u.image }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    id: guild.id,
    name: guild.name,
    crest: guild.crest,
    createdAt: guild.createdAt.toISOString(),
    myRole: me.role,
    members,
    invites: guild.invites.map((i) => ({
      id: i.id,
      userId: i.to.id,
      name: i.to.name,
      fromName: i.from?.name ?? null,
      createdAt: i.createdAt.toISOString(),
    })),
    invitableFriends,
  };
}

/** Invitations à entrer dans une guilde reçues par le joueur. */
export async function getReceivedGuildInvites(userId: string): Promise<ReceivedGuildInvite[]> {
  const rows = await prisma.guildInvite.findMany({
    where: { toId: userId },
    orderBy: { createdAt: "desc" },
    include: { guild: { select: { name: true, crest: true, _count: { select: { members: true } } } }, from: { select: { name: true } } },
  });
  return rows.map((r) => ({
    id: r.id,
    guildId: r.guildId,
    guildName: r.guild.name,
    crest: r.guild.crest,
    members: r.guild._count.members,
    fromName: r.from?.name ?? null,
    createdAt: r.createdAt.toISOString(),
  }));
}

/** Fonde une guilde dont le joueur devient le chef. */
export async function createGuild(userId: string, rawName: string): Promise<GuildError | null> {
  const name = cleanGuildName(rawName);
  if (name.length < GUILD_NAME_MIN) return "name-invalid";
  if (await prisma.guildMember.findUnique({ where: { userId }, select: { userId: true } })) return "in-guild";
  try {
    await prisma.$transaction([
      prisma.guild.create({
        data: { name, nameKey: guildNameKey(name), members: { create: { userId, role: "leader", lastSeenAt: new Date() } } },
      }),
      // Déjà dans une guilde : les autres invitations n'ont plus lieu d'être.
      prisma.guildInvite.deleteMany({ where: { toId: userId } }),
    ]);
  } catch (err) {
    if (isUniqueError(err, "nameKey")) return "name-taken";
    if (isUniqueError(err, "userId")) return "in-guild";
    throw err;
  }
  await grantSocialAchievements([userId]);
  return null;
}

/** Membre chef de sa guilde, sinon l'erreur à renvoyer. */
async function leaderGuild(userId: string): Promise<{ guildId: string } | { error: GuildError }> {
  const me = await prisma.guildMember.findUnique({ where: { userId }, select: { guildId: true, role: true } });
  if (!me) return { error: "not-member" };
  if (me.role !== "leader") return { error: "not-leader" };
  return { guildId: me.guildId };
}

/** Renomme la guilde (chef seulement). */
export async function renameGuild(userId: string, rawName: string): Promise<GuildError | null> {
  const lead = await leaderGuild(userId);
  if ("error" in lead) return lead.error;
  const name = cleanGuildName(rawName);
  if (name.length < GUILD_NAME_MIN) return "name-invalid";
  try {
    await prisma.guild.update({ where: { id: lead.guildId }, data: { name, nameKey: guildNameKey(name) } });
  } catch (err) {
    if (isUniqueError(err, "nameKey")) return "name-taken";
    throw err;
  }
  return null;
}

/** Invite un joueur (par pseudo, e-mail ou id) dans la guilde de `fromId` : n'importe quel membre peut inviter. */
export async function inviteToGuild(fromId: string, target: { handle: string } | { userId: string }): Promise<GuildInviteResult> {
  const me = await prisma.guildMember.findUnique({ where: { userId: fromId }, select: { guildId: true } });
  if (!me) return { status: "not-member" };
  const found =
    "handle" in target
      ? await findUserByHandle(target.handle)
      : ((await prisma.user.findUnique({ where: { id: target.userId }, select: { id: true, name: true } })) ?? { status: "not-found" as const });
  if ("status" in found) return found;
  if (found.id === fromId) return { status: "self" };

  const [membership, members, pending] = await Promise.all([
    prisma.guildMember.findUnique({ where: { userId: found.id }, select: { guildId: true } }),
    prisma.guildMember.count({ where: { guildId: me.guildId } }),
    prisma.guildInvite.count({ where: { guildId: me.guildId } }),
  ]);
  if (membership) return { status: membership.guildId === me.guildId ? "already-member" : "target-in-guild" };
  if (members >= GUILD_MAX_MEMBERS) return { status: "full" };
  const existing = await prisma.guildInvite.findUnique({ where: { guildId_toId: { guildId: me.guildId, toId: found.id } }, select: { id: true } });
  if (existing) return { status: "already-invited", name: found.name };
  if (pending >= GUILD_MAX_PENDING_INVITES) return { status: "too-many" };
  try {
    await prisma.guildInvite.create({ data: { guildId: me.guildId, toId: found.id, fromId } });
  } catch (err) {
    if (isUniqueError(err, "toId")) return { status: "already-invited", name: found.name };
    throw err;
  }
  return { status: "sent", name: found.name };
}

/** Annule une invitation envoyée par sa guilde (n'importe quel membre). */
export async function cancelGuildInvite(userId: string, inviteId: string): Promise<void> {
  const me = await prisma.guildMember.findUnique({ where: { userId }, select: { guildId: true } });
  if (me) await prisma.guildInvite.deleteMany({ where: { id: inviteId, guildId: me.guildId } });
}

/** Refuse une invitation reçue. */
export async function declineGuildInvite(userId: string, inviteId: string): Promise<void> {
  await prisma.guildInvite.deleteMany({ where: { id: inviteId, toId: userId } });
}

/** Accepte une invitation reçue : le joueur entre dans la guilde si elle n'est pas pleine. */
export async function acceptGuildInvite(userId: string, inviteId: string, now: Date): Promise<GuildError | null> {
  try {
    const refused = await prisma.$transaction(async (tx) => {
      const invite = await tx.guildInvite.findFirst({ where: { id: inviteId, toId: userId }, select: { guildId: true } });
      if (!invite) return "not-found";
      // Verrou sur la guilde : deux acceptations simultanées ne dépassent pas la limite de membres.
      await tx.$queryRaw`SELECT id FROM "guild" WHERE id = ${invite.guildId} FOR UPDATE`;
      if (await tx.guildMember.findUnique({ where: { userId }, select: { userId: true } })) return "in-guild";
      if ((await tx.guildMember.count({ where: { guildId: invite.guildId } })) >= GUILD_MAX_MEMBERS) return "full";
      await tx.guildMember.create({ data: { userId, guildId: invite.guildId, joinedAt: now, lastSeenAt: now } });
      await tx.guildInvite.deleteMany({ where: { toId: userId } });
      return null;
    });
    if (!refused) await grantSocialAchievements([userId]);
    return refused;
  } catch (err) {
    if (isUniqueError(err, "userId")) return "in-guild";
    throw err;
  }
}

/** Exclut un membre (chef seulement). */
export async function kickGuildMember(userId: string, memberId: string): Promise<GuildError | null> {
  const lead = await leaderGuild(userId);
  if ("error" in lead) return lead.error;
  if (memberId === userId) return "not-found";
  const [{ count }] = await prisma.$transaction([
    prisma.guildMember.deleteMany({ where: { userId: memberId, guildId: lead.guildId } }),
    prisma.gameInvite.deleteMany({ where: { toId: memberId, guildId: lead.guildId } }),
  ]);
  return count ? null : "not-found";
}

/** Passe la tête de la guilde à un autre membre (chef seulement). */
export async function transferGuildLeadership(userId: string, memberId: string): Promise<GuildError | null> {
  const lead = await leaderGuild(userId);
  if ("error" in lead) return lead.error;
  if (memberId === userId) return "not-found";
  return prisma.$transaction(async (tx) => {
    const { count } = await tx.guildMember.updateMany({ where: { userId: memberId, guildId: lead.guildId }, data: { role: "leader" } });
    if (!count) return "not-found";
    await tx.guildMember.update({ where: { userId }, data: { role: "member" } });
    return null;
  });
}

/**
 * Quitte sa guilde. Un chef qui part laisse la tête au plus ancien membre ;
 * le dernier membre qui part dissout la guilde (blason et invitations compris).
 */
export async function leaveGuild(userId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const me = await tx.guildMember.findUnique({ where: { userId }, select: { guildId: true, role: true } });
    if (!me) return;
    await tx.$queryRaw`SELECT id FROM "guild" WHERE id = ${me.guildId} FOR UPDATE`;
    await tx.guildMember.delete({ where: { userId } });
    await tx.gameInvite.deleteMany({ where: { toId: userId, guildId: me.guildId } });
    if (me.role !== "leader") return;
    const next = await tx.guildMember.findFirst({ where: { guildId: me.guildId }, orderBy: [{ joinedAt: "asc" }, { userId: "asc" }] });
    if (next) await tx.guildMember.update({ where: { userId: next.userId }, data: { role: "leader" } });
    else await tx.guild.delete({ where: { id: me.guildId } });
  });
}

/** Pose (ou remplace) le blason de sa guilde (chef seulement) ; renvoie son adresse. */
export async function saveGuildCrest(userId: string, data: Uint8Array, mime: string): Promise<{ crest: string } | { error: GuildError }> {
  const lead = await leaderGuild(userId);
  if ("error" in lead) return lead;
  const bytes = Buffer.from(data);
  const row = await prisma.guildCrest.upsert({
    where: { guildId: lead.guildId },
    create: { guildId: lead.guildId, data: bytes, mime },
    update: { data: bytes, mime },
    select: { updatedAt: true },
  });
  // La version dans l'adresse casse le cache du navigateur à chaque nouveau blason.
  const crest = `/api/guild/crest/${lead.guildId}?v=${row.updatedAt.getTime()}`;
  await prisma.guild.update({ where: { id: lead.guildId }, data: { crest } });
  return { crest };
}

/** Retire le blason de sa guilde (chef seulement). */
export async function deleteGuildCrest(userId: string): Promise<GuildError | null> {
  const lead = await leaderGuild(userId);
  if ("error" in lead) return lead.error;
  await prisma.$transaction([
    prisma.guildCrest.deleteMany({ where: { guildId: lead.guildId } }),
    prisma.guild.update({ where: { id: lead.guildId }, data: { crest: null } }),
  ]);
  return null;
}

/** Blason d'une guilde (montré aux membres et aux joueurs invités, donc à tout joueur connecté). */
export async function getGuildCrest(guildId: string): Promise<{ data: Uint8Array; mime: string; updatedAt: Date } | null> {
  return prisma.guildCrest.findUnique({ where: { guildId }, select: { data: true, mime: true, updatedAt: true } });
}

/** Note que le joueur a le site ouvert (pour « en ligne » dans sa guilde) ; sans effet hors guilde. */
export async function touchGuildPresence(userId: string, now: Date): Promise<void> {
  await prisma.guildMember.updateMany({ where: { userId }, data: { lastSeenAt: now } });
}

/** Invite tous les autres membres de sa guilde dans le lobby `code`. Renvoie le nombre d'invités, null hors guilde. */
export async function sendGuildLobbyInvites(userId: string, code: string, now: Date): Promise<number | null> {
  const me = await prisma.guildMember.findUnique({ where: { userId }, select: { guildId: true } });
  if (!me) return null;
  const others = await prisma.guildMember.findMany({ where: { guildId: me.guildId, userId: { not: userId } }, select: { userId: true } });
  const expiresAt = new Date(now.getTime() + INVITE_TTL_MS);
  const data = { createdAt: now, expiresAt, guildId: me.guildId };
  await prisma.$transaction(
    others.map((o) =>
      prisma.gameInvite.upsert({
        where: { fromId_toId_code: { fromId: userId, toId: o.userId, code } },
        create: { fromId: userId, toId: o.userId, code, ...data },
        update: data,
      }),
    ),
  );
  await trimGameInvites(
    userId,
    others.map((o) => o.userId),
  );
  return others.length;
}

/* ------------------------------------------------------------------ */
/* Suppression de compte (RGPD)                                         */
/* ------------------------------------------------------------------ */

/**
 * Efface les traces d'un joueur avant la suppression de son compte : ses parties solo disparaissent,
 * et son pseudo est retiré des parties en ligne (laissé vide), qui restent pour les autres joueurs.
 * Il quitte aussi sa guilde (un chef laisse la tête au plus ancien membre, un dernier membre la dissout).
 * Le reste (sessions, Elo, statistiques, amis, invitations) part en cascade avec la ligne `user`.
 */
export async function eraseUserGames(userId: string): Promise<void> {
  await leaveGuild(userId);
  await prisma.$transaction([
    prisma.game.deleteMany({ where: { solo: true, players: { some: { userId } } } }),
    prisma.gamePlayer.updateMany({ where: { userId }, data: { displayName: "" } }),
    prisma.dungeonRunPlayer.updateMany({ where: { userId }, data: { displayName: "" } }),
  ]);
}

/* ------------------------------------------------------------------ */
/* Calcul du jour                                                       */
/* ------------------------------------------------------------------ */

/** Taille du classement affiché pour un jour. */
export const DAILY_BOARD_SIZE = 100;

/** Une réponse enregistrée dans `DailyRun.answers`. */
interface DailyAnswerRow {
  value: number | null;
  correct: boolean;
  timeMs: number;
}

/** Calcul en cours, sans la réponse. */
export interface DailyQuestionView {
  index: number;
  difficulty: Difficulty;
  text: string;
  timeLimitMs: number;
  /** Temps restant au moment de la réponse du serveur, en ms */
  remainingMs: number;
}

/** Calcul déjà joué : seul moment où sa réponse quitte le serveur. */
export interface DailyAnswerView {
  index: number;
  difficulty: Difficulty;
  text: string;
  solution: string;
  value: number | null;
  correct: boolean;
  timeMs: number;
}

/** Ce que le navigateur reçoit d'un essai. */
export interface DailyRunView {
  token: string;
  date: string;
  /** Rattaché à un compte : le score est enregistré */
  saved: boolean;
  correct: number;
  totalTimeMs: number;
  /** Calculs déjà joués */
  index: number;
  question: DailyQuestionView | null;
  answers: DailyAnswerView[];
  finished: boolean;
  /** Essai fini : place parmi les comptes (celle qu'aurait un invité une fois inscrit) */
  rank: number | null;
  /** Essai fini : comptes classés ce jour-là */
  players: number;
  /** Essai fini d'un compte : sa série de jours, celui-ci compris */
  streak: DailyStreak | null;
  /** Succès que la fin de cet essai vient de débloquer (dans la seule réponse qui le termine ou le rattache au compte) */
  unlocks: Unlock[];
}

export interface DailyBoardEntry {
  userId: string;
  name: string;
  rank: number;
  correct: number;
  totalTimeMs: number;
}

export interface DailyBoard {
  date: string;
  /** Gagnant désigné : le classement de ce jour ne bouge plus */
  settled: boolean;
  top: DailyBoardEntry[];
  players: number;
  /** Ligne du joueur connecté, même hors du top */
  me: DailyBoardEntry | null;
}

type DailyRunRow = Prisma.DailyRunGetPayload<{ include: { challenge: true } }>;

/** Un essai après une clôture de calcul, et les succès que sa fin vient de débloquer. */
interface ClosedRun {
  run: DailyRunRow;
  unlocks: Unlock[];
}

/** Essais classés d'un jour : finis, rattachés à un compte, et pas à un compte banni. */
const rankedRuns = (date: string) => ({ date, userId: { not: null }, finishedAt: { not: null }, user: { bannedAt: null } });

/** Un essai reste jouable le jour même, puis `DAILY_LATE_MS` après minuit. */
const runIsOpen = (date: string, now: Date) => date >= dailyDate(now.getTime() - DAILY_LATE_MS);

/** Place d'un score parmi les comptes : ex æquo à la même place. */
function dailyRank(date: string, score: { correct: number; totalTimeMs: number }): Promise<number> {
  return prisma.dailyRun
    .count({
      where: {
        ...rankedRuns(date),
        OR: [{ correct: { gt: score.correct } }, { correct: score.correct, totalTimeMs: { lt: score.totalTimeMs } }],
      },
    })
    .then((ahead) => ahead + 1);
}

async function dailyRunView(run: DailyRunRow, now: Date, unlocks: Unlock[] = []): Promise<DailyRunView> {
  const seed = run.challenge.seed;
  const rows = run.answers as unknown as DailyAnswerRow[];
  const answers = rows.map((a, index) => {
    const q = dailyQuestion(seed, index);
    return { index, difficulty: q.difficulty, text: q.text, solution: q.solution, ...a };
  });
  let question: DailyQuestionView | null = null;
  if (run.questionAt) {
    const q = dailyQuestion(seed, run.index);
    const timeLimitMs = dailyTimeLimitMs(run.index);
    question = {
      index: run.index,
      difficulty: q.difficulty,
      text: q.text,
      timeLimitMs,
      remainingMs: Math.max(0, timeLimitMs - (now.getTime() - run.questionAt.getTime())),
    };
  }
  const finished = run.finishedAt !== null;
  return {
    token: run.token,
    date: run.date,
    saved: run.userId !== null,
    correct: run.correct,
    totalTimeMs: run.totalTimeMs,
    index: run.index,
    question,
    answers,
    finished,
    rank: finished ? await dailyRank(run.date, run) : null,
    players: finished ? await prisma.dailyRun.count({ where: rankedRuns(run.date) }) : 0,
    streak: finished && run.userId ? await getDailyStreak(run.userId, now) : null,
    unlocks,
  };
}

/**
 * Clôt le calcul en cours avec `value` (null : temps écoulé). Le temps est mesuré ici, à l'heure du serveur.
 * Une seule clôture passe si deux demandes se croisent : l'essai relu dit alors où on en est.
 */
async function closeDailyQuestion(run: DailyRunRow, value: number | null, now: Date): Promise<ClosedRun> {
  if (!run.questionAt) return { run, unlocks: [] };
  const limit = dailyTimeLimitMs(run.index);
  const elapsed = now.getTime() - run.questionAt.getTime();
  const inTime = elapsed <= limit + DAILY_GRACE_MS;
  const given = inTime ? value : null;
  const correct = given !== null && given === dailyQuestion(run.challenge.seed, run.index).answer;
  const timeMs = given === null ? limit : Math.min(elapsed, limit);
  const rows = run.answers as unknown as DailyAnswerRow[];
  const index = run.index + 1;
  const row: DailyAnswerRow = { value: given, correct, timeMs };
  await prisma.dailyRun.updateMany({
    where: { id: run.id, index: run.index, questionAt: { not: null } },
    data: {
      index,
      questionAt: null,
      correct: run.correct + (correct ? 1 : 0),
      totalTimeMs: run.totalTimeMs + timeMs,
      answers: [...rows, row] as unknown as Prisma.InputJsonValue,
      finishedAt: index >= DAILY_ROUNDS ? now : null,
    },
  });
  const closed = await prisma.dailyRun.findUniqueOrThrow({ where: { id: run.id }, include: { challenge: true } });
  if (closed.userId) await reviewDailyRun(closed, closed.userId, now);
  return { run: closed, unlocks: closed.userId && closed.finishedAt ? await grantDailyAchievements(closed.userId) : [] };
}

/**
 * Succès de série d'un compte qui vient de finir un essai (ou de s'en voir rattacher un). Sans effet si rien n'est atteint,
 * ou la seconde fois. Ne fait jamais échouer la réponse du joueur : un succès manqué est redonné à l'essai suivant.
 */
async function grantDailyAchievements(userId: string): Promise<Unlock[]> {
  try {
    return await prisma.$transaction(async (tx) => {
      const earned = await sourceUnlocks(tx, userId);
      await grantUnlocks(tx, earned.map((unlock) => ({ userId, unlock, gameId: null })));
      return earned;
    });
  } catch (e) {
    console.error("Calcul du jour : succès de série non donnés", e);
    return [];
  }
}

/**
 * Anti-bot : juge l'essai d'un compte après chaque calcul. Un temps impossible bannit aussitôt ; un essai douteux est signalé
 * une fois fini. Sans effet la seconde fois (un signalement par compte et par jour). Ne fait jamais échouer la réponse du joueur.
 */
async function reviewDailyRun(run: DailyRunRow, userId: string, now: Date): Promise<void> {
  try {
    const rows = run.answers as unknown as DailyAnswerRow[];
    const { verdict, rules } = checkDailyBot(rows);
    if (verdict === "ok" || (verdict === "suspect" && !run.finishedAt)) return;
    const detail = rows.map((a, index) => ({ text: dailyQuestion(run.challenge.seed, index).text, ...a }));
    await prisma.botReport.createMany({
      data: { userId, source: "daily", ref: run.date, verdict, rules, detail: detail as unknown as Prisma.InputJsonValue },
      skipDuplicates: true,
    });
    if (verdict === "bot") await banUser(userId, "bot-daily", now);
  } catch (e) {
    console.error("Anti-bot : essai du jour non jugé", e);
  }
}

/** Un calcul laissé sans réponse (page fermée) compte comme temps écoulé dès que son temps est passé. */
async function closeExpiredQuestion(run: DailyRunRow, now: Date): Promise<ClosedRun> {
  if (!run.questionAt || now.getTime() - run.questionAt.getTime() <= dailyTimeLimitMs(run.index) + DAILY_GRACE_MS) return { run, unlocks: [] };
  return closeDailyQuestion(run, null, now);
}

/** Essai d'un joueur : par son compte s'il est connecté, sinon par son jeton (celui d'un compte reste à ce compte). */
function findDailyRun(date: string, userId: string | null, token: string | null): Promise<DailyRunRow | null> {
  if (userId) return prisma.dailyRun.findUnique({ where: { date_userId: { date, userId } }, include: { challenge: true } });
  if (!token) return Promise.resolve(null);
  return prisma.dailyRun.findFirst({ where: { date, token, userId: null }, include: { challenge: true } });
}

/** Rattache l'essai d'un invité au compte qui vient de se connecter, sauf si ce compte a déjà joué ce jour-là, si le jour est clos ou si l'essai est celui d'un bot. */
async function claimDailyRun(userId: string, token: string): Promise<Unlock[]> {
  const run = await prisma.dailyRun.findUnique({ where: { token }, include: { challenge: true } });
  if (!run || run.userId !== null || run.challenge.settledAt) return [];
  // Un essai d'invité aux temps impossibles n'entre jamais au classement : s'inscrire après coup ne le blanchit pas.
  if (checkDailyBot(run.answers as unknown as DailyAnswerRow[]).verdict === "bot") return [];
  const claimed = await prisma.dailyRun
    .update({ where: { id: run.id }, data: { userId }, include: { challenge: true } })
    .catch((e: unknown) => {
      // Le compte a déjà un essai ce jour-là : c'est celui-là qui compte.
      if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")) throw e;
      return null;
    });
  if (!claimed) return [];
  await reviewDailyRun(claimed, userId, new Date());
  // Un essai fini en invité compte pour la série du compte dès qu'il lui est rattaché.
  return claimed.finishedAt ? grantDailyAchievements(userId) : [];
}

/**
 * Essai en cours ou fini du joueur pour le jour de `now`, null s'il n'a pas commencé.
 * Un compte qui arrive avec le jeton d'un essai d'invité le récupère : c'est l'inscription de fin de partie.
 */
export async function getDailyRun(userId: string | null, token: string | null, now: Date): Promise<DailyRunView | null> {
  const claimed = userId && token ? await claimDailyRun(userId, token) : [];
  const date = dailyDate(now.getTime());
  let run = await findDailyRun(date, userId, token);
  // Essai commencé avant minuit et encore jouable : on le reprend avant d'en ouvrir un nouveau.
  const yesterday = dailyDate(now.getTime() - DAILY_LATE_MS);
  if (!run && yesterday !== date) {
    const late = await findDailyRun(yesterday, userId, token);
    if (late && !late.finishedAt) run = late;
  }
  if (!run) return null;
  const closed = await closeExpiredQuestion(run, now);
  return dailyRunView(closed.run, now, [...claimed, ...closed.unlocks]);
}

/** Commence l'essai du jour, ou rend celui qui existe déjà : un compte n'a qu'un essai. */
export async function startDailyRun(userId: string | null, token: string | null, now: Date): Promise<DailyRunView> {
  const existing = await getDailyRun(userId, token, now);
  if (existing) return existing;
  const date = dailyDate(now.getTime());
  await prisma.dailyChallenge.createMany({ data: { date, seed: randomBytes(16).toString("hex") }, skipDuplicates: true });
  const newToken = randomUUID();
  // Deux demandes simultanées d'un même compte : une seule ligne, retrouvée par le compte.
  await prisma.dailyRun.createMany({ data: { date, userId, token: newToken, startedAt: now }, skipDuplicates: true });
  const run = await findDailyRun(date, userId, newToken);
  if (!run) throw new Error("Essai du jour introuvable après sa création");
  return dailyRunView(run, now);
}

/** Essai visé par une demande en cours de partie, encore jouable. */
async function openDailyRun(userId: string | null, token: string | null, now: Date): Promise<DailyRunRow | null> {
  if (!token) return null;
  const run = await prisma.dailyRun.findUnique({ where: { token }, include: { challenge: true } });
  if (!run || (run.userId !== null && run.userId !== userId)) return null;
  return runIsOpen(run.date, now) ? run : null;
}

/** Pose le calcul suivant et lance son chrono ; rend le même calcul s'il est déjà en cours (page rechargée). Null si l'essai n'existe plus. */
export async function nextDailyQuestion(userId: string | null, token: string | null, now: Date): Promise<DailyRunView | null> {
  const found = await openDailyRun(userId, token, now);
  if (!found) return null;
  const { run, unlocks } = await closeExpiredQuestion(found, now);
  if (run.questionAt || run.finishedAt) return dailyRunView(run, now, unlocks);
  await prisma.dailyRun.updateMany({ where: { id: run.id, index: run.index, questionAt: null }, data: { questionAt: now } });
  return dailyRunView(await prisma.dailyRun.findUniqueOrThrow({ where: { id: run.id }, include: { challenge: true } }), now);
}

/** Répond au calcul en cours (`value` null : temps écoulé). Une réponse en double ne change rien. Null si l'essai n'existe plus. */
export async function answerDailyQuestion(userId: string | null, token: string | null, value: number | null, now: Date): Promise<DailyRunView | null> {
  const run = await openDailyRun(userId, token, now);
  if (!run) return null;
  const closed = await closeDailyQuestion(run, value, now);
  return dailyRunView(closed.run, now, closed.unlocks);
}

/** Résultat du jour d'un compte, pour l'accueil. Null s'il n'a pas fini son essai. */
export async function getDailyResult(userId: string, now: Date): Promise<{ correct: number; totalTimeMs: number; rank: number } | null> {
  const date = dailyDate(now.getTime());
  const run = await prisma.dailyRun.findUnique({ where: { date_userId: { date, userId } }, select: { correct: true, totalTimeMs: true, finishedAt: true } });
  if (!run?.finishedAt) return null;
  return { correct: run.correct, totalTimeMs: run.totalTimeMs, rank: await dailyRank(date, run) };
}

/** Série de jours consécutifs d'un compte au calcul du jour, pour l'accueil et la fin d'un essai. */
export async function getDailyStreak(userId: string, now: Date): Promise<DailyStreak> {
  return dailyStreak(await dailyPlayedDates(prisma, userId), dailyDate(now.getTime()));
}

/** Classement d'un jour : le plus de bons calculs, puis le temps total ; places ex æquo « 1, 2, 2, 4 ». */
export async function getDailyBoard(date: string, viewerId?: string): Promise<DailyBoard> {
  const [challenge, rows, players, mine] = await Promise.all([
    prisma.dailyChallenge.findUnique({ where: { date }, select: { settledAt: true } }),
    prisma.dailyRun.findMany({
      where: rankedRuns(date),
      orderBy: [{ correct: "desc" }, { totalTimeMs: "asc" }, { finishedAt: "asc" }],
      take: DAILY_BOARD_SIZE,
      select: { userId: true, correct: true, totalTimeMs: true, user: { select: { name: true } } },
    }),
    prisma.dailyRun.count({ where: rankedRuns(date) }),
    viewerId
      ? prisma.dailyRun.findFirst({
          where: { ...rankedRuns(date), userId: viewerId },
          select: { userId: true, correct: true, totalTimeMs: true, user: { select: { name: true } } },
        })
      : null,
  ]);
  const toEntry = (r: (typeof rows)[number], rank: number): DailyBoardEntry => ({
    userId: r.userId!,
    name: r.user?.name ?? "",
    rank,
    correct: r.correct,
    totalTimeMs: r.totalTimeMs,
  });
  const top: DailyBoardEntry[] = [];
  rows.forEach((r, i) => {
    const prev = rows[i - 1];
    const tied = prev && prev.correct === r.correct && prev.totalTimeMs === r.totalTimeMs;
    top.push(toEntry(r, tied ? top[i - 1]!.rank : i + 1));
  });
  return { date, settled: !!challenge?.settledAt, top, players, me: mine ? toEntry(mine, await dailyRank(date, mine)) : null };
}

/**
 * Désigne les gagnants des jours terminés : le meilleur score du jour (avec au moins un bon calcul) gagne `DailyRun.won`, qui débloque le succès,
 * à égalité parfaite tous ceux qui l'ont fait. Sans tâche planifiée sur le site, n'importe quelle visite s'en charge ;
 * `settledAt`, posé dans la transaction, évite de le faire deux fois. Les essais d'invités, devenus inutiles, sont effacés.
 */
export async function settleDailyChallenges(now: Date): Promise<void> {
  const closedBefore = dailyDate(now.getTime() - DAILY_LATE_MS);
  const due = await prisma.dailyChallenge.findMany({ where: { settledAt: null, date: { lt: closedBefore } }, select: { date: true } });
  for (const { date } of due) {
    await prisma.$transaction(async (tx) => {
      const { count } = await tx.dailyChallenge.updateMany({ where: { date, settledAt: null }, data: { settledAt: now } });
      if (count === 0) return;
      const best = await tx.dailyRun.findFirst({
        where: { ...rankedRuns(date), correct: { gt: 0 } },
        orderBy: [{ correct: "desc" }, { totalTimeMs: "asc" }],
        select: { correct: true, totalTimeMs: true },
      });
      if (best) {
        const winners = await tx.dailyRun.findMany({ where: { ...rankedRuns(date), ...best }, select: { userId: true } });
        await tx.dailyRun.updateMany({ where: { ...rankedRuns(date), ...best }, data: { won: true } });
        for (const { userId } of winners) {
          const earned = await sourceUnlocks(tx, userId!);
          await grantUnlocks(tx, earned.map((unlock) => ({ userId: userId!, unlock, gameId: null })));
        }
      }
      await tx.dailyRun.deleteMany({ where: { date, userId: null } });
    });
  }
}

/* ------------------------------------------------------------------ */
/* Photos de profil                                                     */
/* ------------------------------------------------------------------ */

/** Enregistre (ou remplace) la photo de profil ; renvoie sa version, à mettre dans l'adresse pour casser le cache. */
export async function saveAvatar(userId: string, data: Uint8Array, mime: string): Promise<number> {
  const bytes = Buffer.from(data);
  const row = await prisma.avatar.upsert({
    where: { userId },
    create: { userId, data: bytes, mime },
    update: { data: bytes, mime },
    select: { updatedAt: true },
  });
  return row.updatedAt.getTime();
}

export async function deleteAvatar(userId: string): Promise<void> {
  await prisma.avatar.deleteMany({ where: { userId } });
}

/**
 * Photo de profil de `userId`, visible seulement par son propriétaire, ses amis et les membres de sa guilde.
 * Null si elle n'existe pas ou si `viewerId` n'a pas le droit de la voir.
 */
export async function getAvatarFor(userId: string, viewerId: string): Promise<{ data: Uint8Array; mime: string; updatedAt: Date } | null> {
  if (userId !== viewerId && !(await areFriends(userId, viewerId)) && !(await sameGuild(userId, viewerId))) return null;
  return prisma.avatar.findUnique({ where: { userId }, select: { data: true, mime: true, updatedAt: true } });
}

/* ------------------------------------------------------------------ */
/* Retours des joueurs                                                  */
/* ------------------------------------------------------------------ */

export * from "./feedback";

export interface FeedbackInput {
  userId: string | null;
  kind: FeedbackKindName;
  message: string;
  contact: string | null;
  page: string | null;
  locale: string;
}

/** Enregistre un retour, sauf si la limite horaire est atteinte (renvoie false). */
export async function createFeedback(input: FeedbackInput, now: Date): Promise<boolean> {
  const since = new Date(now.getTime() - 60 * 60 * 1000);
  const recent = await prisma.feedback.count({ where: { userId: input.userId, createdAt: { gte: since } } });
  if (recent >= (input.userId ? FEEDBACK_PER_USER_PER_HOUR : FEEDBACK_GUESTS_PER_HOUR)) return false;
  await prisma.feedback.create({ data: input });
  return true;
}

/* ------------------------------------------------------------------ */
/* Limites de fréquence (routes du site)                               */
/* ------------------------------------------------------------------ */

/**
 * Compte une demande pour `key` dans une fenêtre fixe de `windowMs` et dit si elle passe sous `max`.
 * Compteur en base (table de Better Auth, clés préfixées `calculus:`), pour que la limite tienne
 * entre les instances et les redémarrages ; une seule requête atomique, sans course entre deux appels.
 */
export async function consumeRateLimit(key: string, max: number, windowMs: number, now: number): Promise<boolean> {
  const fullKey = `calculus:${key}`;
  // Colonne BIGINT : des BigInt, pour que Postgres ne reçoive pas un flottant.
  const at = BigInt(now);
  const windowStart = BigInt(now - windowMs);
  const rows = await prisma.$queryRaw<{ count: number }[]>`
    INSERT INTO "rate_limit" ("id", "key", "count", "lastRequest")
    VALUES (${randomUUID()}, ${fullKey}, 1, ${at})
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE WHEN "rate_limit"."lastRequest" <= ${windowStart} THEN 1 ELSE "rate_limit"."count" + 1 END,
      "lastRequest" = CASE WHEN "rate_limit"."lastRequest" <= ${windowStart} THEN ${at} ELSE "rate_limit"."lastRequest" END
    RETURNING "count"`;
  return (rows[0]?.count ?? 0) <= max;
}

/* ------------------------------------------------------------------ */
/* Panel administrateur                                                 */
/* ------------------------------------------------------------------ */

export const ADMIN_PAGE_SIZE = 50;

export interface AdminOverview {
  users: number;
  usersLast7Days: number;
  usersLast30Days: number;
  games: number;
  onlineGames: number;
  gamesLast24Hours: number;
  openFeedback: number;
  /** Inscriptions par jour sur les 30 derniers jours (date ISO AAAA-MM-JJ, du plus ancien au plus récent). */
  signups: { day: string; count: number }[];
}

export async function getAdminOverview(now: Date): Promise<AdminOverview> {
  const day = 24 * 60 * 60 * 1000;
  const since30 = new Date(now.getTime() - 30 * day);
  const [users, usersLast7Days, recentUsers, games, onlineGames, gamesLast24Hours, openFeedback] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { createdAt: { gte: new Date(now.getTime() - 7 * day) } } }),
    prisma.user.findMany({ where: { createdAt: { gte: since30 } }, select: { createdAt: true } }),
    prisma.game.count(),
    prisma.game.count({ where: { solo: false } }),
    prisma.game.count({ where: { endedAt: { gte: new Date(now.getTime() - day) } } }),
    prisma.feedback.count({ where: { resolved: false } }),
  ]);
  const byDay = new Map<string, number>();
  for (let i = 29; i >= 0; i--) byDay.set(new Date(now.getTime() - i * day).toISOString().slice(0, 10), 0);
  for (const u of recentUsers) {
    const key = u.createdAt.toISOString().slice(0, 10);
    if (byDay.has(key)) byDay.set(key, (byDay.get(key) ?? 0) + 1);
  }
  return {
    users,
    usersLast7Days,
    usersLast30Days: recentUsers.length,
    games,
    onlineGames,
    gamesLast24Hours,
    openFeedback,
    signups: [...byDay].map(([d, count]) => ({ day: d, count })),
  };
}

/** Périodes de l'historique des parties, en jours (au-delà de 90 jours, une barre par semaine). */
export const GAMES_HISTORY_RANGES = [30, 90, 365] as const;
export type GamesHistoryRange = (typeof GAMES_HISTORY_RANGES)[number];

export interface GamesHistory {
  bucket: "day" | "week";
  /** Une entrée par jour ou par semaine (lundi), du plus ancien au plus récent, date ISO AAAA-MM-JJ en UTC. */
  points: { start: string; solo: number; online: number }[];
  solo: number;
  online: number;
}

/** Parties enregistrées (terminées) par jour ou par semaine, solo et en ligne séparés. */
export async function getGamesHistory(now: Date, days: GamesHistoryRange): Promise<GamesHistory> {
  const day = 24 * 60 * 60 * 1000;
  const bucket = days > 90 ? "week" : "day";
  const step = bucket === "week" ? 7 * day : day;
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  // date_trunc('week') commence le lundi (getUTCDay : 0 = dimanche).
  const last = bucket === "week" ? today - ((new Date(today).getUTCDay() + 6) % 7) * day : today;
  const count = bucket === "week" ? Math.ceil(days / 7) : days;
  const byStart = new Map<string, { solo: number; online: number }>();
  for (let i = count - 1; i >= 0; i--) byStart.set(new Date(last - i * step).toISOString().slice(0, 10), { solo: 0, online: 0 });
  const since = new Date(last - (count - 1) * step);
  const rows = await prisma.$queryRaw<{ start: string; solo: boolean; count: bigint }[]>`
    SELECT to_char(date_trunc(${bucket}::text, "endedAt"), 'YYYY-MM-DD') AS "start", "solo", count(*) AS "count"
    FROM "game"
    WHERE "endedAt" >= ${since}
    GROUP BY 1, 2`;
  let solo = 0;
  let online = 0;
  for (const r of rows) {
    const point = byStart.get(r.start);
    if (!point) continue;
    const n = Number(r.count);
    if (r.solo) {
      point.solo += n;
      solo += n;
    } else {
      point.online += n;
      online += n;
    }
  }
  return { bucket, points: [...byStart].map(([start, p]) => ({ start, ...p })), solo, online };
}

/* ------------------------------------------------------------------ */
/* Activité solo (signalée par le navigateur)                           */
/* ------------------------------------------------------------------ */

/** Sans signal depuis ce délai, une partie solo non close est considérée abandonnée (battement toutes les 30 s). */
export const SOLO_PLAY_LIVE_MS = 75_000;
/** Durée de conservation des lignes `solo_play`. */
export const SOLO_PLAY_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;
/** Au-delà, une partie ne reçoit plus de signal (même borne que `/api/solo-results`). */
const SOLO_PLAY_MAX_AGE_MS = 3 * 60 * 60 * 1000;

export type SoloPlayEvent = "ping" | "end" | "quit";

/** Note le début d'une partie solo (et purge les lignes trop anciennes). Renvoie son id. */
export async function startSoloPlay(
  input: { userId: string | null; game: GameId; mode: string; difficulty: number },
  now: Date,
): Promise<string> {
  await prisma.soloPlay.deleteMany({ where: { startedAt: { lt: new Date(now.getTime() - SOLO_PLAY_RETENTION_MS) } } });
  const row = await prisma.soloPlay.create({
    data: { ...input, startedAt: now, lastSeenAt: now },
    select: { id: true },
  });
  return row.id;
}

/** Battement ou fin d'une partie solo encore ouverte ; sans effet sur une partie close ou trop ancienne. */
export async function touchSoloPlay(
  id: string,
  event: SoloPlayEvent,
  progress: { rounds: number; correct: number },
  now: Date,
): Promise<void> {
  await prisma.soloPlay.updateMany({
    where: { id, endedAt: null, startedAt: { gte: new Date(now.getTime() - SOLO_PLAY_MAX_AGE_MS) } },
    data: {
      lastSeenAt: now,
      rounds: progress.rounds,
      correct: Math.min(progress.correct, progress.rounds),
      ...(event === "ping" ? {} : { endedAt: now, outcome: event === "end" ? "finished" : "quit" }),
    },
  });
}

/** Rattache la partie enregistrée par `/api/solo-results` à son suivi, s'il appartient bien au joueur. */
export async function linkSoloPlayGame(id: string, userId: string, gameId: string): Promise<void> {
  await prisma.soloPlay.updateMany({ where: { id, userId, gameId: null }, data: { gameId } });
}

export interface AdminSoloPlay {
  id: string;
  user: { id: string; name: string } | null;
  game: GameId;
  mode: GameModeId;
  difficulty: number;
  startedAt: string;
  lastSeenAt: string;
  endedAt: string | null;
  status: "live" | "finished" | "quit" | "abandoned";
  rounds: number;
  correct: number;
  gameId: string | null;
}

export interface AdminSoloActivity {
  live: AdminSoloPlay[];
  recent: AdminSoloPlay[];
  /** Sur les dernières 24 h */
  last24Hours: { started: number; finished: number; guests: number; players: number };
}

/** Parties solo en cours et dernières parties closes ou abandonnées. */
export async function getAdminSoloActivity(now: Date): Promise<AdminSoloActivity> {
  const liveSince = new Date(now.getTime() - SOLO_PLAY_LIVE_MS);
  const since24 = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const select = {
    id: true,
    user: { select: { id: true, name: true } },
    game: true,
    mode: true,
    difficulty: true,
    startedAt: true,
    lastSeenAt: true,
    endedAt: true,
    outcome: true,
    rounds: true,
    correct: true,
    gameId: true,
  } satisfies Prisma.SoloPlaySelect;
  const [live, recent, started, finished, guests, players] = await Promise.all([
    prisma.soloPlay.findMany({ where: { endedAt: null, lastSeenAt: { gte: liveSince } }, orderBy: { startedAt: "desc" }, take: 200, select }),
    prisma.soloPlay.findMany({
      where: { OR: [{ endedAt: { not: null } }, { lastSeenAt: { lt: liveSince } }] },
      orderBy: { startedAt: "desc" },
      take: ADMIN_PAGE_SIZE,
      select,
    }),
    prisma.soloPlay.count({ where: { startedAt: { gte: since24 } } }),
    prisma.soloPlay.count({ where: { startedAt: { gte: since24 }, outcome: "finished" } }),
    prisma.soloPlay.count({ where: { startedAt: { gte: since24 }, userId: null } }),
    prisma.soloPlay.findMany({ where: { startedAt: { gte: since24 }, userId: { not: null } }, distinct: ["userId"], select: { userId: true } }),
  ]);
  const describe = (p: (typeof live)[number]): AdminSoloPlay => ({
    id: p.id,
    user: p.user,
    game: p.game as GameId,
    mode: p.mode as GameModeId,
    difficulty: p.difficulty,
    startedAt: p.startedAt.toISOString(),
    lastSeenAt: p.lastSeenAt.toISOString(),
    endedAt: p.endedAt?.toISOString() ?? null,
    status: p.outcome === "finished" ? "finished" : p.outcome === "quit" ? "quit" : p.endedAt || p.lastSeenAt < liveSince ? "abandoned" : "live",
    rounds: p.rounds,
    correct: p.correct,
    gameId: p.gameId,
  });
  return {
    live: live.map(describe),
    recent: recent.map(describe),
    last24Hours: { started, finished, guests, players: players.length },
  };
}

export interface AdminOnlineGame {
  id: string;
  code: string | null;
  game: GameId;
  mode: GameModeId;
  difficulty: number;
  startedAt: string;
  endedAt: string;
  /** Tous les joueurs présents au lancement, partis en cours de partie compris, du premier au dernier */
  players: { userId: string | null; name: string; rank: number }[];
}

/** Parties en ligne enregistrées, de la plus récente à la plus ancienne. */
export async function listOnlineGames(page: number): Promise<{ games: AdminOnlineGame[]; total: number }> {
  const where: Prisma.GameWhereInput = { solo: false };
  const [rows, total] = await Promise.all([
    prisma.game.findMany({
      where,
      orderBy: { endedAt: "desc" },
      skip: page * ADMIN_PAGE_SIZE,
      take: ADMIN_PAGE_SIZE,
      select: {
        id: true,
        code: true,
        game: true,
        mode: true,
        difficulty: true,
        startedAt: true,
        endedAt: true,
        players: { orderBy: { rank: "asc" }, select: { userId: true, displayName: true, rank: true } },
      },
    }),
    prisma.game.count({ where }),
  ]);
  return {
    total,
    games: rows.map((g) => ({
      id: g.id,
      code: g.code,
      game: g.game as GameId,
      mode: g.mode as GameModeId,
      difficulty: g.difficulty,
      startedAt: g.startedAt.toISOString(),
      endedAt: g.endedAt.toISOString(),
      players: g.players.map((p) => ({ userId: p.userId, name: p.displayName, rank: p.rank })),
    })),
  };
}

export interface AdminUserRow {
  id: string;
  name: string;
  email: string;
  createdAt: string;
  gamesPlayed: number;
  lastGameAt: string | null;
}

/** Comptes, du plus récent au plus ancien, filtrés par pseudo ou e-mail (insensible à la casse). */
export async function listUsers(query: string, page: number): Promise<{ users: AdminUserRow[]; total: number }> {
  const q = query.trim();
  const where: Prisma.UserWhereInput = q
    ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }] }
    : {};
  const [rows, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: page * ADMIN_PAGE_SIZE,
      take: ADMIN_PAGE_SIZE,
      select: { id: true, name: true, email: true, createdAt: true, stats: { select: { gamesPlayed: true, updatedAt: true } } },
    }),
    prisma.user.count({ where }),
  ]);
  return {
    total,
    users: rows.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      createdAt: u.createdAt.toISOString(),
      gamesPlayed: u.stats?.gamesPlayed ?? 0,
      // `UserStats` est mis à jour à chaque fin de partie : sa date est celle de la dernière partie.
      lastGameAt: u.stats ? u.stats.updatedAt.toISOString() : null,
    })),
  };
}

export interface AdminUserDetail {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  createdAt: string;
  /** Dernière activité connue (session la plus récente) */
  lastSeenAt: string | null;
  friends: number;
  feedbacks: number;
  ban: Ban | null;
}

export async function getAdminUser(id: string): Promise<AdminUserDetail | null> {
  const u = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      email: true,
      emailVerified: true,
      createdAt: true,
      bannedAt: true,
      banReason: true,
      sessions: { orderBy: { updatedAt: "desc" }, take: 1, select: { updatedAt: true } },
      _count: { select: { feedbacks: true } },
    },
  });
  if (!u) return null;
  const friends = await prisma.friendship.count({
    where: { status: "accepted", OR: [{ requesterId: id }, { addresseeId: id }] },
  });
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    emailVerified: u.emailVerified,
    createdAt: u.createdAt.toISOString(),
    lastSeenAt: u.sessions[0]?.updatedAt.toISOString() ?? null,
    friends,
    feedbacks: u._count.feedbacks,
    ban: toBan(u),
  };
}

export interface AdminFeedback {
  id: string;
  kind: FeedbackKindName;
  message: string;
  contact: string | null;
  page: string | null;
  locale: string;
  resolved: boolean;
  createdAt: string;
  user: { id: string; name: string; email: string } | null;
}

/** Retours, du plus récent au plus ancien ; `resolved` filtre sur l'état (undefined = tous). */
export async function listFeedback(resolved: boolean | undefined, page: number): Promise<{ items: AdminFeedback[]; total: number }> {
  const where: Prisma.FeedbackWhereInput = resolved === undefined ? {} : { resolved };
  const [rows, total] = await Promise.all([
    prisma.feedback.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: page * ADMIN_PAGE_SIZE,
      take: ADMIN_PAGE_SIZE,
      include: { user: { select: { id: true, name: true, email: true } } },
    }),
    prisma.feedback.count({ where }),
  ]);
  return {
    total,
    items: rows.map((f) => ({
      id: f.id,
      kind: f.kind,
      message: f.message,
      contact: f.contact,
      page: f.page,
      locale: f.locale,
      resolved: f.resolved,
      createdAt: f.createdAt.toISOString(),
      user: f.user,
    })),
  };
}

export async function setFeedbackResolved(id: string, resolved: boolean): Promise<boolean> {
  const { count } = await prisma.feedback.updateMany({ where: { id }, data: { resolved } });
  return count > 0;
}

export async function deleteFeedback(id: string): Promise<boolean> {
  const { count } = await prisma.feedback.deleteMany({ where: { id } });
  return count > 0;
}

/* ------------------------------------------------------------------ */
/* Bans et anti-bot                                                     */
/* ------------------------------------------------------------------ */

/** Raison d'un ban : détection automatique au calcul du jour, ou décision d'un administrateur. */
export type BanReason = "bot-daily" | "manual";

export interface Ban {
  bannedAt: string;
  reason: BanReason;
}

const toBan = (u: { bannedAt: Date | null; banReason: string | null }): Ban | null =>
  u.bannedAt ? { bannedAt: u.bannedAt.toISOString(), reason: u.banReason === "bot-daily" ? "bot-daily" : "manual" } : null;

/** Ban du compte, null s'il n'est pas banni (ou n'existe plus). Lu à chaque entrée en ligne : jeton de jeu, salle, calcul du jour. */
export async function getBan(userId: string): Promise<Ban | null> {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { bannedAt: true, banReason: true } });
  return u ? toBan(u) : null;
}

/** Bannit un compte ; false s'il n'existe pas ou l'est déjà (la première raison est gardée). */
export async function banUser(userId: string, reason: BanReason, now: Date): Promise<boolean> {
  const { count } = await prisma.user.updateMany({ where: { id: userId, bannedAt: null }, data: { bannedAt: now, banReason: reason } });
  return count > 0;
}

/** Lève le ban d'un compte et classe ses signalements : ses essais du jour reviennent au classement. False s'il n'était pas banni. */
export async function unbanUser(userId: string, now: Date): Promise<boolean> {
  const [{ count }] = await prisma.$transaction([
    prisma.user.updateMany({ where: { id: userId, bannedAt: { not: null } }, data: { bannedAt: null, banReason: null } }),
    prisma.botReport.updateMany({ where: { userId, reviewedAt: null }, data: { reviewedAt: now } }),
  ]);
  return count > 0;
}

/** Une réponse de la preuve d'un signalement. */
export interface BotReportAnswer {
  text: string;
  value: number | null;
  correct: boolean;
  timeMs: number;
}

export interface AdminBotReport {
  id: string;
  source: string;
  /** Jour du calcul du jour concerné */
  ref: string;
  verdict: "bot" | "suspect";
  rules: BotRule[];
  answers: BotReportAnswer[];
  createdAt: string;
  reviewed: boolean;
}

export interface AdminBannedUser {
  id: string;
  name: string;
  email: string;
  ban: Ban;
  /** Signalements du compte, du plus récent au plus ancien : la preuve d'un ban automatique */
  reports: AdminBotReport[];
}

export interface AdminSuspect {
  user: { id: string; name: string; email: string };
  report: AdminBotReport;
}

type BotReportRow = Prisma.BotReportGetPayload<object>;

const toBotReport = (r: BotReportRow): AdminBotReport => ({
  id: r.id,
  source: r.source,
  ref: r.ref,
  verdict: r.verdict === "bot" ? "bot" : "suspect",
  rules: r.rules as BotRule[],
  answers: r.detail as unknown as BotReportAnswer[],
  createdAt: r.createdAt.toISOString(),
  reviewed: r.reviewedAt !== null,
});

/** Panel admin : comptes bannis, du ban le plus récent au plus ancien, avec leurs signalements. */
export async function listBannedUsers(page: number): Promise<{ users: AdminBannedUser[]; total: number }> {
  const where: Prisma.UserWhereInput = { bannedAt: { not: null } };
  const [rows, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { bannedAt: "desc" },
      skip: page * ADMIN_PAGE_SIZE,
      take: ADMIN_PAGE_SIZE,
      select: { id: true, name: true, email: true, bannedAt: true, banReason: true, botReports: { orderBy: { createdAt: "desc" }, take: 5 } },
    }),
    prisma.user.count({ where }),
  ]);
  return {
    total,
    users: rows.map((u) => ({ id: u.id, name: u.name, email: u.email, ban: toBan(u)!, reports: u.botReports.map(toBotReport) })),
  };
}

/** Panel admin : signalements douteux pas encore examinés, de comptes non bannis, du plus récent au plus ancien. */
export async function listSuspectReports(page: number): Promise<{ items: AdminSuspect[]; total: number }> {
  const where: Prisma.BotReportWhereInput = { reviewedAt: null, user: { bannedAt: null } };
  const [rows, total] = await Promise.all([
    prisma.botReport.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: page * ADMIN_PAGE_SIZE,
      take: ADMIN_PAGE_SIZE,
      include: { user: { select: { id: true, name: true, email: true } } },
    }),
    prisma.botReport.count({ where }),
  ]);
  return { total, items: rows.map((r) => ({ user: r.user, report: toBotReport(r) })) };
}

/** Classe un signalement sans sanction ; false s'il n'existe pas. */
export async function dismissBotReport(id: string, now: Date): Promise<boolean> {
  const { count } = await prisma.botReport.updateMany({ where: { id }, data: { reviewedAt: now } });
  return count > 0;
}

/** Signalements d'un compte, pour sa fiche du panel. */
export async function getBotReports(userId: string): Promise<AdminBotReport[]> {
  const rows = await prisma.botReport.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 20 });
  return rows.map(toBotReport);
}

/* ------------------------------------------------------------------ */
/* Donjons                                                              */
/* ------------------------------------------------------------------ */

export interface SaveDungeonRunInput {
  code: string;
  seed: string;
  startedAt: Date;
  endedAt: Date;
  summary: DungeonSummary;
}

export interface SavedDungeonRun {
  id: string;
  /** Succès débloqués par l'expédition, par id de joueur (= id du compte). */
  unlocks: Record<string, Unlock[]>;
}

/**
 * Enregistre une expédition finie (hors `saveGame` : ni Elo, ni statistiques), puis les succès de donjon.
 * Les joueurs sont des comptes (la salle refuse les invités) : `playerKey` est l'id du compte.
 */
export async function saveDungeonRun({ code, seed, startedAt, endedAt, summary }: SaveDungeonRunInput): Promise<SavedDungeonRun> {
  const keys = summary.players.map((p) => p.id);
  // Un compte supprimé pendant l'expédition n'a plus de ligne : sa part est gardée sans lien.
  const existing = new Set((await prisma.user.findMany({ where: { id: { in: keys } }, select: { id: true } })).map((u) => u.id));
  const run = await prisma.dungeonRun.create({
    data: {
      code,
      seed,
      difficulty: summary.difficulty,
      playerCount: summary.players.length,
      outcome: summary.outcome ?? "lost",
      lossReason: summary.lossReason,
      roundsPlayed: summary.roundsPlayed,
      score: summary.score,
      enemiesDefeated: summary.enemiesDefeated,
      sealsBroken: summary.sealsBroken,
      bossMaxHp: summary.bossMaxHp,
      bossHp: summary.bossHp,
      startedAt,
      endedAt,
      players: {
        create: summary.players.map((p, position) => ({
          userId: existing.has(p.id) ? p.id : null,
          playerKey: p.id,
          displayName: p.name,
          position,
          lives: p.lives,
          livesLost: p.livesLost,
          enemiesDefeated: p.enemiesDefeated,
          points: p.points,
          bossDamage: p.bossDamage,
          heartsGiven: p.heartsGiven,
          heartsReceived: p.heartsReceived,
          itemsFound: p.itemsFound,
          correct: p.correct,
          answered: p.answered,
          avgTimeMs: p.avgTimeMs,
          left: p.gone ?? false,
        })),
      },
    },
    select: { id: true },
  });
  return { id: run.id, unlocks: await grantDungeonAchievements(summary, existing) };
}

/**
 * Succès de donjon de chaque compte de l'expédition (déjà enregistrée : les compteurs relus la comptent).
 * N'échoue jamais : un bug du catalogue perd un succès, pas l'expédition.
 */
async function grantDungeonAchievements(summary: DungeonSummary, accounts: ReadonlySet<string>): Promise<Record<string, Unlock[]>> {
  const unlocks: Record<string, Unlock[]> = {};
  for (const player of summary.players) {
    if (!accounts.has(player.id)) continue;
    try {
      const facts = dungeonFactsOf(summary, player.id);
      if (!facts) continue;
      const earned = await prisma.$transaction(async (tx) => {
        const [counters, owned] = await Promise.all([
          sourceCounters(tx, player.id),
          tx.userAchievement.findMany({ where: { userId: player.id }, select: { achievementId: true } }),
        ]);
        const found = evaluateDungeonAchievements(facts, counters, new Set(owned.map((o) => o.achievementId)));
        await grantUnlocks(
          tx,
          found.map((unlock) => ({ userId: player.id, unlock, gameId: null })),
        );
        return found;
      });
      if (earned.length) unlocks[player.id] = earned;
    } catch (err) {
      console.error("[succès] donjon : échec de l'évaluation", err);
    }
  }
  return unlocks;
}

/** Une expédition enregistrée, pour sa page de bilan. */
export async function loadDungeonRun(id: string) {
  return prisma.dungeonRun.findUnique({
    where: { id },
    include: { players: { orderBy: { position: "asc" } } },
  });
}
export type DungeonRunRecord = NonNullable<Awaited<ReturnType<typeof loadDungeonRun>>>;
