/**
 * Environnement des tests e2e : base, ports et secrets dédiés,
 * pour tourner à côté de `pnpm dev` sans toucher à la base de développement.
 * Ce ne sont que des valeurs de test, jamais utilisées en production.
 */
// Surchargeables pour lancer deux suites en même temps (autre copie du dépôt, par exemple).
export const WEB_PORT = Number(process.env.E2E_WEB_PORT ?? 3100);
export const GAME_PORT = Number(process.env.E2E_GAME_PORT ?? 2667);
export const WEB_URL = `http://localhost:${WEB_PORT}`;
export const GAME_HTTP_URL = `http://localhost:${GAME_PORT}`;
export const DATABASE_URL = process.env.E2E_DATABASE_URL ?? "postgresql://calculus:calculus@127.0.0.1:5433/calculus_e2e";

export const serverEnv: Record<string, string> = {
  DATABASE_URL,
  DIRECT_URL: DATABASE_URL,
  BETTER_AUTH_SECRET: "e2e-better-auth-secret-0123456789abcdef",
  BETTER_AUTH_URL: WEB_URL,
  GAME_TOKEN_SECRET: "e2e-game-token-secret-0123456789abcdef",
  NEXT_PUBLIC_GAME_SERVER_URL: `ws://localhost:${GAME_PORT}`,
  GAME_SERVER_PORT: String(GAME_PORT),
  PORT: String(GAME_PORT),
  WEB_ORIGIN: WEB_URL,
  // Sans clé, les e-mails sont seulement affichés : les tests lisent les jetons en base.
  RESEND_API_KEY: "",
  // Tous les tests s'inscrivent depuis la même IP : le rate limit de Better Auth les bloquerait (build de production).
  AUTH_RATE_LIMIT_DISABLED: "1",
  NEXT_DIST_DIR: ".next-e2e",
  NEXT_TELEMETRY_DISABLED: "1",
};
