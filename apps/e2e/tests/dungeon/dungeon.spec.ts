import { Client } from "colyseus.js";
import type { Page } from "@playwright/test";
import { DUNGEON_ROOM, DUNGEON_START_LIVES, JOIN_ERRORS } from "@calculus/game-core";
import { GAME_HTTP_URL } from "../../env";
import { Bot } from "../../fixtures/bot";
import { dungeonRunsOf } from "../../fixtures/db";
import { DungeonBot } from "../../fixtures/dungeonBot";
import { t } from "../../fixtures/i18n";
import { solveText } from "../../fixtures/oracle";
import { expect, signUp, test } from "../../fixtures/test";
import { answerBox } from "../../pages/answer";

/*
 * Donjons : un vrai navigateur pour le joueur dont on regarde l'écran, des `DungeonBot` (comptes) pour les coéquipiers.
 * Les séries se jouent au niveau 1 ; la carte est tirée au hasard par le serveur, les tests ne supposent rien d'elle.
 */

const gameClient = () => new Client(GAME_HTTP_URL.replace("http", "ws"));
const HIDDEN = t("dungeon.hiddenCalc");

/** Ouvre une expédition depuis le site et renvoie son code. */
async function openExpedition(page: Page): Promise<string> {
  await page.goto("/fr/dungeon");
  await page.getByRole("button", { name: t("dungeon.create") }).click();
  await expect(page).toHaveURL(/\/fr\/dungeon\/[A-Z0-9]{6}$/);
  return page.url().split("/").at(-1)!;
}

/**
 * Répond au calcul en cours de l'expédition, lu dès son arrivée (une momie le cache au bout d'une seconde).
 */
async function answerCurrent(page: Page, move: "right" | "wrong"): Promise<void> {
  const handle = await page.waitForFunction(
    (hidden) => {
      const v = document.querySelector('[data-testid="calc-text"]')?.getAttribute("data-calc");
      return v && v !== hidden ? v : null;
    },
    HIDDEN,
    { polling: 20, timeout: 5_000 },
  );
  const text = (await handle.jsonValue()) as string;
  // Calcul ordinaire, nombre manquant (sorcière) ou opérateur caché (spectre) : l'oracle sait tout résoudre.
  const solved = solveText(text);
  const box = answerBox(page);
  await box.fill(move === "right" ? solved.answer : solved.wrong);
  await box.press("Enter");
  // La case se verrouille, ou disparaît quand la série (ou le boss) est fini.
  await expect(box.and(page.locator(":enabled"))).toHaveCount(0);
}

/**
 * Joue l'expédition côté navigateur jusqu'au bilan : se place sur le premier ennemi ouvert, verrouille,
 * enchaîne ses séries et les coups au boss, garde ses cœurs.
 */
async function playExpedition(page: Page, move: "right" | "wrong" = "right") {
  const summary = page.getByTestId("dungeon-summary");
  const lock = page.getByRole("button", { name: t("dungeon.lock") });
  const pickable = page.getByTestId("dungeon-cell").and(page.locator('[aria-disabled="false"]'));
  const ready = answerBox(page).and(page.locator(":enabled"));
  const keep = page.getByRole("button", { name: new RegExp(`^${t("dungeon.lootKeep")}`) });
  const lockReady = lock.and(page.locator(":enabled"));
  const next = summary.or(pickable.first()).or(lockReady).or(ready).or(keep);
  for (let step = 0; step < 300; step++) {
    await next.first().waitFor({ timeout: 40_000 });
    if (await summary.isVisible()) return;
    if (await ready.isVisible()) await answerCurrent(page, move).catch(() => {});
    else if (await keep.isVisible()) await keep.click().catch(() => {});
    else if (await lockReady.isVisible()) await lockReady.click().catch(() => {});
    else if (await pickable.first().isVisible()) await pickable.first().click().catch(() => {});
  }
  throw new Error("expédition sans fin");
}

