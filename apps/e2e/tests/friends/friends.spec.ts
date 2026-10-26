import { WEB_URL } from "../../env";
import { t } from "../../fixtures/i18n";
import { expect, newUser, signUp, test } from "../../fixtures/test";

test.describe("amis", () => {
  test("demande par e-mail, acceptation, invitation puis lobby rejoint", async ({ page, user, browser }) => {
    // Le second joueur, connecté dans son propre navigateur.
    const ctx = await browser.newContext({ baseURL: WEB_URL, locale: "fr-FR" });
    const other = await ctx.newPage();
    const friend = await signUp(other.request);

    // Depuis le profil, page « Mes amis », demande par e-mail.
    await page.goto("/fr/profile");
    await page.getByRole("link", { name: t("profile.friends") }).click();
    await expect(page).toHaveURL(/\/fr\/friends$/);
    await page.getByLabel(t("friends.addLabel")).fill(friend.email);
    await page.getByRole("button", { name: t("friends.add") }).click();
    await expect(page.getByText(t("friends.result.sent", { name: friend.name }))).toBeVisible();
    await expect(page.getByRole("heading", { name: t("friends.outgoingTitle") })).toBeVisible();

    // L'autre joueur accepte.
    await other.goto("/fr/friends");
    await expect(other.getByRole("heading", { name: t("friends.incomingTitle") })).toBeVisible();
    await other.getByRole("button", { name: t("friends.accept") }).click();
    await expect(other.getByRole("button", { name: t("friends.invite") })).toBeVisible();

    // Invitation : un lobby est créé et l'ami reçoit le bandeau.
    await page.reload();
    await page.getByRole("button", { name: t("friends.invite") }).click();
    await page.waitForURL(/\/fr\/lobby\/[A-Z0-9]{6}$/);
    const code = page.url().split("/").pop() as string;

    await other.goto("/fr");
    await expect(other.getByText(t("friends.noticeText", { name: user.name }))).toBeVisible();
    await other.getByRole("button", { name: t("friends.noticeJoin") }).click();
    await other.waitForURL(new RegExp(`/fr/lobby/${code}$`));
    await expect(page.getByTestId("lobby-slots").locator(".slot.filled").filter({ hasText: friend.name })).toBeVisible();

    await ctx.close();
  });

  test("demande par pseudo et erreurs", async ({ page, user, request }) => {
    const friend = await signUp(request, newUser());
    await page.goto("/fr/friends");
    const input = page.getByLabel(t("friends.addLabel"));
    const send = page.getByRole("button", { name: t("friends.add") });

    await input.fill("personne-ne-porte-ce-pseudo");
    await send.click();
    await expect(page.getByText(t("friends.error.not-found"))).toBeVisible();

    await input.fill(user.email);
    await send.click();
    await expect(page.getByText(t("friends.error.self"))).toBeVisible();

    await input.fill(friend.name.toUpperCase());
    await send.click();
    await expect(page.getByText(t("friends.result.sent", { name: friend.name }))).toBeVisible();

    await input.fill(friend.name);
    await send.click();
    await expect(page.getByText(t("friends.result.already-sent", { name: friend.name }))).toBeVisible();
  });

  test("page réservée aux joueurs connectés", async ({ page }) => {
    await page.goto("/fr/friends");
    await expect(page).toHaveURL(/\/fr\/login$/);
  });
});
