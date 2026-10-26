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
