import { expect, test } from "@playwright/test";
import { t } from "../../fixtures/i18n";

test("sur téléphone, l'accueil montre d'abord les façons de jouer, l'échauffement reste replié", async ({ page }) => {
  await page.goto("/fr");
  // Les deux grands choix tiennent dans le premier écran.
  await expect(page.getByRole("link", { name: new RegExp(t("home.playOnline")) })).toBeInViewport();
  await expect(page.getByRole("link", { name: new RegExp(t("home.playSolo")) })).toBeInViewport();
  // Pas de pavé tant qu'on ne touche pas l'échauffement.
  const submit = page.getByRole("button", { name: t("game.submit") });
  await expect(page.getByText(t("home.warmup"))).toBeVisible();
  await expect(submit).toHaveCount(0);
  await page.getByRole("region", { name: t("home.warmup") }).getByRole("button").click();
  await expect(submit).toBeVisible();
  await expect(page.getByRole("textbox", { name: t("game.yourAnswer") })).toHaveAttribute("readonly", "");
});
