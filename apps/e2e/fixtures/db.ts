import { prisma } from "@calculus/db";

/** Jeton de réinitialisation de mot de passe émis pour ce compte (Better Auth le stocke dans `verification`). */
export async function resetTokenFor(email: string): Promise<string> {
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  const row = await prisma.verification.findFirst({
    where: { value: user.id, identifier: { startsWith: "reset-password:" } },
    orderBy: { createdAt: "desc" },
  });
  if (!row) throw new Error(`Aucun jeton de réinitialisation pour ${email}`);
  return row.identifier.slice("reset-password:".length);
}

/** Parties enregistrées pour ce compte, la plus récente d'abord. */
export async function gamesOf(email: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  return prisma.gamePlayer.findMany({
    where: { userId: user.id },
    include: { game: true },
    orderBy: { game: { endedAt: "desc" } },
  });
}

/** Le compte existe-t-il encore (après une suppression) ? */
export async function userExists(email: string): Promise<boolean> {
  return (await prisma.user.count({ where: { email } })) > 0;
}

/** Pose directement en base une partie solo et une partie en ligne (avec un invité) pour ce compte. */
export async function seedGamesFor(email: string): Promise<{ soloId: string; onlineId: string }> {
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  const now = new Date();
  const game = (solo: boolean) => ({
    solo,
    code: solo ? null : "E2EDEL",
    settings: {},
    mode: "speed-race",
    difficulty: 1,
    turnStyle: "simultaneous",
    seed: "e2e",
    rounds: 1,
    startedAt: now,
    endedAt: now,
  });
  const player = (key: string, name: string, userId: string | null, rank: number) => ({
    playerKey: key, displayName: name, userId, rank, score: 0, alive: true, answered: 0, correct: 0, correctTimeMs: 0, bestStreak: 0,
  });
  const solo = await prisma.game.create({ data: { ...game(true), players: { create: [player(user.id, user.name, user.id, 1)] } } });
  const online = await prisma.game.create({
    data: { ...game(false), players: { create: [player(user.id, user.name, user.id, 1), player("guest-e2e", "Invité", null, 2)] } },
  });
  return { soloId: solo.id, onlineId: online.id };
}

/** Partie et pseudos de ses joueurs (null si la partie n'existe plus). */
export async function gameWithPlayers(id: string) {
  return prisma.game.findUnique({ where: { id }, include: { players: { orderBy: { rank: "asc" } } } });
}

/** Donne à ce compte des titres, comme s'il les avait débloqués. */
export async function grantTitles(email: string, titleIds: string[]): Promise<void> {
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  await prisma.userTitle.createMany({ data: titleIds.map((titleId) => ({ userId: user.id, titleId, source: "achievement" })) });
}

export interface SeededGame {
  game: string;
  difficulty: number;
  solo: boolean;
  rank: number;
  answered: number;
  correct: number;
  correctTimeMs: number;
  bestStreak: number;
}

/** Pose en base des parties de jeux et de difficultés variés, et les compteurs `UserStats` qui vont avec (comme `saveGame`). */
export async function seedDashboardGamesFor(email: string, games: SeededGame[]): Promise<void> {
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  const now = new Date();
  for (const g of games) {
    const player = (key: string, name: string, userId: string | null, rank: number, mine: boolean) => ({
      playerKey: key, displayName: name, userId, rank, score: 0, alive: true,
      answered: mine ? g.answered : 0, correct: mine ? g.correct : 0, correctTimeMs: mine ? g.correctTimeMs : 0, bestStreak: mine ? g.bestStreak : 0,
    });
    const players = [player(user.id, user.name, user.id, g.rank, true)];
    if (!g.solo) players.push(player("guest-e2e", "Invité", null, g.rank === 1 ? 2 : 1, false));
    await prisma.game.create({
      data: {
        solo: g.solo, code: g.solo ? null : "E2EDSH", settings: {}, game: g.game, mode: "speed-race", difficulty: g.difficulty,
        turnStyle: "simultaneous", seed: "e2e", rounds: g.answered, startedAt: now, endedAt: now, players: { create: players },
      },
    });
  }
  const sum = (k: "answered" | "correct" | "correctTimeMs") => games.reduce((n, g) => n + g[k], 0);
  await prisma.userStats.create({
    data: {
      userId: user.id,
      gamesPlayed: games.length,
      onlineGames: games.filter((g) => !g.solo).length,
      soloGames: games.filter((g) => g.solo).length,
      wins: games.filter((g) => !g.solo && g.rank === 1).length,
      answered: sum("answered"),
      correct: sum("correct"),
      totalCorrectTimeMs: BigInt(sum("correctTimeMs")),
      bestStreak: Math.max(...games.map((g) => g.bestStreak)),
    },
  });
}

/** Expéditions de donjon enregistrées pour ce compte, la plus récente d'abord, avec leurs joueurs. */
export async function dungeonRunsOf(email: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  return prisma.dungeonRun.findMany({
    where: { players: { some: { userId: user.id } } },
    include: { players: { orderBy: { position: "asc" } } },
    orderBy: { endedAt: "desc" },
  });
}