test.describe("donjons : accès", () => {
  test("réservés aux comptes : un visiteur est envoyé à la connexion et ne voit pas l'entrée", async ({ page }) => {
    await page.goto("/fr");
    await expect(page.getByRole("link", { name: t("nav.dungeon"), exact: true })).toHaveCount(0);
    await page.goto("/fr/dungeon");
    await expect(page).toHaveURL(/\/fr\/login\?next=\/dungeon$/);

    await signUp(page.request);
    await page.goto("/fr");
    await expect(page.getByRole("navigation").getByRole("link", { name: t("nav.dungeon"), exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: new RegExp(t("home.dungeonSub")) })).toBeVisible();
    await page.getByRole("navigation").getByRole("link", { name: t("nav.dungeon"), exact: true }).click();
    await expect(page.getByRole("heading", { name: t("dungeon.title"), level: 1 })).toBeVisible();

    // Les monstres ne sont décrits que dans le livre, ouvert par le bouton du bas.
    const book = page.getByTestId("dungeon-book");
    await expect(book).toBeHidden();
    await page.getByRole("button", { name: t("dungeon.book.open") }).click();
    await expect(book.getByRole("heading", { name: t("dungeon.book.title") })).toBeVisible();
    await expect(book.getByText(t("dungeon.enemies.mummy.desc"))).toBeVisible();
    await expect(book.getByText(t("dungeon.boss.desc"))).toBeVisible();
    await book.getByRole("button", { name: t("dungeon.book.close") }).click();
    await expect(book).toBeHidden();
  });

  test("serveur : un jeton d'invité ne crée ni ne rejoint un donjon", async () => {
    const guestToken = await Bot.token("Invité");
    await expect(gameClient().create(DUNGEON_ROOM, { token: guestToken })).rejects.toMatchObject({ code: JOIN_ERRORS.accountRequired });
    const host = await DungeonBot.create();
    try {
      await expect(gameClient().joinById(host.code, { token: guestToken })).rejects.toMatchObject({ code: JOIN_ERRORS.accountRequired });
      // Un donjon ne se rejoint jamais au hasard, seulement par son code.
      const { token } = await DungeonBot.account();
      await expect(gameClient().join(DUNGEON_ROOM, { token })).rejects.toThrow();
    } finally {
      await host.leave();
    }
  });

  test("le bilan d'une expédition n'est visible que de ses membres", async ({ page, user }) => {
    void user;
    const code = await openExpedition(page);
    const bot = await DungeonBot.join(code);
    try {
      bot.policy = () => "wrong";
      await page.getByRole("button", { name: t("dungeon.start") }).click();
      await playExpedition(page, "wrong");
      // Le bilan s'affiche en fin de partie ; sa page enregistrée a l'adresse de l'expédition en base.
      await expect(page.getByTestId("dungeon-summary")).toBeVisible();
      await expect.poll(async () => (await dungeonRunsOf(user.email)).length).toBe(1);
      const [run] = await dungeonRunsOf(user.email);
      const href = `/fr/dungeon/report/${run!.id}`;
      // Un autre compte reçoit la même page qu'une expédition inexistante.
      const outsider = await page.context().browser()!.newContext();
      const other = await outsider.newPage();
      await signUp(other.request);
      const res = await other.goto(href);
      expect(res?.status()).toBe(404);
      await outsider.close();
    } finally {
      await bot.leave();
    }
  });
});

test.describe("donjons : salle d'attente", () => {
  test("il faut deux joueurs pour entrer, et seul l'hôte règle la difficulté", async ({ page, user }) => {
    void user;
    const code = await openExpedition(page);
    const start = page.getByRole("button", { name: t("dungeon.start") });
    await expect(start).toBeDisabled();
    await expect(page.getByText(t("dungeon.notEnough", { count: 2 }))).toBeVisible();

    const bot = await DungeonBot.join(code);
    try {
      await expect(start).toBeEnabled();
      await page.getByRole("radio", { name: new RegExp(t("levels.3")) }).click();
      await bot.waitFor((s) => s.settings.difficulty === 3);
      // Un autre joueur ne peut pas la changer.
      bot.send("settings", { difficulty: 5 });
      await expect(page.getByRole("radio", { name: new RegExp(t("levels.3")) })).toHaveAttribute("aria-checked", "true");
      expect(bot.snapshot?.settings.difficulty).toBe(3);
    } finally {
      await bot.leave();
    }
  });
});

