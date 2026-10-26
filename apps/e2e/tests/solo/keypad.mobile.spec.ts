import { t } from "../../fixtures/i18n";
import { expect, presetSolo, test } from "../../fixtures/test";
import { SoloPage } from "../../pages/SoloPage";

test("sur téléphone, on joue avec le pavé intégré", async ({ page }) => {
  await presetSolo(page, { rounds: 5 });
  const solo = new SoloPage(page, true);
  await solo.goto();
  await solo.start();
  await expect(page.getByRole("button", { name: t("game.submit") })).toBeVisible();
  // Le clavier système ne doit pas s'ouvrir : la case est en lecture seule.
  await expect(solo.answer).toHaveAttribute("readonly", "");
  await solo.playAll(["right", "right", "right", "right", "right"]);
  await expect(solo.verdict).toHaveText("5/5");
});
