import { expect, test, type Page } from "@playwright/test";
import { RELEASED_AT } from "../../env";
import { t, tr } from "../../fixtures/i18n";

const HOUR = 60 * 60 * 1000;

/** Version en ligne, lue dans le lien du pied de page (« Nouveautés · v1.2.3 »). */
async function appVersion(page: Page): Promise<string> {
  const text = await page.getByRole("contentinfo").getByRole("link", { name: /v\d+\.\d+\.\d+/ }).innerText();
  return /v(\d+\.\d+\.\d+)/.exec(text)![1]!;
}

test("le pied de page affiche la version et mène aux nouveautés, en français et en anglais", async ({ page }) => {
  await page.goto("/fr");
  const version = await appVersion(page);
  await page.getByRole("link", { name: t("changelog.footer", { version }) }).click();
  await expect(page).toHaveURL(/\/fr\/changelog$/);
  await expect(page.getByRole("heading", { name: t("changelog.title") })).toBeVisible();
  await expect(page.getByRole("heading", { name: new RegExp(t("changelog.version", { version })) })).toBeVisible();
  await page.goto("/en/changelog");
  await expect(page.getByRole("heading", { name: tr("changelog.title", {}, "en") })).toBeVisible();
});

test("pas de bandeau de nouvelle version plus de 48 h après la mise en production", async ({ page }) => {
  await page.clock.setFixedTime(new Date(Date.parse(RELEASED_AT) + 49 * HOUR));
  await page.goto("/fr");
  await expect(page.getByRole("contentinfo")).toBeVisible();
  await expect(page.getByRole("link", { name: t("changelog.noticeOpen") })).toHaveCount(0);
});

test("le bandeau de nouvelle version s'affiche aux invités jusqu'à ce qu'il soit lu", async ({ page }) => {
  await page.clock.setFixedTime(new Date(Date.parse(RELEASED_AT) + 2 * HOUR));
  await page.goto("/fr");
  const version = await appVersion(page);
  const notice = page.getByRole("status").filter({ hasText: t("changelog.noticeText", { version }) });
  await expect(notice).toBeVisible();
  await notice.getByRole("link", { name: t("changelog.noticeOpen") }).click();
  await expect(page).toHaveURL(/\/fr\/changelog$/);
  await expect(notice).toHaveCount(0);
  // Lu : il ne revient plus, même après un rechargement.
  await page.goto("/fr/games");
  await expect(page.getByRole("heading", { level: 2 }).first()).toBeVisible();
  await expect(notice).toHaveCount(0);
});

test("fermer le bandeau de nouvelle version le retire pour de bon", async ({ page }) => {
  await page.clock.setFixedTime(new Date(Date.parse(RELEASED_AT) + 47 * HOUR));
  await page.goto("/fr");
  const close = page.getByRole("button", { name: t("changelog.noticeDismiss") });
  await close.click();
  await expect(close).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("contentinfo")).toBeVisible();
  await expect(page.getByRole("link", { name: t("changelog.noticeOpen") })).toHaveCount(0);
});
