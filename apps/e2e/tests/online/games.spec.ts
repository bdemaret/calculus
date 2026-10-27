import { gamesOf } from "../../fixtures/db";
import { t } from "../../fixtures/i18n";
import { expect, test } from "../../fixtures/online";
import { signUp, type TestUser } from "../../fixtures/test";
import type { APIRequestContext, Page } from "@playwright/test";
import { PLACEMENT_GAMES } from "@calculus/game-core";
import { Bot } from "../../fixtures/bot";
import { prisma } from "@calculus/db";
import { expectedAnswer } from "../../fixtures/oracle";
import { answerBox } from "../../pages/answer";
import { LobbyPage } from "../../pages/LobbyPage";

test.describe("course de vitesse", () => {
  test("simultanée : le premier qui répond juste prend le point", async ({ host, bots }) => {
    const alice = await host("Alice", { mode: "speed-race", rounds: 5 });
    const code = await alice.create();
    const [bot] = await bots(code, ["Bot"]);
    bot!.play(({ index }) => (index === 1 ? { move: "right", delayMs: 300 } : index === 3 ? "wrong" : "idle"));
    await expect(alice.slot("Bot")).toBeVisible();
    await alice.start();

    await alice.play("right");
    // Manche 2 : Alice ne répond pas, le bot marque.
    await expect(alice.result).toContainText(t("game.pointFor", { names: "Bot" }), { timeout: 20_000 });
    await alice.play("right");
    // Manche 4 : les deux se trompent, personne ne marque.
    const missed = await alice.play("wrong");
    await expect(alice.result).toContainText(`${t("game.no")} : ${missed.answer}`);
    await expect(alice.result).not.toContainText(t("game.pointFor", { names: "" }).trim());
    await alice.play("right");

    await expect(alice.verdict).toHaveText(t("report.first"));
    await expect(alice.page.getByText(t("report.fastest"))).toBeVisible();
    await expect(alice.rankingRow("Alice")).toContainText(`3 ${t("report.pts")}`);
    await expect(alice.rankingRow("Bot")).toContainText(`1 ${t("report.pts")}`);
    // L'hôte choisit la suite.
    await expect(alice.button("report.again")).toBeVisible();
    await expect(alice.page.getByText(t("report.keepPlayers"))).toBeVisible();
  });

  test("chacun son tour : seul le joueur actif répond, sa saisie s'affiche chez les autres", async ({ host, bots }) => {
    const alice = await host("Alice", { mode: "speed-race", rounds: 5, turnStyle: "turns" });
    const code = await alice.create();
    const [bot] = await bots(code, ["Bot"]);
    bot!.play(() => ({ move: "right", typeFirst: true, delayMs: 1_500 }));
    await expect(alice.slot("Bot")).toBeVisible();
    await alice.start();

    const status = alice.page.locator("p.status");
    for (let i = 0; i < 5; i++) {
      await alice.play("right");
      if (i === 0) {
        // Pendant le tour du bot : la case d'Alice est verrouillée et montre ce que tape le bot.
        await expect(status).toHaveText(t("game.turnOf", { name: "Bot" }), { timeout: 15_000 });
        await expect(answerBox(alice.page)).toBeDisabled();
        await expect(answerBox(alice.page)).toHaveValue(/^\d+$/);
      }
    }

    await expect(alice.verdict).toBeVisible({ timeout: 20_000 });
    // Chacun a reçu ses 5 calculs et les a tous réussis.
    await expect(alice.rankingRow("Alice")).toContainText(`5 ${t("report.pts")}`);
    await expect(alice.rankingRow("Bot")).toContainText(`5 ${t("report.pts")}`);
  });
});

test.describe("nombre manquant en ligne", () => {
  test("course de vitesse : nombres et opérateurs manquants, le bot répond aussi", async ({ host, bots }) => {
    const alice = await host("Alice", { game: "missing", missingKind: "mixed", difficulty: 3, operations: ["add", "sub", "mul", "div"], mode: "speed-race", rounds: 5, timePerQuestion: 20 });
    const code = await alice.create();
    const [bot] = await bots(code, ["Bot"]);
    bot!.play(({ index }) => (index === 2 ? "right" : index === 3 ? "wrong" : "idle"));
    await expect(alice.slot("Bot")).toBeVisible();
    await expect(alice.page.getByRole("button", { name: new RegExp(t("games.missing.name")) })).toHaveAttribute("aria-pressed", "true");
    await alice.start();

    await alice.play("right");
    await alice.play("right");
    // Manche 3 : le bot trouve avant Alice.
    await expect(alice.result).toContainText(t("game.pointFor", { names: "Bot" }), { timeout: 30_000 });
    const missed = await alice.play("wrong");
    await expect(alice.result).toContainText(`${t("game.no")} : ${missed.answer}`);
    await alice.play("right");

    await expect(alice.rankingRow("Alice")).toContainText(`3 ${t("report.pts")}`);
    await expect(alice.rankingRow("Bot")).toContainText(`1 ${t("report.pts")}`);
  });
});

