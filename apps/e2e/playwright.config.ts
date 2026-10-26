import { defineConfig, devices } from "@playwright/test";
import { DATABASE_URL, GAME_HTTP_URL, WEB_PORT, WEB_URL, serverEnv } from "./env";

// Les tests lisent la base e2e (jetons de réinitialisation, parties enregistrées).
process.env.DATABASE_URL = DATABASE_URL;

const ci = !!process.env.CI;
// En CI : build de production (plus rapide et plus stable) ; en local : serveur de dev.
const webCommand = ci
  ? `pnpm --filter @calculus/web exec next build && pnpm --filter @calculus/web exec next start -p ${WEB_PORT}`
  : `pnpm --filter @calculus/web exec next dev -p ${WEB_PORT}`;

export default defineConfig({
  testDir: "./tests",
  globalTeardown: "./global-teardown.ts",
  fullyParallel: true,
  forbidOnly: ci,
  retries: ci ? 2 : 0,
  workers: ci ? 2 : undefined,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: ci ? [["github"], ["html", { open: "never" }]] : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: WEB_URL,
    locale: "fr-FR",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "setup", testMatch: /global\.setup\.ts/ },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      dependencies: ["setup"],
      testIgnore: /\.mobile\.spec\.ts/,
    },
    {
      name: "mobile",
      use: { ...devices["Pixel 7"] },
      dependencies: ["setup"],
      testMatch: /\.mobile\.spec\.ts/,
    },
    {
      // Firefox : seulement le smoke (pas de reconnaissance vocale, moteur différent).
      name: "firefox",
      use: { ...devices["Desktop Firefox"] },
      dependencies: ["setup"],
      testMatch: /smoke\/.*\.spec\.ts/,
    },
  ],
  webServer: [
    {
      command: "pnpm --filter @calculus/game-server exec tsx src/index.ts",
      url: `${GAME_HTTP_URL}/health`,
      env: serverEnv,
      reuseExistingServer: !ci,
      timeout: 60_000,
    },
    {
      command: webCommand,
      url: `${WEB_URL}/fr`,
      env: serverEnv,
      reuseExistingServer: !ci,
      timeout: 240_000,
    },
  ],
});
