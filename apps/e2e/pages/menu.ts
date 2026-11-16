import type { Locator, Page } from "@playwright/test";
import { t } from "../fixtures/i18n";

/** Ouvre le menu du site (bouton de la marge) et renvoie sa navigation principale. */
export async function openSiteMenu(page: Page): Promise<Locator> {
  // Le nom du bouton s'allonge quand des invitations de guilde attendent.
  await page.getByRole("button", { name: new RegExp(`^${t("nav.openMenu")}`) }).click();
  return page.getByRole("dialog", { name: t("nav.menu") }).getByRole("navigation", { name: t("nav.main") });
}