test.describe("nombre manquant, chacun son tour", () => {
  test("l'opérateur tapé par le joueur actif s'affiche chez les autres", async ({ host, bots }) => {
    const alice = await host("Alice", {
      game: "missing",
      missingKind: "operator",
      difficulty: 3,
      operations: ["add", "sub", "mul", "div"],
      mode: "speed-race",
      rounds: 5,
      turnStyle: "turns",
      timePerQuestion: 20,
    });
    const code = await alice.create();
    const [bot] = await bots(code, ["Bot"]);
    bot!.play(() => ({ move: "right", typeFirst: true, delayMs: 1_500 }));
    await expect(alice.slot("Bot")).toBeVisible();
    await alice.start();

    const status = alice.page.locator("p.status");
    for (let i = 0; i < 5; i++) {
      await alice.play("right");
      if (i === 0) {
        await expect(status).toHaveText(t("game.turnOf", { name: "Bot" }), { timeout: 15_000 });
        await expect(answerBox(alice.page)).toBeDisabled();
        await expect(answerBox(alice.page)).toHaveValue(/^[+−×÷]$/);
      }
    }
    await expect(alice.rankingRow("Alice")).toContainText(`5 ${t("report.pts")}`, { timeout: 20_000 });
    await expect(alice.rankingRow("Bot")).toContainText(`5 ${t("report.pts")}`);
  });
});

test.describe("le bon compte en ligne", () => {
  test("course de vitesse : personne ne trouve, la proposition la plus proche marque à la fin du temps", async ({ host, bots }) => {
    const alice = await host("Alice", { game: "right-count", mode: "speed-race", operations: ["add", "sub"], difficulty: 1, timePerQuestion: 20, rounds: 5 });
    const code = await alice.create();
    // Le bot ne répond pas : Alice est seule à proposer, donc la plus proche.
    await bots(code, ["Bot"]);
    await expect(alice.slot("Bot")).toBeVisible();
    await alice.start();

    const page = alice.page;
    const box = answerBox(page);
    await expect(box).toBeEnabled({ timeout: 20_000 });
    const q = await expectedAnswer(page);
    // Un total qui ne tombe pas pile, avec toutes les plaques : Entrée le propose aussitôt.
    await box.fill(q.wrong);
    await expect(page.locator(".hint")).toBeVisible();
    await box.press("Enter");
    await expect(box).toBeDisabled();
    await expect(alice.result).toContainText(t("game.closest"), { timeout: 30_000 });
    await expect(page.locator(".grade").first()).toHaveText("1");
  });

  test("battle royale : une expression fausse élimine, le dernier en vie gagne", async ({ host, bots }) => {
    const alice = await host("Alice", { game: "right-count", mode: "battle-royale", operations: ["add", "sub", "mul"], difficulty: 2, timePerQuestion: 60 });
    const code = await alice.create();
    const [bot] = await bots(code, ["Bot"]);
    bot!.play(() => "wrong");
    await expect(alice.slot("Bot")).toBeVisible();
    await alice.start();

    await alice.play("right");
    await expect(alice.verdict).toHaveText(t("report.first"), { timeout: 20_000 });
    await expect(alice.rankingRow("Bot")).toBeVisible();
  });
});

