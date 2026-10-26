import { execSync } from "node:child_process";
import { test as setup } from "@playwright/test";
import { prisma } from "@calculus/db";
import { DATABASE_URL } from "../env";

/** Base e2e : applique les migrations (crée la base si besoin) puis repart de zéro. */
setup("prépare la base e2e", async () => {
  execSync("pnpm --filter @calculus/db exec prisma migrate deploy", {
    env: { ...process.env, DATABASE_URL },
    stdio: "pipe",
  });
  await prisma.$executeRawUnsafe(`TRUNCATE "user", "game", "verification" CASCADE`);
  await prisma.$disconnect();
});

/**
 * En `next dev`, chaque page est compilée à sa première visite : sous la charge des tests
 * en parallèle, ces compilations simultanées renvoient parfois des 500. On les fait une à une avant.
 */
setup("compile les pages à l'avance", async ({ request }) => {
  setup.setTimeout(240_000);
  const pages = ["/fr", "/fr/modes", "/fr/solo", "/fr/online", "/fr/login", "/fr/signup", "/fr/forgot-password", "/fr/reset-password", "/fr/dashboard", "/fr/profile", "/fr/friends", "/fr/leaderboard/battle-royale", "/fr/legal", "/fr/privacy", "/fr/terms", "/en/privacy", "/en"];
  for (const path of pages) {
    const res = await request.get(path, { timeout: 120_000 });
    if (res.status() >= 500) throw new Error(`${path} répond ${res.status()}`);
  }
});
