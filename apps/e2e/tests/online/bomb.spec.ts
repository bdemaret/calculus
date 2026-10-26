import { prisma } from "@calculus/db";
import { t } from "../../fixtures/i18n";
import { calcText } from "../../fixtures/oracle";
import { expect, test } from "../../fixtures/online";
import { answerBox } from "../../pages/answer";

/** Bombes courtes : niveau 1 (4 chiffres, + et −, 2 plaques au moins), 15 s pour construire. */
const BOMB = { game: "bomb", mode: "battle-royale", difficulty: 1, operations: ["add", "sub"], buildTime: 15, timePerQuestion: 15 } as const;

test.describe("la bombe", () => {
  test("se joue à deux au moins : seul, on ne peut pas lancer", async ({ host }) => {
    const alice = await host("Alice", { ...BOMB, operations: [...BOMB.operations] });
    await alice.create();
    await expect(alice.page.getByText(t("lobby.notEnoughPlayers", { count: 2 }))).toBeVisible();
    await expect(alice.page.getByRole("button", { name: t("lobby.start") })).toBeDisabled();
  });

  test("construire, recevoir la bombe de l'autre, la désamorcer : le bot qui rate saute", async ({ host, bots }) => {
    const alice = await host("Alice", { ...BOMB, operations: [...BOMB.operations] });
    const code = await alice.create();
    const [bot] = await bots(code, ["Bot"]);
    bot!.play(() => "wrong");
    await expect(alice.slot("Bot")).toBeVisible();
    await alice.start();

    // Construction : une bombe avec les deux premières plaques.
    const page = alice.page;
    await expect(page.getByTestId("bomb-rules")).toBeVisible({ timeout: 10_000 });
    const tiles = (await calcText(page).getAttribute("data-calc"))!.split(" ");
    const box = answerBox(page);
    await box.fill(`${tiles[0]} + ${tiles[1]}`);
    await expect(page.locator(".count-total")).toContainText(String(Number(tiles[0]) + Number(tiles[1])));
    await box.press("Enter");

    // Le bot a aussi construit : on passe tout de suite à l'attribution, chacun reçoit la bombe de l'autre.
    await expect(page.getByTestId("bomb-assign")).toContainText(t("game.bomb.youDefuse", { name: "Bot" }), { timeout: 10_000 });
    await expect(page.getByTestId("bomb-assign")).toContainText(t("game.bomb.yourBombGoes", { name: "Bot" }));
    await alice.play("right");

    // Le bot se trompe sur la bombe d'Alice : il saute, Alice gagne et marque aussi pour sa bombe.
    await expect(page.getByTestId("bomb-results")).toContainText(`${tiles[0]} + ${tiles[1]} = ${Number(tiles[0]) + Number(tiles[1])}`);
    await expect(page.getByTestId("bomb-results")).toContainText(t("game.bomb.exploded"));
    await expect(alice.verdict).toHaveText(t("report.first"), { timeout: 15_000 });
    await expect(alice.rankingRow("Alice")).toContainText(`2 ${t("report.correctUnit")}`);

    // Enregistrée avec une ligne par destinataire et son auteur.
    await expect
      .poll(async () => (await prisma.game.findFirst({ where: { code }, include: { questions: true } }))?.questions.length ?? 0, { timeout: 10_000 })
      .toBe(2);
    const saved = await prisma.game.findFirstOrThrow({ where: { code }, include: { questions: { include: { answers: true } }, players: true } });
    expect(saved.game).toBe("bomb");
    const keyOf = (name: string) => saved.players.find((p) => p.displayName === name)!.playerKey;
    const forBot = saved.questions.find((q) => q.forPlayerKey === keyOf("Bot"))!;
    expect(forBot.authorPlayerKey).toBe(keyOf("Alice"));
    expect(forBot.text).toBe(`${tiles[0]} + ${tiles[1]}`);
  });

  test("sans bombe à temps, une bombe de secours part à sa place", async ({ host, bots }) => {
    const alice = await host("Alice", { ...BOMB, operations: [...BOMB.operations] });
    const code = await alice.create();
    const [bot] = await bots(code, ["Bot"]);
    bot!.buildBombs(() => "idle");
    bot!.play(() => "right");
    await expect(alice.slot("Bot")).toBeVisible();
    await alice.start();

    // Alice envoie sa bombe et attend ; le bot ne construit rien.
    const page = alice.page;
    await expect(page.getByTestId("bomb-rules")).toBeVisible({ timeout: 10_000 });
    const tiles = (await calcText(page).getAttribute("data-calc"))!.split(" ");
    await answerBox(page).fill(`${tiles[0]} + ${tiles[1]}`);
    await page.getByRole("button", { name: t("game.submit") }).click();
    await expect(page.getByTestId("bomb-mine")).toContainText(`${tiles[0]} + ${tiles[1]}`);
    await expect(page.getByText(t("game.bomb.ready", { count: 1, total: 2 }))).toBeVisible();
    await expect(page.getByTestId("bomb-assign")).toBeVisible({ timeout: 25_000 });
    await alice.play("right");
    await expect(alice.page.getByTestId("bomb-results")).toContainText(t("game.bomb.fallback"));
    // Tout le monde a désamorcé : la partie continue avec un nouveau tirage.
    await expect(alice.page.getByTestId("bomb-rules")).toBeVisible({ timeout: 10_000 });
  });
});