test.describe("battle royale", () => {
  test("une erreur élimine, le dernier en vie gagne", async ({ host, bots }) => {
    const alice = await host("Alice", { mode: "battle-royale" });
    const code = await alice.create();
    const [b1, b2] = await bots(code, ["Bot 1", "Bot 2"]);
    b1!.play(({ index }) => (index === 0 ? "right" : "wrong"));
    b2!.play(({ index }) => (index < 2 ? "right" : "wrong"));
    await expect(alice.playersHeading(3)).toBeVisible();
    await alice.start();

    await alice.play("right");
    await alice.play("right");
    await expect(alice.result).toContainText(t("game.out", { names: "Bot 1" }));
    await expect(alice.chips.locator(".chip.out")).toHaveCount(1);
    await alice.play("right");

    await expect(alice.verdict).toHaveText(t("report.first"));
    await expect(alice.page.getByText(t("report.lastAlive"))).toBeVisible();
    await expect(alice.rankingRow("Bot 1")).toContainText(t("report.outAt", { n: 2 }));
    await expect(alice.rankingRow("Bot 2")).toContainText(t("report.outAt", { n: 3 }));
  });

  test("si tous les survivants se trompent, personne ne sort", async ({ host, bots }) => {
    const alice = await host("Alice", { mode: "battle-royale" });
    const code = await alice.create();
    const [bot] = await bots(code, ["Bot"]);
    bot!.play(() => "wrong");
    await expect(alice.slot("Bot")).toBeVisible();
    await alice.start();

    await alice.play("wrong");
    await expect(alice.result).toContainText(t("game.spared"));
    await expect(alice.chips.locator(".chip.out")).toHaveCount(0);
    await alice.play("right");

    await expect(alice.verdict).toHaveText(t("report.first"));
  });

  test("un joueur éliminé regarde la fin, puis attend le choix de l'hôte", async ({ guest, botHost, bots }) => {
    const hostBot = await botHost("Hôte", { mode: "battle-royale", difficulty: 1, operations: ["add"], timePerQuestion: 10 });
    hostBot.play(() => "right");
    const bob = await guest("Bob");
    await bob.open(hostBot.code);
    await expect(bob.slot("Bob")).toBeVisible();
    const [other] = await bots(hostBot.code, ["Bot"]);
    other!.play(({ index }) => (index === 0 ? "right" : "wrong"));
    await hostBot.waitFor((s) => s.players.length === 3);
    hostBot.start();

    await bob.play("wrong");
    await expect(bob.page.getByText(t("game.spectator"))).toBeVisible({ timeout: 10_000 });
    await expect(answerBox(bob.page)).toBeDisabled();

    await expect(bob.verdict).toHaveText(t("report.rank", { rank: 3 }), { timeout: 20_000 });
    await expect(bob.page.getByText(t("report.waitHost"))).toBeVisible();
    await expect(bob.button("report.again")).toHaveCount(0);
  });
});

test.describe("rejouer", () => {
  test("même partie, puis retour au lobby avec d'autres règles", async ({ host, bots }) => {
    const alice = await host("Alice", { mode: "battle-royale" });
    const code = await alice.create();
    const [bot] = await bots(code, ["Bot"]);
    bot!.play(() => "wrong");
    await expect(alice.slot("Bot")).toBeVisible();
    await alice.start();

    await alice.play("right");
    await expect(alice.verdict).toHaveText(t("report.first"));

    await alice.button("report.again").click();
    await alice.play("right");
    await expect(alice.verdict).toHaveText(t("report.first"));
    expect(bot!.snapshot?.gameNumber).toBe(2);

    await alice.button("report.change").click();
    await expect(alice.playersHeading(2)).toBeVisible();
    await expect(alice.page.getByRole("button", { name: new RegExp(t("modes.battle-royale.name")) })).toHaveAttribute("aria-pressed", "true");
    await bot!.waitFor((s) => s.phase === "lobby" && s.players.every((p) => !p.ready));
  });
});

test.describe("enregistrement", () => {
  test("la partie en ligne d'un joueur connecté arrive dans son tableau de bord", async ({ page, user, bots }) => {
    const alice = new LobbyPage(page);
    await alice.preset(null, { mode: "speed-race", rounds: 5 });
    const code = await alice.create();
    await bots(code, ["Bot"]);
    await expect(alice.slot("Bot")).toBeVisible();
    await alice.start();
    for (let i = 0; i < 5; i++) await alice.play("right");
    await expect(alice.verdict).toHaveText(t("report.first"));

    // L'enregistrement part en arrière-plan à la fin de la partie.
    await expect.poll(async () => (await gamesOf(user.email)).length).toBe(1);
    const [played] = await gamesOf(user.email);
    expect(played?.game.solo).toBe(false);
    expect(played?.game.code).toBe(code);
    expect(played?.rank).toBe(1);
    expect(played?.score).toBe(5);
    // Adversaire invité : partie non classée.
    expect(played?.ratingDelta).toBeNull();

    await page.goto("/fr/dashboard");
    await expect(page.getByRole("cell", { name: t("dashboard.rankOf", { rank: 1, players: 2 }) })).toBeVisible();
    await page.getByRole("link", { name: t("dashboard.view") }).click();
    await expect(page.getByTestId("report-verdict")).toHaveText(t("report.first"));
    await expect(page.locator("ol.ranking li")).toHaveCount(2);
  });
});

