import { PrismaClient, Prisma } from "@prisma/client";
import {
  GAMES,
  GAME_IDS,
  INITIAL_RATING,
  PLACEMENT_GAMES,
  buildReport,
  closestAnswers,
  computeRatingChanges,
  describeRatingChange,
  type AnswerRecord,
  type GameId,
  type GameReport,
  type GameSettings,
  type OpTag,
  type PlayerState,
  type Puzzle,
  type Question,
  type RatingChange,
  type RoundRecord,
  type Standing,
} from "@calculus/game-core";
import { randomUUID } from "node:crypto";
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
  });

  return { id: gameId, ratings };
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

export async function loadGameReport(id: string): Promise<StoredGameReport | null> {
  const game = await prisma.game.findUnique({
    where: { id },
    include: {
      players: { orderBy: { rank: "asc" } },
      questions: { orderBy: [{ position: "asc" }, { forPlayerKey: "asc" }], include: { answers: true } },
    },
  });
  if (!game) return null;

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
  const toQuestion = (q: (typeof game.questions)[number]): Question => ({
    index: q.position,
    text: q.text,
    answer: q.answer,
    solution: q.solution ?? String(q.answer),
    // À la bombe, `puzzle` est le tirage de la manche ; le calcul de chacun est un calcul standard.
    puzzle: q.forPlayerKey ? { game: "standard" } : ((q.puzzle as Puzzle | null) ?? { game: "standard" }),
    tags: q.tags as OpTag[],
    difficulty: settings.difficulty,
  });
  // Les lignes d'une même manche (une par destinataire à la bombe) sont regroupées.
  const byPosition = new Map<number, (typeof game.questions)[number][]>();
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
      ...(personal ? { personal } : {}),
      activePlayerId: q.activePlayerKey,
      startedAt: 0,
      timeLimitMs: q.timeLimitMs,
      answers,
      eliminated: [],
      scorers: first ? [first.playerId] : [],
      spared: false,
    };
  });

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
}

/** Jeux comptés dans les statistiques par opération du tableau de bord. */
const OPERATION_STATS_GAMES: GameId[] = GAME_IDS.filter((g) => GAMES[g].operationStats);

export async function getDashboard(userId: string): Promise<DashboardData> {
  const [s, recentRows, answers, ratingRows] = await Promise.all([
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
const leaderboardSelect = { userId: true, rating: true, games: true, user: { select: { name: true } } } as const;
type LeaderboardRow = { userId: string; rating: number; games: number; user: { name: string } };

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
  /** Uniquement là où le placement est terminé : l'Elo caché ne quitte jamais la base. */
  rankings: PlayerRanking[];
  /** Lien avec le joueur connecté, null pour un visiteur */
  friendship: FriendshipState | null;
}

/**
 * Profil public d'un joueur, ouvert depuis le classement. Ne montre que ce que le classement rend déjà public
 * (pseudo, Elo, place, parties, % de victoires), jamais l'e-mail ni les statistiques privées.
 */
export async function getPlayerProfile(userId: string, viewerId?: string): Promise<PlayerProfile | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      ratings: { where: { games: { gte: PLACEMENT_GAMES } }, orderBy: [{ game: "asc" }, { mode: "asc" }, { difficulty: "asc" }] },
    },
  });
  if (!user) return null;
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
  return { id: user.id, name: user.name, rankings, friendship };
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
export async function sendGameInvite(fromId: string, toId: string, code: string, now: Date): Promise<boolean> {
  if (fromId === toId || !(await areFriends(fromId, toId))) return false;
  const expiresAt = new Date(now.getTime() + INVITE_TTL_MS);
  await prisma.gameInvite.upsert({
    where: { fromId_toId_code: { fromId, toId, code } },
    create: { fromId, toId, code, createdAt: now, expiresAt },
    update: { createdAt: now, expiresAt },
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
  return rows.map((r) => ({ id: r.id, code: r.code, fromName: r.from.name, guildName: r.guild?.name ?? null, createdAt: r.createdAt.toISOString() }));
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
    return await prisma.$transaction(async (tx) => {
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
  ]);
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
 * entre les instances serverless ; une seule requête atomique, sans course entre deux appels.
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
