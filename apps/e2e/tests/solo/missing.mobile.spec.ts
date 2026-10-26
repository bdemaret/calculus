import { t } from "../../fixtures/i18n";
import { expect, presetSolo, test } from "../../fixtures/test";
import { SoloPage } from "../../pages/SoloPage";

test("sur téléphone, un opérateur manquant se choisit sur le pavé des opérateurs", async ({ page }) => {
  await presetSolo(page, { game: "missing", missingKind: "operator", difficulty: 3, operations: ["add", "sub", "mul", "div"], timePerQuestion: 20 });
  const solo = new SoloPage(page, true);
  await solo.goto();
  await solo.start();
  await expect(page.getByRole("button", { name: t("game.operator.mul"), exact: true })).toBeVisible();
  // Pas de chiffres sur ce pavé.
  await expect(page.locator(".keypad").getByRole("button", { name: "7", exact: true })).toHaveCount(0);
  await solo.playAll(["right", "right", "right", "right", "right"]);
  await expect(solo.verdict).toHaveText("5/5");
});