test.describe("donjons : expédition", () => {
  test("une expédition complète jusqu'au boss, enregistrée, sans jamais envoyer de réponse en cours", async ({ page, user }) => {
    test.setTimeout(300_000);
    const code = await openExpedition(page);
    const bot = await DungeonBot.join(code);
    try {
      await page.getByRole("button", { name: t("dungeon.start") }).click();
      await expect(page.getByTestId("dungeon-game")).toHaveAttribute("data-phase", "positioning", { timeout: 10_000 });
      await playExpedition(page, "right");

      const summary = page.getByTestId("dungeon-summary");
      await expect(summary).toHaveAttribute("data-outcome", "won");
      await expect(summary.getByRole("heading", { name: t("dungeon.end.won") })).toBeVisible();
      await expect(summary.getByRole("heading", { name: t("dungeon.end.mine") })).toBeVisible();
      // Premier boss vaincu : le succès et son titre s'affichent dès l'expédition enregistrée, et l'allié est cité.
      const unlocked = page.getByTestId("report-unlocks");
      await expect(unlocked).toContainText(t("achievements.dungeon-wins-1.name"));
      await expect(unlocked).toContainText(t("titles.adventurer"));
      await expect(page.getByText(t("report.playerUnlocked", { name: bot.user.name, achievement: t("achievements.dungeon-wins-1.name") }))).toBeVisible();

      // Aucune réponse dans un calcul en cours, à aucun moment.
      expect(bot.snapshots.length).toBeGreaterThan(10);
      for (const s of bot.snapshots) if (s.game?.question) expect(Object.keys(s.game.question)).not.toContain("answer");

      // Enregistrée, avec les deux comptes, et relue sur la page de bilan.
      await expect.poll(async () => (await dungeonRunsOf(user.email)).length).toBe(1);
      const [run] = await dungeonRunsOf(user.email);
      expect(run!.outcome).toBe("won");
      expect(run!.roundsPlayed).toBe(5);
      expect(run!.players.map((p) => p.displayName)).toEqual([user.name, bot.user.name]);
      // Les suites sont sous le résultat : rejouer (l'hôte), retour aux donjons, retour au menu principal.
      await expect(page.getByRole("button", { name: t("dungeon.end.again") })).toBeEnabled();
      await expect(page.getByRole("button", { name: t("dungeon.end.toDungeons") })).toBeVisible();
      await expect(page.getByRole("button", { name: t("dungeon.end.toHome") })).toBeVisible();
      await page.goto(`/fr/dungeon/report/${run!.id}`);
      await expect(page.getByRole("heading", { name: t("dungeon.end.reportTitle") }).or(page.getByRole("heading", { name: t("dungeon.end.won") }))).toBeVisible();
      await expect(page.getByRole("cell", { name: user.name })).toBeVisible();
    } finally {
      await bot.leave();
    }
  });

  test("défaite : le boss ne peut plus être atteint à temps", async ({ page, user }) => {
    void user;
    const code = await openExpedition(page);
    const bot = await DungeonBot.join(code);
    try {
      bot.policy = () => "wrong";
      await page.getByRole("button", { name: t("dungeon.start") }).click();
      await playExpedition(page, "wrong");
      const summary = page.getByTestId("dungeon-summary");
      await expect(summary).toHaveAttribute("data-outcome", "lost");
      await expect(summary.getByText(t("dungeon.end.reason.boss-not-reached"))).toBeVisible();
      await bot.waitFor((s) => s.phase === "finished");
      // Au plus court, le boss est à trois salles : deux manches ratées suffisent à le rendre inaccessible.
      expect(bot.snapshot!.summary!.roundsPlayed).toBe(2);
      expect(bot.snapshot!.summary!.players.every((p) => p.lives === DUNGEON_START_LIVES - 2)).toBe(true);
    } finally {
      await bot.leave();
    }
  });
});

test.describe("donjons : règles côté serveur", () => {
  test("un échec coûte une vie même si l'allié gagne ; une réponse au mauvais calcul est refusée", async () => {
    const alice = await DungeonBot.create({ difficulty: 1 });
    const bob = await DungeonBot.join(alice.code);
    try {
      // Les deux dans la même salle de l'entrée : Alice réussit, Bob rate son premier calcul.
      const first = (g: Parameters<typeof alice.room>[0]) => g.rooms.find((r) => r.accessible)?.key ?? null;
      alice.room = first;
      bob.room = first;
      alice.policy = () => "right";
      bob.policy = () => "wrong";
      await alice.waitFor((s) => s.members.length === 2);
      alice.send("start", {});
      // Un calcul qui n'est pas le sien en cours : refusé sans rien changer.
      bob.send("answer", { index: 99, value: 1 });
      await expect.poll(() => bob.acks.some((a) => a.type === "answer-refused")).toBe(true);

      // Les bots répondent aussitôt : on relit l'historique plutôt que l'état courant.
      await expect.poll(() => alice.snapshots.some((s) => s.game?.round === 0 && s.game.lastRound !== null)).toBe(true);
      const result = alice.snapshots.find((s) => s.game?.round === 0 && s.game.lastRound !== null)!;
      const game = result.game!;
      expect(game.lastRound!.cleared).toEqual([game.rooms.find((r) => r.floor === 1 && r.index === 0)!.key]);
      expect(game.players.find((p) => p.id === alice.playerId)!.lives).toBe(DUNGEON_START_LIVES);
      expect(game.players.find((p) => p.id === bob.playerId)!.lives).toBe(DUNGEON_START_LIVES - 1);
      // La réponse attendue n'apparaît qu'au bilan de la manche.
      expect(game.lastRound!.fights.find((f) => f.playerId === bob.playerId)!.failure).toMatchObject({ solution: expect.any(String) });
    } finally {
      await bob.leave();
      await alice.leave();
    }
  });
});
