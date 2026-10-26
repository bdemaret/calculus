import { PrismaClient, Prisma } from "@prisma/client";
import {
  buildReport,
  type GameReport,
  type GameSettings,
  type OpTag,
  type PlayerState,
  type RoundRecord,
  type Standing,
} from "@calculus/game-core";
import { randomUUID } from "node:crypto";

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

/** Enregistre la partie, ses calculs, les réponses, puis met à jour les statistiques. Renvoie l'id de la partie. */
export async function saveGame(input: SaveGameInput): Promise<string> {
  const gameId = randomUUID();
  const playerRowId = new Map<string, string>();
  for (const s of input.standings) playerRowId.set(s.player.id, randomUUID());
  const multiplayer = input.standings.length > 1;

  await prisma.$transaction(async (tx) => {
    await tx.game.create({
      data: {
        id: gameId,
        code: input.code,
        solo: input.solo,
        hostId: input.hostUserId,
        settings: input.settings as unknown as Prisma.InputJsonValue,
        mode: input.settings.mode,
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
      })),
    });

    const questionRows = input.history.map((r) => ({
      id: randomUUID(),
      gameId,
      position: r.index,
      text: r.question.text,
      answer: r.question.answer,
      tags: r.question.tags,
      difficulty: r.question.difficulty,
      timeLimitMs: r.timeLimitMs,
      activePlayerKey: r.activePlayerId,
    }));
    if (questionRows.length) await tx.question.createMany({ data: questionRows });

    const answerRows = input.history.flatMap((r, i) =>
      r.answers
        .filter((a) => playerRowId.has(a.playerId))
        .map((a) => ({
          questionId: questionRows[i]!.id,
          playerId: playerRowId.get(a.playerId)!,
          value: a.value,
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

  return gameId;
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
}

export async function loadGameReport(id: string): Promise<StoredGameReport | null> {
  const game = await prisma.game.findUnique({
    where: { id },
    include: {
      players: { orderBy: { rank: "asc" } },
      questions: { orderBy: { position: "asc" }, include: { answers: true } },
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
  const settings = game.settings as unknown as GameSettings;
  const history: RoundRecord[] = game.questions.map((q) => {
    const answers = q.answers
      .map((a) => ({ playerId: keyByRow.get(a.playerId) ?? "?", value: a.value, correct: a.correct, timeMs: a.timeMs }))
      .sort((a, b) => a.timeMs - b.timeMs);
    // Course de vitesse : le point revient à la première bonne réponse arrivée.
    const first = settings.mode === "speed-race" ? answers.find((a) => a.correct) : undefined;
    return {
      index: q.position,
      question: { index: q.position, text: q.text, answer: q.answer, tags: q.tags as OpTag[], difficulty: settings.difficulty },
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

  return {
    id: game.id,
    code: game.code,
    solo: game.solo,
    settings,
    endedAt: game.endedAt,
    report: buildReport(standings, history),
    playerKeyByUser,
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
    mode: string;
    difficulty: number;
    rank: number;
    players: number;
    score: number;
    accuracy: number;
    avgCorrectMs: number | null;
  }[];
  byOperation: { tag: OpTag; attempts: number; correct: number; avgCorrectMs: number | null }[];
}

export async function getDashboard(userId: string): Promise<DashboardData> {
  const [s, recentRows, answers] = await Promise.all([
    prisma.userStats.findUnique({ where: { userId } }),
    prisma.gamePlayer.findMany({
      where: { userId },
      orderBy: { game: { endedAt: "desc" } },
      take: 30,
      include: { game: { select: { id: true, endedAt: true, solo: true, mode: true, difficulty: true, _count: { select: { players: true } } } } },
    }),
    prisma.answer.findMany({
      where: { player: { userId } },
      orderBy: { player: { game: { endedAt: "desc" } } },
      take: 3000,
      select: { correct: true, timeMs: true, question: { select: { tags: true } } },
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
      mode: r.game.mode,
      difficulty: r.game.difficulty,
      rank: r.rank,
      players: r.game._count.players,
      score: r.score,
      accuracy: r.answered ? r.correct / r.answered : 0,
      avgCorrectMs: r.correct ? Math.round(r.correctTimeMs / r.correct) : null,
    })),
    byOperation: [...ops.values()].map((o) => ({
      tag: o.tag,
      attempts: o.attempts,
      correct: o.correct,
      avgCorrectMs: o.correct ? Math.round(o.time / o.correct) : null,
    })),
  };
}

/* ------------------------------------------------------------------ */
/* Amis                                                                 */
/* ------------------------------------------------------------------ */

/** Demandes d'ami en attente qu'un joueur peut avoir envoyées en même temps (limite le spam). */
const MAX_PENDING_REQUESTS = 50;
/** Durée de validité d'une invitation à une partie, en ms. */
export const INVITE_TTL_MS = 10 * 60 * 1000;

export interface FriendSummary {
  id: string;
  name: string;
  gamesPlayed: number;
  /** Victoires en ligne */
  wins: number;
  /** Part de bonnes réponses (0 à 1), null sans aucune réponse */
  accuracy: number | null;
}

export interface FriendsData {
  friends: FriendSummary[];
  /** Demandes reçues, à accepter ou refuser */
  incoming: { id: string; name: string }[];
  /** Demandes envoyées, pas encore acceptées */
  outgoing: { id: string; name: string }[];
}

export type FriendRequestResult =
  | { status: "sent" | "accepted" | "already-sent" | "already-friends"; name: string }
  | { status: "not-found" | "ambiguous" | "self" | "too-many" };

const friendUserSelect = {
  id: true,
  name: true,
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
        gamesPlayed: s?.gamesPlayed ?? 0,
        wins: s?.wins ?? 0,
        accuracy: s?.answered ? s.correct / s.answered : null,
      });
    } else if (r.requesterId === userId) data.outgoing.push({ id: other.id, name: other.name });
    else data.incoming.push({ id: other.id, name: other.name });
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
  const h = handle.trim();
  const matches = await prisma.user.findMany({
    where: h.includes("@") ? { email: { equals: h, mode: "insensitive" } } : { name: { equals: h, mode: "insensitive" } },
    select: { id: true, name: true },
    take: 2,
  });
  if (matches.length === 0) return { status: "not-found" };
  if (matches.length > 1) return { status: "ambiguous" };
  const target = matches[0]!;
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

/** Invite un ami dans un lobby (remplace l'invitation précédente). Renvoie false si ce n'est pas un ami. */
export async function sendGameInvite(fromId: string, toId: string, code: string, now: Date): Promise<boolean> {
  if (fromId === toId || !(await areFriends(fromId, toId))) return false;
  const expiresAt = new Date(now.getTime() + INVITE_TTL_MS);
  await prisma.gameInvite.upsert({
    where: { fromId_toId: { fromId, toId } },
    create: { fromId, toId, code, createdAt: now, expiresAt },
    update: { code, createdAt: now, expiresAt },
  });
  return true;
}

export interface GameInviteSummary {
  id: string;
  code: string;
  fromName: string;
  createdAt: string;
}

/** Invitations encore valables reçues par un joueur ; efface au passage les siennes qui ont expiré. */
export async function getGameInvites(userId: string, now: Date): Promise<GameInviteSummary[]> {
  await prisma.gameInvite.deleteMany({ where: { toId: userId, expiresAt: { lte: now } } });
  const rows = await prisma.gameInvite.findMany({
    where: { toId: userId },
    orderBy: { createdAt: "desc" },
    include: { from: { select: { name: true } } },
  });
  return rows.map((r) => ({ id: r.id, code: r.code, fromName: r.from.name, createdAt: r.createdAt.toISOString() }));
}

/** Supprime une invitation reçue (rejointe ou ignorée). */
export async function dismissGameInvite(userId: string, inviteId: string): Promise<void> {
  await prisma.gameInvite.deleteMany({ where: { id: inviteId, toId: userId } });
}
