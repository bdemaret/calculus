/**
 * Rattrapage des succès : rejoue l'historique de chaque compte, une transaction par compte.
 *
 *   pnpm --filter @calculus/db backfill:achievements --dry-run   montre ce qui serait fait, sans rien écrire
 *   pnpm --filter @calculus/db backfill:achievements             recalcule les compteurs et débloque
 *
 * Relançable sans risque. En production : sauvegarde de la base avant, après le déploiement de la migration.
 * Les déblocages sont datés de la partie et marqués comme vus, pour ne pas noyer les joueurs.
 */
import { backfillAchievements, prisma } from "../src/index";

const dryRun = process.argv.includes("--dry-run");
const users = await prisma.user.findMany({ select: { id: true }, orderBy: { id: "asc" } });

const unlocked = new Map<string, number>();
let games = 0;
let skipped = 0;
let failed = 0;
for (const [i, { id }] of users.entries()) {
  try {
    const result = await backfillAchievements(id, { dryRun });
    games += result.games;
    skipped += result.skipped;
    for (const achievementId of result.unlocked) unlocked.set(achievementId, (unlocked.get(achievementId) ?? 0) + 1);
  } catch (err) {
    failed += 1;
    console.error(`Compte ${id} : échec, rien n'a changé pour lui`, err);
  }
  if ((i + 1) % 100 === 0) console.log(`${i + 1} / ${users.length} comptes`);
}

console.log(`${dryRun ? "Simulation : " : ""}${users.length} comptes, ${games} participations, ${skipped} parties illisibles, ${failed} comptes en échec`);
for (const [id, count] of [...unlocked].sort((a, b) => b[1] - a[1])) console.log(`  ${id} : ${count}`);
await prisma.$disconnect();
if (failed > 0) process.exitCode = 1;
