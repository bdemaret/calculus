import { WEB_URL } from "../../env";
import { t } from "../../fixtures/i18n";
import { expect, newUser, signUp, test } from "../../fixtures/test";

test.describe("guildes", () => {
  test("fondation, invitation, membre en ligne, lobby de guilde puis exclusion", async ({ page, user, browser }) => {
    const ctx = await browser.newContext({ baseURL: WEB_URL, locale: "fr-FR" });
    const other = await ctx.newPage();
    const member = await signUp(other.request);
    const guildName = `G ${user.name}`.slice(0, 24);

    // Fondation depuis le lien « Guilde » de l'en-tête.
    await page.goto("/fr");
    await page.getByRole("navigation", { name: t("nav.main") }).getByRole("link", { name: t("nav.guild") }).click();
    await expect(page).toHaveURL(/\/fr\/guild$/);
    await page.getByLabel(t("guild.nameLabel")).fill(guildName);
    await page.getByRole("button", { name: t("guild.create") }).click();
    await expect(page.getByRole("heading", { name: guildName })).toBeVisible();
    await expect(page.locator(".guild-members li")).toHaveCount(1);

    // Invitation par e-mail : l'autre joueur n'est pas un ami.
    await page.getByLabel(t("guild.inviteLabel")).fill(member.email);
    await page.getByRole("button", { name: t("guild.invite"), exact: true }).click();
    await expect(page.getByText(t("guild.inviteResult.sent", { name: member.name }))).toBeVisible();
    await expect(page.getByRole("heading", { name: t("guild.pendingTitle") })).toBeVisible();

    // L'invité voit la pastille de l'en-tête et rejoint.
    await other.goto("/fr");
    // (`t` ne gère pas les pluriels ICU : le libellé accessible commence par « Guilde ».)
    const guildLink = other.getByRole("navigation", { name: t("nav.main") }).getByRole("link", { name: new RegExp(`^${t("nav.guild")}`) });
    await expect(guildLink.locator(".nav-dot")).toHaveText("1");
    await guildLink.click();
    await expect(other.getByRole("heading", { name: t("guild.invitesTitle") })).toBeVisible();
    await other.getByRole("button", { name: t("guild.accept") }).click();
    await expect(other.getByRole("heading", { name: guildName })).toBeVisible();
    // Simple membre : ni renommer, ni blason, ni exclusion.
    await expect(other.getByRole("button", { name: t("guild.rename") })).toHaveCount(0);
    await expect(other.getByRole("button", { name: t("guild.kick") })).toHaveCount(0);

    // Le chef voit les deux membres en ligne.
    await page.reload();
    await expect(page.getByRole("heading", { name: t("guild.onlineTitle", { count: 2 }) })).toBeVisible();

    // Lobby de guilde : l'autre membre reçoit le bandeau et rejoint.
    await page.getByRole("button", { name: t("guild.lobbyCreate") }).click();
    await page.waitForURL(/\/fr\/lobby\/[A-Z0-9]{6}$/);
    const code = page.url().split("/").pop() as string;
    await other.goto("/fr");
    await expect(other.getByText(t("friends.noticeGuild", { name: user.name, guild: guildName }))).toBeVisible();
    await other.getByRole("button", { name: t("friends.noticeJoin") }).click();
    await other.waitForURL(new RegExp(`/fr/lobby/${code}$`));
    await expect(page.getByTestId("lobby-slots").locator(".slot.filled").filter({ hasText: member.name })).toBeVisible();

    // Exclusion par le chef.
    await page.goto("/fr/guild");
    page.once("dialog", (d) => void d.accept());
    await page.getByRole("button", { name: t("guild.kick") }).click();
    await expect(page.locator(".guild-members li")).toHaveCount(1);
    await expect(page.getByText(member.name)).toHaveCount(0);

    await ctx.close();
  });

  test("nom pris, invitations refusées et départ du dernier membre", async ({ page, user: _connected, request }) => {
    const rival = await signUp(request, newUser());
    await page.goto("/fr/guild");
    await page.getByLabel(t("guild.nameLabel")).fill("ab");
    await page.getByRole("button", { name: t("guild.create") }).click();
    await expect(page.getByText(t("guild.error.name-invalid", { min: 3, max: 24 }))).toBeVisible();

    const name = `Guilde ${Date.now()}`;
    await page.getByLabel(t("guild.nameLabel")).fill(name);
    await page.getByRole("button", { name: t("guild.create") }).click();
    await expect(page.getByRole("heading", { name })).toBeVisible();

    const invite = page.getByLabel(t("guild.inviteLabel"));
    const send = page.getByRole("button", { name: t("guild.invite"), exact: true });
    await invite.fill("personne-ne-porte-ce-pseudo");
    await send.click();
    await expect(page.getByText(t("guild.error.not-found"))).toBeVisible();
    await invite.fill(rival.name);
    await send.click();
    await expect(page.getByText(t("guild.inviteResult.sent", { name: rival.name }))).toBeVisible();
    await invite.fill(rival.email);
    await send.click();
    await expect(page.getByText(t("guild.inviteResult.already-invited", { name: rival.name }))).toBeVisible();

    // Le joueur invité (connecté par `request`) ne peut pas fonder une guilde du même nom, quelle que soit la casse.
    const res = await request.post("/api/guild", { data: { name: name.toUpperCase() } });
    expect(res.status()).toBe(409);
    expect(await res.json()).toEqual({ error: "name-taken" });

    // Dernier membre : la guilde est dissoute.
    page.once("dialog", (d) => void d.accept());
    await page.getByRole("button", { name: t("guild.leave") }).click();
    await expect(page.getByRole("heading", { name: t("guild.createTitle") })).toBeVisible();
  });

  test("page réservée aux joueurs connectés", async ({ page }) => {
    await page.goto("/fr/guild");
    await expect(page).toHaveURL(/\/fr\/login$/);
  });
});
