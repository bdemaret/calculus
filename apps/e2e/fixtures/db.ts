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
