import { t } from "../../fixtures/i18n";
import { expect, presetSolo, test } from "../../fixtures/test";
import { SoloPage } from "../../pages/SoloPage";

test("sur téléphone, la correction d'une erreur reste jusqu'au bouton « Suivant »", async ({ page }) => {
  await presetSolo(page, { rounds: 5 });
  const solo = new SoloPage(page, true);
  await solo.goto();
  await solo.start();
  const missed = await solo.play("wrong");
  await expect(page.locator(".solo-review")).toContainText(`${t("solo.correction")} ${missed.text} = ${missed.answer}`);
  const next = page.getByRole("button", { name: t("solo.next") });
  await expect(next).toBeInViewport();
  await next.tap();
  await expect(solo.answer).toBeEnabled();
  await solo.playAll(["right", "right", "right", "right"]);
  await expect(solo.verdict).toHaveText("4/5");
});
