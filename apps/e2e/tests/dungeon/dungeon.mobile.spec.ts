import type { Page } from "@playwright/test";
import { BASIC_OPERATIONS, OPERATION_SYMBOL } from "@calculus/game-core";
import { DungeonBot } from "../../fixtures/dungeonBot";
import { t } from "../../fixtures/i18n";
import { solveText } from "../../fixtures/oracle";
import { expect, test } from "../../fixtures/test";
import { answerBox } from "../../pages/answer";

/*
 * Donjons sur téléphone : avant chaque combat, un décompte couvre l'écran (aucun calcul envoyé pendant ce temps),
 * puis le combat s'affiche seul, le calcul en haut, sans carte, ni sac, ni défilement. Hors combat, le sac reste en haut de l'écran.
 */
test("sur téléphone, un décompte plein écran puis le calcul seul, visible sans défiler", async ({ page, user }) => {
  void user;
  test.setTimeout(90_000);
  await page.goto("/fr/dungeon");
  await page.getByRole("button", { name: t("dungeon.create") }).click();
  await expect(page).toHaveURL(/\/fr\/dungeon\/[A-Z0-9]{6}$/);
  const bot = await DungeonBot.join(page.url().split("/").at(-1)!);
  try {
    await page.getByRole("button", { name: t("dungeon.start") }).click();
    const game = page.getByTestId("dungeon-game");
    await expect(game).toHaveAttribute("data-phase", "positioning", { timeout: 15_000 });
    // Le sac est au-dessus de la carte : entier dans l'écran, sans défiler.
    await expect(page.getByTestId("dungeon-bag")).toBeInViewport({ ratio: 1 });
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    await page.getByTestId("dungeon-cell").and(page.locator('[aria-disabled="false"]')).first().click();
    await page.getByRole("button", { name: t("dungeon.lock") }).click();

    // Le décompte couvre l'écran, sans calcul derrière.
    const intro = page.getByTestId("dungeon-intro");
    await expect(intro).toBeVisible({ timeout: 25_000 });
    await expect(intro).toHaveText(/[123]/);
    await expect(page.getByTestId("calc-text")).toHaveCount(0);
    // Rien de la page ne passe devant (pied de page compris) : le centre et le bas de l'écran sont au décompte.
    const covered = await page.evaluate(() =>
      [0.5, 0.75, 0.95].every((y) => !!document.elementFromPoint(window.innerWidth / 2, window.innerHeight * y)?.closest('[data-testid="dungeon-intro"]')),
    );
    expect(covered).toBe(true);
    await page.screenshot({ path: test.info().outputPath("intro.png") });
    const box = await intro.boundingBox();
    const viewport = page.viewportSize()!;
    expect(box!.width).toBeGreaterThanOrEqual(viewport.width - 1);
    expect(box!.height).toBeGreaterThanOrEqual(viewport.height - 1);

    // Puis le combat seul : le calcul dans l'écran, au-dessus du pavé, sans carte ni sac.
    await expect(intro).toBeHidden({ timeout: 6_000 });
    const calc = page.getByTestId("calc-text");
    await expect(calc).toBeVisible();
    await expect(calc).toBeInViewport({ ratio: 1 });
    await expect(page.getByTestId("dungeon-map")).toHaveCount(0);
    await expect(page.getByTestId("dungeon-bag")).toHaveCount(0);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    const calcBox = (await calc.boundingBox())!;
    const pad = (await page.locator(".pad-dock").boundingBox())!;
    expect(calcBox.y + calcBox.height).toBeLessThanOrEqual(pad.y);
    await page.screenshot({ path: test.info().outputPath("fight.png") });
  } finally {
    await bot.leave();
  }
});

/*
 * Face au boss, sur un petit téléphone (Galaxy S20, 360 × 800) : le portrait est à côté du nom et de la vie,
 * comme pour les autres ennemis, et le calcul reste entier dans l'écran, au-dessus du pavé, sans défiler.
 */
