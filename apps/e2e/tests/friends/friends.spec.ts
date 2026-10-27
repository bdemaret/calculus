import { WEB_URL } from "../../env";
import { t } from "../../fixtures/i18n";
import type { APIResponse } from "@playwright/test";
import { Bot } from "../../fixtures/bot";
import { expect, newUser, signUp, test } from "../../fixtures/test";

test.describe("amis", () => {
  test("demande par e-mail, acceptation, invitation puis lobby rejoint", async ({ page, user, browser }) => {
    // Le second joueur, connecté dans son propre navigateur.
    const ctx = await browser.newContext({ baseURL: WEB_URL, locale: "fr-FR" });
    const other = await ctx.newPage();
    const friend = await signUp(other.request);

    // Depuis le profil, onglet « Mes amis », demande par e-mail.
    await page.goto("/fr/profile");
    await page.getByRole("navigation", { name: t("profile.tabs.label") }).getByRole("link", { name: t("profile.tabs.friends") }).click();
    await expect(page).toHaveURL(/\/fr\/profile\/friends$/);
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

  test("plusieurs invitations du même ami, retirées quand la partie démarre ou que le lobby ferme", async ({ page, user, request }) => {
    // L'ami qui invite n'a pas besoin de navigateur : tout passe par l'API, avec sa propre session.
    const friend = await signUp(request, newUser());
    expect((await request.post("/api/friends", { data: { handle: user.email } })).ok()).toBe(true);
    const firstId = async (res: Promise<APIResponse>, list: "incoming" | "friends") =>
      ((await (await res).json()) as Record<typeof list, { id: string }[]>)[list].map((f) => f.id)[0] ?? "";
    expect((await page.request.patch("/api/friends", { data: { userId: await firstId(page.request.get("/api/friends"), "incoming") } })).ok()).toBe(true);
    const meId = await firstId(request.get("/api/friends"), "friends");

    // Quatre lobbys tenus par des bots, chacun avec son invitation (A la plus ancienne).
    const settings = { game: "standard", mode: "speed-race" } as const;
    const [a, b, c, d] = [await Bot.create("Hôte A", settings), await Bot.create("Hôte B", settings), await Bot.create("Hôte C", settings), await Bot.create("Hôte D", settings)];
    const lobbies = [a, b, c, d];
    const open = new Set(lobbies);
    try {
      for (const bot of lobbies) expect((await request.post("/api/invites", { data: { userId: meId, code: bot.code } })).ok()).toBe(true);

      // Trois bandeaux à la fois, les plus récents, et le nombre des autres ; ignorer en fait remonter un.
      await page.goto("/fr");
      const notices = page.locator(".invite-notice").filter({ hasText: t("friends.noticeText", { name: friend.name }) });
      await expect(notices).toHaveCount(3);
      await expect(page.locator(".invite-more")).toContainText("1");
      await notices.first().getByRole("button", { name: t("friends.noticeIgnore") }).click();
      await expect(notices).toHaveCount(3);
      await expect(page.locator(".invite-more")).toBeHidden();

      // Une partie lancée, puis un lobby fermé : leurs invitations disparaissent, seule reste celle du lobby A.
      c.start();
      await c.waitFor((s) => s.phase !== "lobby");
      await b.leave();
      open.delete(b);
      const codes = async () => ((await (await page.request.get("/api/invites")).json()) as { invites: { code: string }[] }).invites.map((i) => i.code);
      await expect.poll(codes).toEqual([a.code]);
      await page.reload();
      await expect(notices).toHaveCount(1);
    } finally {
      // Quitter deux fois la même salle ne rend jamais la main.
      await Promise.all([...open].map((bot) => bot.leave()));
    }
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
