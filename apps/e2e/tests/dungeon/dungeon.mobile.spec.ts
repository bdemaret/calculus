import { DungeonBot } from "../../fixtures/dungeonBot";
import { t } from "../../fixtures/i18n";
import { expect, test } from "../../fixtures/test";

/*
 * Donjons sur téléphone : avant chaque combat, un décompte couvre l'écran (aucun calcul envoyé pendant ce temps),
 * puis le combat s'affiche seul, le calcul en haut, sans carte, ni sac, ni défilement.
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
    await page.getByTestId("dungeon-cell").and(page.locator('[aria-disabled="false"]')).first().click();
    await page.getByRole("button", { name: t("dungeon.lock") }).click();

    // Le décompte couvre l'écran, sans calcul derrière.
    const intro = page.getByTestId("dungeon-intro");
    await expect(intro).toBeVisible({ timeout: 25_000 });
    await expect(intro).toHaveText(/[123]/);
    await expect(page.getByTestId("calc-text")).toHaveCount(0);
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
