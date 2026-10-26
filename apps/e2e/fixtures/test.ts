import { randomUUID } from "node:crypto";
import { test as base, expect, type APIRequestContext, type Page } from "@playwright/test";
import type { GameSettings } from "@calculus/game-core";

export interface TestUser {
  name: string;
  email: string;
  password: string;
}

/** Un compte neuf par test : les tests peuvent tourner en parallèle sans se gêner. */
export function newUser(): TestUser {
  const id = randomUUID().slice(0, 8);
  return { name: `Joueur ${id.slice(0, 4)}`, email: `e2e-${id}@calculus.test`, password: `mdp-${id}-e2e` };
}

/**
 * Crée le compte par l'API Better Auth. Avec `page.request`, le navigateur est alors connecté ;
 * avec la fixture `request`, le compte existe sans que la page soit connectée.
 */
export async function signUp(api: APIRequestContext, user: TestUser = newUser()): Promise<TestUser> {
  const res = await api.post("/api/auth/sign-up/email", {
    data: { name: user.name, email: user.email, password: user.password },
  });
  expect(res.ok(), await res.text()).toBe(true);
  return user;
}

/** Réglages solo posés dans le navigateur avant le chargement (clé `calculus:solo` de `lib/storage`). */
export async function presetSolo(page: Page, settings: Partial<GameSettings>) {
  const full: GameSettings = {
    difficulty: 1,
    mode: "speed-race",
    operations: ["add"],
    parentheses: false,
    rounds: 5,
    timePerQuestion: 10,
    turnStyle: "simultaneous",
    ...settings,
  };
  await page.addInitScript((s) => localStorage.setItem("calculus:solo", JSON.stringify(s)), full);
}

export const test = base.extend<{ user: TestUser }>({
  /** Un joueur connecté avec un compte neuf. */
  user: async ({ page }, use) => {
    await use(await signUp(page.request));
  },
});

export { expect };
