import { seedDashboardGamesFor } from "../../fixtures/db";
import { t } from "../../fixtures/i18n";
import { expect, test } from "../../fixtures/test";

test.describe("tableau de bord", () => {
  test("statistiques par difficulté, filtrées par jeu", async ({ page, user }) => {
    await seedDashboardGamesFor(user.email, [
      // Calcul mental : deux parties en niveau 1 (dont une victoire en ligne), une en niveau 3.
      { game: "standard", difficulty: 1, solo: true, rank: 1, answered: 10, correct: 8, correctTimeMs: 16_000, bestStreak: 5 },
      { game: "standard", difficulty: 1, solo: false, rank: 1, answered: 10, correct: 10, correctTimeMs: 14_000, bestStreak: 10 },
      { game: "standard", difficulty: 3, solo: true, rank: 1, answered: 4, correct: 1, correctTimeMs: 5_000, bestStreak: 1 },
      // Nombre manquant : une partie en niveau 1.
      { game: "missing", difficulty: 1, solo: true, rank: 1, answered: 5, correct: 5, correctTimeMs: 10_000, bestStreak: 5 },
    ]);
    await page.goto("/fr/dashboard");

    const table = page.getByTestId("difficulty-stats");
    const row = (d: number) => table.getByRole("row").filter({ has: page.getByRole("cell", { name: t(`levels.${d}`), exact: true }) });
    const filter = page.getByTestId("dashboard-game-filter");

    // Tous les jeux : niveau 1 = 3 parties, 23/25 = 92 %, 1 victoire ; niveau 3 = 1 partie ; niveau 2 jamais joué.
    await expect(filter.getByRole("button", { name: t("dashboard.allGames") })).toHaveAttribute("aria-pressed", "true");
    await expect(row(1).getByRole("cell").nth(1)).toHaveText("3");
    await expect(row(1).getByRole("cell").nth(2)).toContainText("92");
    await expect(row(1).getByRole("cell").nth(4)).toHaveText("1");
    await expect(row(3).getByRole("cell").nth(1)).toHaveText("1");
    await expect(row(2).getByRole("cell").nth(1)).toHaveText("–");
    // Seuls les jeux joués sont proposés.
    await expect(filter.getByRole("button")).toHaveCount(3);

    // Nombre manquant seul : une partie en niveau 1, 100 %, rien en niveau 3.
    await filter.getByRole("button", { name: t("games.missing.name") }).click();
    await expect(row(1).getByRole("cell").nth(1)).toHaveText("1");
    await expect(row(1).getByRole("cell").nth(2)).toContainText("100");
    await expect(row(3).getByRole("cell").nth(1)).toHaveText("–");
    await expect(page.getByRole("table").last().getByRole("row")).toHaveCount(2);

    // Calcul mental seul : deux parties en niveau 1, 18/20 = 90 %.
    await filter.getByRole("button", { name: t("games.standard.name") }).click();
    await expect(row(1).getByRole("cell").nth(1)).toHaveText("2");
    await expect(row(1).getByRole("cell").nth(2)).toContainText("90");
    await expect(row(3).getByRole("cell").nth(1)).toHaveText("1");
  });
});
