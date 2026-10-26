import { expect, test } from "@playwright/test";
import { GAME_HTTP_URL } from "../../env";
import { t, tr } from "../../fixtures/i18n";
import { expectedAnswer } from "../../fixtures/oracle";

test("la racine redirige vers le français", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/fr$/);
  await expect(page.getByText(t("home.lede"))).toBeVisible();
});

test("l'accueil existe en français et en anglais", async ({ page }) => {
  await page.goto("/en");
  await expect(page.getByText(tr("home.lede", {}, "en"))).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await page.goto("/fr");
  await expect(page.getByText(t("home.lede"))).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "fr");
});

test("le calcul de l'accueil se joue", async ({ page }) => {
  await page.goto("/fr");
  const input = page.getByRole("textbox", { name: t("game.yourAnswer") });
  await expect(input).toBeEnabled();
  const { answer } = await expectedAnswer(page);
  await input.fill(String(answer + 1));
  await input.press("Enter");
  await expect(page.getByText(t("home.wrong", { answer }))).toBeVisible();
});

test("le serveur de jeu répond sur /health", async ({ request }) => {
  const res = await request.get(`${GAME_HTTP_URL}/health`);
  expect(res.status()).toBe(200);
  expect(await res.text()).toBe("ok");
});

for (const path of ["/fr", "/fr/games", "/fr/solo", "/fr/online", "/fr/login", "/fr/signup", "/fr/forgot-password", "/fr/leaderboard/standard/battle-royale", "/fr/legal", "/fr/privacy", "/fr/terms", "/en/privacy", "/en/solo"]) {
  test(`aucune erreur JavaScript sur ${path}`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    const res = await page.goto(path);
    expect(res?.status()).toBe(200);
    // Pas de `networkidle` : le websocket de rechargement de `next dev` ne s'arrête jamais.
    await page.waitForLoadState("load");
    await expect(page.getByRole("main")).toBeVisible();
    // Laisse le temps à l'hydratation de lever une éventuelle erreur.
    await page.waitForTimeout(1_000);
    expect(errors).toEqual([]);
  });
}
