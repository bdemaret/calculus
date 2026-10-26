import { t } from "../../fixtures/i18n";
import { expect, presetSolo, test } from "../../fixtures/test";
import { SoloPage } from "../../pages/SoloPage";

test("sur téléphone, le bon compte se joue en touchant les plaques", async ({ page }) => {
  await presetSolo(page, { game: "right-count", operations: ["add", "sub", "mul"], difficulty: 2, timePerQuestion: 60 });
  const solo = new SoloPage(page, true);
  await solo.goto();
  await solo.start();
  await expect(page.getByRole("group", { name: t("game.tiles") })).toBeVisible();
  await expect(solo.answer).toHaveAttribute("readonly", "");
  await solo.playAll(["right", "right", "right", "right", "right"]);
  await expect(solo.verdict).toHaveText("5/5");
});
