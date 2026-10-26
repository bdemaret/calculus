import { t } from "../../fixtures/i18n";
import { expect, test } from "../../fixtures/online";

test.describe("lobby", () => {
  test("créer un lobby puis le rejoindre avec le code", async ({ host, guest }) => {
    const alice = await host("Alice");
    const code = await alice.create();
    await expect(alice.page.getByLabel(t("lobby.codeAria", { code }))).toBeVisible();
    await expect(alice.slot("Alice")).toContainText(t("lobby.host"));
    await expect(alice.page.getByText(t("lobby.hostHint"))).toBeVisible();

    const bob = await guest("Bob");
    await bob.joinWithCode(code);
    for (const p of [alice, bob]) {
      await expect(p.playersHeading(2)).toBeVisible();
      await expect(p.slot("Alice")).toBeVisible();
      await expect(p.slot("Bob")).toBeVisible();
    }
    await expect(bob.page.getByText(t("lobby.waitingHost"))).toBeVisible();
    await expect(bob.button("lobby.start")).toHaveCount(0);
  });

  test("un code trop court est refusé avant d'aller au serveur", async ({ host }) => {
    const alice = await host("Alice");
    await alice.page.goto("/fr/online");
    await alice.page.getByLabel(t("online.joinCode")).fill("ABC");
    await alice.button("online.join").click();
    await expect(alice.page.getByText(t("online.codeLength"))).toBeVisible();
  });

  test("créer un lobby sans pseudo est refusé", async ({ host }) => {
    const alice = await host("");
    await alice.page.goto("/fr/online");
    await alice.button("online.create").click();
    await expect(alice.page.getByText(t("errors.name-required"))).toBeVisible();
  });

  test("le lien du lobby demande un pseudo à un nouveau venu", async ({ host, guest }) => {
    const alice = await host("Alice");
    const code = await alice.create();

    const bob = await guest("");
    await bob.open(code);
    await expect(bob.page.getByRole("heading", { name: t("lobby.joinTitle", { code }) })).toBeVisible();
    await bob.page.getByLabel(t("online.pseudo")).fill("Bob");
    await bob.button("online.join").click();
    await expect(bob.slot("Bob")).toBeVisible();
    await expect(alice.slot("Bob")).toBeVisible();
  });

  test("un joueur connecté entre avec le pseudo de son compte", async ({ page, user, guest }) => {
    await page.goto("/fr/online");
    await expect(page.getByText(t("online.connectedAs", { name: user.name }))).toBeVisible();
    await page.getByRole("button", { name: t("online.create") }).click();
    await page.waitForURL(/\/fr\/lobby\/[A-Z0-9]{6}$/);
    const code = page.url().split("/").pop() as string;

    const bob = await guest("Bob");
    await bob.open(code);
    await expect(bob.slot(user.name)).toContainText(t("lobby.host"));
  });

  test("seul l'hôte règle la partie, et chacun voit les règles à jour", async ({ host, guest }) => {
    const alice = await host("Alice");
    const code = await alice.create();
    const bob = await guest("Bob");
    await bob.open(code);
    await expect(bob.slot("Bob")).toBeVisible();

    const level3 = (p: typeof alice) => p.page.getByRole("button", { name: `3 · ${t("levels.3")}`, exact: true });
    await expect(level3(bob)).toBeDisabled();
    await level3(alice).click();
    await expect(level3(alice)).toHaveAttribute("aria-pressed", "true");
    await expect(level3(bob)).toHaveAttribute("aria-pressed", "true");

    const br = (p: typeof alice) => p.page.getByRole("button", { name: new RegExp(t("modes.battle-royale.name")) });
    await br(alice).click();
    await expect(br(bob)).toHaveAttribute("aria-pressed", "true");
    await expect(bob.page.getByText(t("modes.battle-royale.long"))).toBeVisible();
  });

  test("« prêt » s'affiche chez l'hôte et se réinitialise quand les règles changent", async ({ host, guest }) => {
    const alice = await host("Alice");
    const code = await alice.create();
    const bob = await guest("Bob");
    await bob.open(code);

    await bob.button("lobby.imReady").click();
    await expect(alice.slot("Bob")).toContainText(t("lobby.ready"));
    await expect(alice.page.getByText(t("lobby.everyoneReady"))).toBeVisible();
    await expect(bob.button("lobby.notReady")).toBeVisible();

    await alice.page.getByRole("button", { name: t("ops.mul"), exact: true }).click();
    await expect(alice.slot("Bob")).not.toContainText(t("lobby.ready"));
    await expect(bob.button("lobby.imReady")).toBeVisible();
  });

  test("quitter le lobby libère la place", async ({ host, guest }) => {
    const alice = await host("Alice");
    const code = await alice.create();
    const bob = await guest("Bob");
    await bob.open(code);
    await expect(alice.playersHeading(2)).toBeVisible();

    await bob.button("lobby.leave").click();
    await bob.page.waitForURL(/\/fr\/online$/);
    await expect(alice.playersHeading(1)).toBeVisible();
    await expect(alice.slot("Bob")).toHaveCount(0);
  });

  test("un lobby se remplit jusqu'à 12 joueurs", async ({ host, bots }) => {
    const alice = await host("Alice");
    const code = await alice.create();
    await bots(code, Array.from({ length: 11 }, (_, i) => `Bot ${i + 1}`));
    await expect(alice.playersHeading(12)).toBeVisible();
    await expect(alice.slots.locator(".slot.empty")).toHaveCount(0);
  });
});