test.describe("Elo", () => {
  /** Alice (la page, connectée) affronte un bot connecté à un autre compte, et gagne les 5 manches. */
  async function playRated(page: Page, request: APIRequestContext, rival: TestUser) {
    const { token } = (await (await request.post("/api/game-token", { data: {} })).json()) as { token: string };
    const alice = new LobbyPage(page);
    await alice.preset(null, { mode: "speed-race", rounds: 5, difficulty: 2 });
    const code = await alice.create();
    const bot = await Bot.join(code, rival.name, token);
    try {
      await expect(alice.slot(rival.name)).toBeVisible();
      await alice.start();
      for (let i = 0; i < 5; i++) await alice.play("right");
      await expect(alice.verdict).toHaveText(t("report.first"));
      await expect(page.getByTestId("report-elo")).toBeVisible();
      await bot.waitFor((s) => s.ratings != null);
      return { alice, bot, ratings: bot.snapshot!.ratings! };
    } finally {
      await bot.leave();
    }
  }

  const idOf = async (email: string) => (await prisma.user.findUniqueOrThrow({ where: { email } })).id;
  const ratingOf = (userId: string) =>
    prisma.rating.findUniqueOrThrow({ where: { userId_game_mode_difficulty: { userId, game: "standard", mode: "speed-race", difficulty: 2 } } });

  test("deux comptes neufs : l'Elo bouge en caché pendant le placement", async ({ page, user, request }) => {
    const rival = await signUp(request);
    const { ratings } = await playRated(page, request, rival);

    await expect(page.getByTestId("report-elo")).toHaveText(t("report.placement", { played: 1, total: PLACEMENT_GAMES }));
    // Aucun Elo caché dans ce que reçoivent les joueurs.
    expect(Object.values(ratings)).toEqual([
      { status: "placement", played: 1 },
      { status: "placement", played: 1 },
    ]);
    expect(await ratingOf(await idOf(user.email))).toMatchObject({ rating: 1016, games: 1 });
    expect(await ratingOf(await idOf(rival.email))).toMatchObject({ rating: 984, games: 1 });

    await page.goto("/fr/dashboard");
    await expect(page.getByTestId("elo-grid")).toContainText(t("report.placementShort", { played: 1, total: PLACEMENT_GAMES }));
    await expect(page.getByTestId("elo-grid")).not.toContainText("1016");
  });

  test("fin du placement contre un joueur classé : l'Elo est dévoilé, le classé ne gagne rien", async ({ page, user, request }) => {
    const rival = await signUp(request);
    const [aliceId, rivalId] = await Promise.all([idOf(user.email), idOf(rival.email)]);
    await prisma.rating.createMany({
      data: [
        { userId: aliceId, mode: "speed-race", difficulty: 2, rating: 1000, games: PLACEMENT_GAMES - 1 },
        { userId: rivalId, mode: "speed-race", difficulty: 2, rating: 1000, games: PLACEMENT_GAMES },
      ],
    });
    const { bot, ratings } = await playRated(page, request, rival);

    await expect(page.getByTestId("report-elo")).toHaveText(t("report.ratingRevealed", { rating: 1016 }));
    expect(ratings[bot.playerId!]).toEqual({ status: "rated", before: 1000, after: 1000 });
    expect(await ratingOf(aliceId)).toMatchObject({ rating: 1016, games: PLACEMENT_GAMES });
    expect(await ratingOf(rivalId)).toMatchObject({ rating: 1000, games: PLACEMENT_GAMES + 1 });

    await page.goto("/fr/dashboard");
    await expect(page.getByTestId("elo-grid")).toContainText("1016");
    await expect(page.getByRole("cell", { name: t("report.ratingShort", { rating: 1016 }) })).toBeVisible();
  });
});

test("une partie à 12 joueurs", async ({ host, bots }) => {
  const alice = await host("Alice", { mode: "battle-royale" });
  const code = await alice.create();
  const all = await bots(code, Array.from({ length: 11 }, (_, i) => `Bot ${i + 1}`));
  for (const b of all) b.play(() => "wrong");
  await expect(alice.playersHeading(12)).toBeVisible();
  await alice.start();

  await alice.play("right");
  await expect(alice.verdict).toHaveText(t("report.first"));
  await expect(alice.page.locator("ol.ranking li")).toHaveCount(12);
});
