import type { APIRequestContext } from "@playwright/test";
import { MAX_PLAYERS, PUBLIC_LOBBY_COUNT, type PublicLobbyList } from "@calculus/game-core";
import { GAME_HTTP_URL } from "../../env";
import { t } from "../../fixtures/i18n";
import { expect, test } from "../../fixtures/online";
import { calcText } from "../../fixtures/oracle";

/** Temps minimal restant avant le lancement automatique pour que le test ait le temps de remplir le lobby, en ms. */
const MIN_LEFT_MS = 40_000;

async function listLobbies(request: APIRequestContext): Promise<PublicLobbyList> {
  const res = await request.get(`${GAME_HTTP_URL}/lobbies`);
  expect(res.ok()).toBe(true);
  return (await res.json()) as PublicLobbyList;
}

test.describe("lobbys publics", () => {
  test("l'accueil propose des lobbys ouverts, sans hôte, lancés dès qu'ils sont pleins puis remplacés", async ({ host, bots, request }) => {
    // Deux lancements automatiques possibles pendant l'attente d'un lobby récent.
    test.setTimeout(PUBLIC_LOBBY_COUNT * 2 * 60_000 + 60_000);
    const alice = await host("Alice");
    await alice.page.goto("/fr");
    await expect(alice.page.getByRole("heading", { name: t("publicLobbies.title") })).toBeVisible();
    await expect(alice.page.getByTestId("public-lobbies").getByRole("link")).toHaveCount(PUBLIC_LOBBY_COUNT);

    // On choisit un lobby qui ne va pas se lancer tout seul pendant le test.
    let code = "";
    await expect
      .poll(
        async () => {
          const { serverNow, lobbies } = await listLobbies(request);
          code = lobbies.find((l) => l.startsAt - serverNow > MIN_LEFT_MS && l.players === 0)?.code ?? "";
          return code;
        },
        { timeout: 3 * 60_000, intervals: [2000] },
      )
      .not.toBe("");

    await alice.page.locator(`a[href="/fr/lobby/${code}"]`).click();
    await alice.page.waitForURL(new RegExp(`/fr/lobby/${code}$`));
    await expect(alice.slot("Alice")).toBeVisible();
    await expect(alice.slot("Alice")).not.toContainText(t("lobby.host"));
    await expect(alice.page.getByText(t("lobby.publicHint", { max: MAX_PLAYERS }))).toBeVisible();
    await expect(alice.button("lobby.start")).toHaveCount(0);
    await expect(alice.button("lobby.imReady")).toHaveCount(0);
    await expect.poll(async () => (await listLobbies(request)).lobbies.find((l) => l.code === code)?.players).toBe(1);

    // Plein : la partie se lance sans attendre, et le lobby quitte l'accueil.
    await bots(code, Array.from({ length: MAX_PLAYERS - 1 }, (_, i) => `Bot${i + 1}`));
    await expect(calcText(alice.page)).toBeVisible({ timeout: 15_000 });
    await expect
      .poll(async () => {
        const { lobbies } = await listLobbies(request);
        return lobbies.length === PUBLIC_LOBBY_COUNT && !lobbies.some((l) => l.code === code);
      })
      .toBe(true);
  });
});
