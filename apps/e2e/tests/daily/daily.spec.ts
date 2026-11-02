import { randomUUID } from "node:crypto";
import { prisma, settleDailyChallenges } from "@calculus/db";
import { dailyDate, DAILY_ROUNDS } from "@calculus/game-core";
import { t, tr } from "../../fixtures/i18n";
import { expect, newUser, test, type TestUser } from "../../fixtures/test";
import { AuthPages } from "../../pages/AuthPages";
import { DailyPage } from "../../pages/DailyPage";

const FIVE_RIGHT = ["right", "right", "right", "right", "right"] as const;
const name = (s: string) => new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));

test.describe("calcul du jour", () => {
  test("un compte joue une fois : score enregistré, classé, plus de bouton Commencer", async ({ page, user }) => {
    await page.goto("/fr");
    await expect(page.getByRole("link", { name: name(t("daily.cardGo")) })).toBeVisible();

    const daily = new DailyPage(page);
    await daily.goto();
    await daily.play(["right", "wrong", "right", "right", "right"]);
    await expect(daily.score).toHaveText(`4/${DAILY_ROUNDS}`);
    await expect(page.getByText(t("daily.saved"))).toBeVisible();
    await expect(page.locator("#daily-board tr.me")).toContainText(user.name);

    // Rechargée, la page montre le résultat : pas de deuxième essai.
    await daily.goto();
    await expect(daily.score).toHaveText(`4/${DAILY_ROUNDS}`);
    await expect(daily.startButton).toHaveCount(0);
    const rows = await prisma.dailyRun.count({ where: { user: { email: user.email } } });
    expect(rows).toBe(1);

    await page.goto("/fr");
    await expect(page.getByRole("link", { name: t("daily.seeBoard") })).toBeVisible();
    await expect(page.getByRole("link", { name: name(t("daily.cardGo")) })).toHaveCount(0);
  });

  test("un invité joue, s'inscrit à la fin et retrouve son score au classement", async ({ page }) => {
    const daily = new DailyPage(page);
    await daily.goto();
    await daily.play([...FIVE_RIGHT]);
    await expect(daily.score).toHaveText(`5/${DAILY_ROUNDS}`);
    await expect(page.getByText(t("daily.saveTitle"))).toBeVisible();
    await expect(page.getByRole("main").getByRole("link", { name: t("daily.login") })).toBeVisible();

    // L'accueil sait, par le navigateur, que l'invité a joué.
    await page.goto("/fr");
    await page.getByRole("link", { name: t("daily.saveScore") }).click();
    await page.getByRole("link", { name: t("daily.signup") }).click();

    const user = newUser();
    await new AuthPages(page).fillSignup(user);
    await expect(page).toHaveURL(/\/fr\/daily$/);
    await expect(page.getByText(t("daily.saved"))).toBeVisible();
    await expect(daily.score).toHaveText(`5/${DAILY_ROUNDS}`);
    await expect(page.locator("#daily-board tr.me")).toContainText(user.name);
  });

  test("le serveur tient le chrono et ne donne pas la réponse avant la fin du calcul", async ({ request }) => {
    const post = (data: object) => request.post("/api/daily", { data });
    const { run: started } = await (await post({ action: "start", token: null })).json();
    expect(started.question).toBeNull();

    const { run } = await (await post({ action: "next", token: started.token })).json();
    expect(Object.keys(run.question).sort()).toEqual(["difficulty", "index", "remainingMs", "text", "timeLimitMs"]);
    expect(JSON.stringify(run)).not.toContain("solution");
    expect(run.answers).toEqual([]);

    // Un champ de temps envoyé par le client est refusé.
    expect((await post({ action: "answer", token: started.token, value: 1, timeMs: 1 })).status()).toBe(400);
    // Le jeton d'un autre essai ne désigne rien.
    expect((await post({ action: "next", token: "00000000-0000-4000-8000-000000000000" })).status()).toBe(404);

    const { run: after } = await (await post({ action: "answer", token: started.token, value: 0 })).json();
    expect(after.answers).toHaveLength(1);
    expect(after.answers[0].solution).toBeTruthy();
    expect(after.index).toBe(1);
    // Un second envoi ne compte pas pour le calcul suivant.
    const { run: again } = await (await post({ action: "answer", token: started.token, value: 0 })).json();
    expect(again.index).toBe(1);
  });

  test("le meilleur score d'un jour terminé reçoit le succès, visible sur son profil", async ({ page }) => {
    const account = (user: TestUser) => prisma.user.create({ data: { id: randomUUID(), name: user.name, email: user.email } });
    const winner = await account(newUser());
    const other = await account(newUser());
    // Un jour passé propre à ce test.
    const date = `2020-01-${String(Math.floor(Math.random() * 28) + 1).padStart(2, "0")}`;
    await prisma.dailyChallenge.deleteMany({ where: { date } });
    await prisma.dailyChallenge.create({ data: { date, seed: "e2e" } });
    const run = (userId: string, correct: number, totalTimeMs: number) => ({ date, token: randomUUID(), userId, correct, totalTimeMs, index: 5, startedAt: new Date(), finishedAt: new Date() });
    await prisma.dailyRun.createMany({ data: [run(winner.id, 5, 30_000), run(other.id, 5, 31_000)] });

    await settleDailyChallenges(new Date());
    expect(date < dailyDate(Date.now())).toBe(true);
    const champions = await prisma.userAchievement.findMany({ where: { achievementId: "daily-champion", userId: { in: [winner.id, other.id] } }, select: { userId: true } });
    expect(champions).toEqual([{ userId: winner.id }]);

    await page.goto(`/fr/daily?date=${date}`);
    await expect(page.getByRole("table")).toContainText(winner.name);
    await page.goto(`/fr/player/${winner.id}`);
    await expect(page.getByText(tr("achievements.daily-champion.name"))).toBeVisible();
    await page.goto(`/fr/player/${other.id}`);
    await expect(page.getByText(tr("achievements.daily-champion.name"))).toHaveCount(0);
  });
});
