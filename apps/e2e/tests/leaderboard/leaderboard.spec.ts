import { randomUUID } from "node:crypto";
import { prisma } from "@calculus/db";
import { t } from "../../fixtures/i18n";
import { expect, test } from "../../fixtures/test";

/*
 * Le classement est commun à tous les tests : on remplit une combinaison mode × difficulté
 * qu'aucun autre test ne joue (battle royale, niveau 4), avec des Elo bien au-dessus de ceux
 * des vraies parties. Les comptes créés ici sont supprimés à la fin.
 */
const MODE = "battle-royale";
const DIFFICULTY = 4;
const SEEDED = 101;
const BASE_RATING = 90_000;

/** Partie classée à deux comptes dans le mode et la difficulté du test, terminée à la place `rank`. */
async function rankedGame(userId: string, rank: number, ratingGames: number) {
  const at = new Date();
  await prisma.game.create({
    data: {
      code: "E2EBRD",
      settings: { mode: MODE, difficulty: DIFFICULTY },
      mode: MODE,
      difficulty: DIFFICULTY,
      turnStyle: "simultaneous",
      seed: randomUUID(),
      rounds: 5,
      startedAt: at,
      endedAt: at,
      players: {
        create: {
          userId,
          playerKey: userId,
          displayName: "e2e",
          rank,
          score: 0,
          alive: rank === 1,
          answered: 0,
          correct: 0,
          correctTimeMs: 0,
          bestStreak: 0,
          ratingBefore: BASE_RATING - 1000,
          ratingDelta: 0,
          ratingGames,
        },
      },
    },
  });
}

test.describe("classement", () => {
  const run = randomUUID().slice(0, 6);
  const ids = Array.from({ length: SEEDED }, (_, i) => `e2e-board-${run}-${i + 1}`);
  /** Le n-ième joueur créé : plus n est grand, meilleur est l'Elo (le 1er finit 101e). */
  const nameOf = (n: number) => `Classé ${run}-${String(n).padStart(3, "0")}`;

  test.beforeAll(async () => {
    await prisma.user.createMany({
      data: ids.map((id, i) => ({ id, name: nameOf(i + 1), email: `${id}@calculus.test` })),
    });
    await prisma.rating.createMany({
      data: ids.map((userId, i) => ({ userId, mode: MODE, difficulty: DIFFICULTY, rating: BASE_RATING + i + 1, games: 10 })),
    });
  });

  test.afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
  });

  test("top 100, recherche hors du top et place du joueur connecté", async ({ page, user }) => {
    // Le joueur connecté, classé juste après tous les autres (102e), et un Elo de placement qui reste caché.
    const me = await prisma.user.findUniqueOrThrow({ where: { email: user.email } });
    await prisma.rating.createMany({
      data: [
        { userId: me.id, mode: MODE, difficulty: DIFFICULTY, rating: BASE_RATING - 1000, games: 5 },
        { userId: me.id, mode: MODE, difficulty: 5, rating: BASE_RATING + 5000, games: 4 },
      ],
    });
    // Ses 5 parties classées : 2 gagnées (1re place) sur 5, soit 40 % de victoires.
    for (let i = 0; i < 5; i++) await rankedGame(me.id, i < 2 ? 1 : 2, i + 1);

    // Le menu mène au classement du premier mode ; on choisit le mode puis la difficulté.
    await page.goto("/fr");
    await page.getByRole("navigation", { name: t("nav.main") }).getByRole("link", { name: t("nav.leaderboard") }).click();
    await expect(page).toHaveURL(/\/fr\/leaderboard\/[a-z-]+$/);
    await page.getByRole("navigation", { name: t("leaderboard.modesLabel") }).getByRole("link", { name: t(`modes.${MODE}.name`) }).click();
    await page.getByRole("navigation", { name: t("settings.difficulty") }).getByRole("link", { name: t(`levels.${DIFFICULTY}`) }).click();
    await expect(page).toHaveURL(new RegExp(`/fr/leaderboard/${MODE}\\?difficulty=${DIFFICULTY}$`));

    // Top 100, trié par Elo décroissant.
    const top = page.getByRole("table", { name: t("leaderboard.topTitle", { count: 100 }) });
    const rows = top.locator("tbody tr");
    await expect(rows).toHaveCount(100);
    await expect(rows.first()).toContainText(nameOf(SEEDED));
    await expect(rows.first().locator("td").first()).toHaveText("1");
    await expect(rows.last()).toContainText(nameOf(2));
    await expect(top.getByText(nameOf(1))).toHaveCount(0);
    await expect(top.getByText(user.name)).toHaveCount(0);

    // Recherche d'un joueur hors du top 100 : sa vraie place est affichée.
    const search = page.getByRole("search");
    await search.getByLabel(t("leaderboard.searchLabel")).fill(nameOf(1).toUpperCase());
    await search.getByRole("button", { name: t("leaderboard.search") }).click();
    const results = page.getByRole("table", { name: t("leaderboard.resultsTitle", { query: nameOf(1).toUpperCase() }) });
    await expect(results.locator("tbody tr")).toHaveCount(1);
    await expect(results.locator("tbody tr td").first()).toHaveText("101");

    // Effacer la recherche ne garde que « Ta place » et le top.
    await search.getByRole("button", { name: t("leaderboard.clear") }).click();
    await expect(page).toHaveURL(new RegExp(`/fr/leaderboard/${MODE}\\?difficulty=${DIFFICULTY}$`));
    await expect(page.getByRole("table")).toHaveCount(2);

    // Sa place est affichée sans avoir à se chercher : 102e, surlignée, parties et % de victoires.
    const mine = page.getByRole("table", { name: t("leaderboard.meTitle") }).locator("tbody tr");
    await expect(mine).toHaveCount(1);
    await expect(mine).toHaveClass(/\bme\b/);
    await expect(mine).toContainText(user.name);
    await expect(mine).toContainText(t("leaderboard.you"));
    await expect(mine.locator("td")).toHaveText(["102", new RegExp(user.name), String(BASE_RATING - 1000), "5", /^40\s%$/]);
    await expect(page.getByText(t("leaderboard.meOf", { total: 102 }))).toBeVisible();

    // En placement (4 parties sur 5), le joueur n'apparaît pas, même avec le meilleur Elo, et voit son avancée.
    await page.goto(`/fr/leaderboard/${MODE}?difficulty=5&q=${encodeURIComponent(user.name)}`);
    await expect(page.getByText(t("leaderboard.noResults"))).toBeVisible();
    await expect(page.getByText(t("leaderboard.mePlacement", { played: 4, total: 5 }))).toBeVisible();
  });
});