test.describe("petit téléphone", () => {
  test.use({ viewport: { width: 360, height: 800 } });

  test("face au boss, le calcul est visible sans défiler, au-dessus du pavé", async ({ page, user }) => {
    void user;
    test.setTimeout(300_000);
    await page.goto("/fr/dungeon");
    await page.getByRole("button", { name: t("dungeon.create") }).click();
    await expect(page).toHaveURL(/\/fr\/dungeon\/[A-Z0-9]{6}$/);
    const bot = await DungeonBot.join(page.url().split("/").at(-1)!);
    // L'allié aide jusqu'au boss, puis attend : seul, il le vaincrait avant qu'on ait regardé l'écran.
    bot.policy = (g) => (g.phase === "boss" ? "idle" : "right");
    try {
      await page.getByRole("button", { name: t("dungeon.start") }).click();
      const game = page.getByTestId("dungeon-game");
      await expect(game).toHaveAttribute("data-phase", "positioning", { timeout: 15_000 });
      await reachBoss(page);

      // Le combat contre le boss, une fois le décompte passé : le calcul entier dans l'écran, au-dessus du pavé.
      await expect(page.getByTestId("dungeon-intro")).toBeHidden({ timeout: 8_000 });
      const calc = page.getByTestId("dungeon-boss").getByTestId("calc-text");
      await expect(calc).toBeVisible({ timeout: 10_000 });
      await expect(calc).toBeInViewport({ ratio: 1 });
      expect(await page.evaluate(() => window.scrollY)).toBe(0);
      const calcBox = (await calc.boundingBox())!;
      const pad = (await page.locator(".pad-dock").boundingBox())!;
      expect(calcBox.y).toBeGreaterThanOrEqual(0);
      expect(calcBox.y + calcBox.height).toBeLessThanOrEqual(pad.y);
      await page.screenshot({ path: test.info().outputPath("boss-s20.png") });
    } finally {
      await bot.leave();
    }
  });
});

/** Joue au toucher (bonnes réponses au pavé) jusqu'à ce que le combat contre le boss commence. */
async function reachBoss(page: Page) {
  const game = page.getByTestId("dungeon-game");
  const boss = game.and(page.locator('[data-phase="boss"]'));
  const lock = page.getByRole("button", { name: t("dungeon.lock") }).and(page.locator(":enabled"));
  const pickable = page.getByTestId("dungeon-cell").and(page.locator('[aria-disabled="false"]'));
  const ready = answerBox(page).and(page.locator(":enabled"));
  const keep = page.getByRole("button", { name: new RegExp(`^${t("dungeon.lootKeep")}`) }).first();
  const next = boss.or(ready).or(keep).or(lock).or(pickable.first());
  for (let step = 0; step < 300; step++) {
    await next.first().waitFor({ timeout: 40_000 });
    if (await boss.isVisible()) return;
    // Clics bornés : un bouton peut disparaître entre la vérification et le clic (vue suivante du serveur).
    if (await ready.isVisible()) await tapAnswer(page).catch(() => {});
    else if (await keep.isVisible()) await keep.click({ timeout: 2_000 }).catch(() => {});
    else if (await lock.isVisible()) await lock.click({ timeout: 2_000 }).catch(() => {});
    else if (await pickable.first().isVisible()) await pickable.first().click({ timeout: 2_000 }).catch(() => {});
  }
  throw new Error("boss jamais atteint");
}

/** Lit le calcul dès son arrivée (avant que la momie ne le cache) et tape la bonne réponse au pavé. */
async function tapAnswer(page: Page) {
  const handle = await page.waitForFunction(
    (hidden) => {
      const v = document.querySelector('[data-testid="calc-text"]')?.getAttribute("data-calc");
      return v && v !== hidden ? v : null;
    },
    t("dungeon.hiddenCalc"),
    { polling: 20, timeout: 5_000 },
  );
  const { answer } = solveText((await handle.jsonValue()) as string);
  const keypad = page.locator(".keypad");
  const op = BASIC_OPERATIONS.find((o) => OPERATION_SYMBOL[o] === answer);
  if (op) await keypad.getByRole("button", { name: t(`game.operator.${op}`), exact: true }).click();
  else for (const d of answer) await keypad.getByRole("button", { name: d, exact: true }).click();
  await keypad.getByRole("button", { name: t("game.submit") }).click();
  await expect(answerBox(page).and(page.locator(":enabled"))).toHaveCount(0);
}
