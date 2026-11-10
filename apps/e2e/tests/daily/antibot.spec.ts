import type { APIRequestContext } from "@playwright/test";
import { Client } from "colyseus.js";
import { randomUUID } from "node:crypto";
import { banUser, getDailyBoard, prisma, settleDailyChallenges, unbanUser } from "@calculus/db";
import { DAILY_BAN_MS, DAILY_ROUNDS, JOIN_ERRORS } from "@calculus/game-core";
import { ADMIN_ID, GAME_HTTP_URL } from "../../env";
import { t } from "../../fixtures/i18n";
import { solveText } from "../../fixtures/oracle";
import { expect, newUser, signUp, test, type TestUser } from "../../fixtures/test";

const gameClient = () => new Client(GAME_HTTP_URL.replace("http", "ws"));
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Joue l'essai du jour par l'API en répondant juste, après `delayMs` par calcul. Rend le jeton et la dernière réponse du serveur. */
async function playDaily(api: APIRequestContext, delayMs: number) {
  const post = (data: object) => api.post("/api/daily", { data });
  const { run: started } = await (await post({ action: "start", token: null })).json();
  const token: string = started.token;
  let last = await post({ action: "state", token });
  for (let i = 0; i < DAILY_ROUNDS; i++) {
    const { run } = await (await post({ action: "next", token })).json();
    await wait(delayMs);
    last = await post({ action: "answer", token, value: Number(solveText(run.question.text).answer) });
    if (!last.ok()) break;
  }
  return { token, last };
}

test.describe("calcul du jour : anti-bot", () => {
  test("une bonne réponse en un temps impossible bannit le compte : calcul du jour, jeton de jeu et salles fermés, puis rouverts au déban", async ({ page, user }) => {
    const api = page.request;
    // Jeton émis avant le ban : le serveur de jeu doit le refuser quand même.
    const { token: gameToken } = await (await api.post("/api/game-token", { data: {} })).json();

    const { token, last } = await playDaily(api, 0);
    expect(last.status()).toBe(403);
    expect(await last.json()).toEqual({ error: "banned" });

    const account = await prisma.user.findUniqueOrThrow({ where: { email: user.email }, include: { botReports: true } });
    expect(account.bannedAt).not.toBeNull();
    expect(account.banReason).toBe("bot-daily");
    expect(account.botReports).toHaveLength(1);
    expect(account.botReports[0]).toMatchObject({ source: "daily", verdict: "bot", rules: ["too-fast"] });
    const proof = account.botReports[0]!.detail as { timeMs: number; correct: boolean }[];
    expect(proof).toHaveLength(1);
    expect(proof[0]!.correct).toBe(true);
    expect(proof[0]!.timeMs).toBeLessThan(DAILY_BAN_MS);

    expect((await api.post("/api/daily", { data: { action: "state", token } })).status()).toBe(403);
    expect((await api.post("/api/game-token", { data: {} })).status()).toBe(403);
    await expect(gameClient().create("game", { token: gameToken })).rejects.toMatchObject({ code: JOIN_ERRORS.banned });

    await page.goto("/fr/daily");
    await expect(page.getByTestId("banned-notice")).toBeVisible();

    expect(await unbanUser(account.id, new Date())).toBe(true);
    expect((await api.post("/api/daily", { data: { action: "state", token } })).status()).toBe(200);
    expect((await api.post("/api/game-token", { data: {} })).status()).toBe(200);
    expect(await prisma.botReport.count({ where: { userId: account.id, reviewedAt: null } })).toBe(0);
  });

  test("un essai juste au-dessus du seuil de ban n'est jamais sanctionné, au plus signalé", async ({ page, user }) => {
    // Le serveur mesure au moins l'attente : jamais sous le seuil de ban, mais vite pour les niveaux durs.
    const { last } = await playDaily(page.request, DAILY_BAN_MS + 50);
    expect(last.status()).toBe(200);
    const account = await prisma.user.findUniqueOrThrow({ where: { email: user.email }, include: { botReports: true } });
    expect(account.bannedAt).toBeNull();
    // Le signalement dépend du temps mesuré : un serveur de test chargé peut répondre trop lentement pour qu'il y en ait un.
    expect(account.botReports.map((r) => r.verdict).filter((v) => v !== "suspect")).toEqual([]);
    expect(account.botReports.length).toBeLessThanOrEqual(1);
    await page.goto("/fr/daily");
    await expect(page.locator("#daily-board tr.me")).toContainText(user.name);
  });

  test("l'essai d'un invité aux temps impossibles ne se rattache pas à un compte", async ({ request }) => {
    const { token, last } = await playDaily(request, 0);
    expect(last.status()).toBe(200);
    const user = await signUp(request, newUser());
    const { run } = await (await request.post("/api/daily", { data: { action: "state", token } })).json();
    expect(run).toBeNull();
    const account = await prisma.user.findUniqueOrThrow({ where: { email: user.email }, include: { dailyRuns: true } });
    expect(account.bannedAt).toBeNull();
    expect(account.dailyRuns).toHaveLength(0);
  });

  test("un compte banni sort du classement d'un jour et n'en est pas le gagnant", async () => {
    const account = (user: TestUser) => prisma.user.create({ data: { id: randomUUID(), name: user.name, email: user.email } });
    const cheater = await account(newUser());
    const honest = await account(newUser());
    // Un jour passé propre à ce test.
    const date = `2019-01-${String(Math.floor(Math.random() * 28) + 1).padStart(2, "0")}`;
    await prisma.dailyChallenge.deleteMany({ where: { date } });
    await prisma.dailyChallenge.create({ data: { date, seed: "e2e-antibot" } });
    const run = (userId: string, totalTimeMs: number) => ({ date, token: randomUUID(), userId, correct: 5, totalTimeMs, index: 5, startedAt: new Date(), finishedAt: new Date() });
    await prisma.dailyRun.createMany({ data: [run(cheater.id, 5000), run(honest.id, 30_000)] });
    expect((await getDailyBoard(date)).top.map((e) => e.userId)).toEqual([cheater.id, honest.id]);

    expect(await banUser(cheater.id, "manual", new Date())).toBe(true);
    const board = await getDailyBoard(date, cheater.id);
    expect(board.top.map((e) => [e.userId, e.rank])).toEqual([[honest.id, 1]]);
    expect(board.players).toBe(1);
    expect(board.me).toBeNull();

    await settleDailyChallenges(new Date());
    const winners = await prisma.dailyRun.findMany({ where: { date, won: true }, select: { userId: true } });
    expect(winners).toEqual([{ userId: honest.id }]);
  });

  test("panel admin : un signalement se classe ou mène à un ban, un compte banni se débannit", async ({ page, user }) => {
    // Le compte du test devient l'administrateur : `ADMIN_USER_IDS` du site de test ne connaît que cet id.
    await prisma.user.deleteMany({ where: { id: ADMIN_ID } });
    await prisma.user.update({ where: { email: user.email }, data: { id: ADMIN_ID } });
    // La copie de la session gardée en cookie porte encore l'ancien id : sans elle, le site relit la session en base.
    await page.context().clearCookies({ name: /session_data/ });

    const detail = [900, 1400, 700, 4000, 1700].map((timeMs, i) => ({ text: `${i + 2} + 3`, value: i + 5, correct: true, timeMs }));
    const suspect = async () => {
      const u = newUser();
      const row = await prisma.user.create({ data: { id: randomUUID(), name: u.name, email: u.email } });
      await prisma.botReport.create({ data: { userId: row.id, source: "daily", ref: "2026-11-09", verdict: "suspect", rules: ["fast-for-level"], detail } });
      return row;
    };
    const [cleared, guilty] = [await suspect(), await suspect()];

    await page.goto("/fr/admin/bans");
    const suspects = page.getByTestId("bot-suspects").getByRole("listitem");
    const banned = page.getByTestId("banned-users").getByRole("listitem");
    await expect(suspects.filter({ hasText: guilty.email })).toContainText(t("admin.bans.rule.fast-for-level"));
    await expect(suspects.filter({ hasText: guilty.email }).getByRole("row")).toHaveCount(detail.length + 1);

    // Classé sans suite : le signalement quitte la liste, le compte reste libre.
    await suspects.filter({ hasText: cleared.email }).getByRole("button", { name: t("admin.bans.dismiss") }).click();
    await expect(suspects.filter({ hasText: cleared.email })).toHaveCount(0);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: cleared.id } })).bannedAt).toBeNull();
    expect(await prisma.botReport.count({ where: { userId: cleared.id, reviewedAt: null } })).toBe(0);

    // Banni à la main : il passe dans la liste des bannis, avec sa preuve.
    page.on("dialog", (dialog) => void dialog.accept());
    await suspects.filter({ hasText: guilty.email }).getByRole("button", { name: t("admin.bans.ban"), exact: true }).click();
    await expect(banned.filter({ hasText: guilty.email })).toContainText(t("admin.bans.reason.manual"));
    await expect(suspects.filter({ hasText: guilty.email })).toHaveCount(0);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: guilty.id } })).banReason).toBe("manual");

    // La fiche du compte montre le ban et permet de le lever.
    await banned.filter({ hasText: guilty.email }).getByRole("link", { name: guilty.name }).click();
    await expect(page.getByTestId("ban-status")).toContainText(t("admin.users.banned"));
    await page.getByRole("button", { name: t("admin.bans.unban") }).click();
    await expect(page.getByTestId("ban-status")).toHaveText(t("admin.users.active"));
    expect((await prisma.user.findUniqueOrThrow({ where: { id: guilty.id } })).bannedAt).toBeNull();

    // Un administrateur ne peut pas être banni depuis le panel.
    expect((await page.request.post("/api/admin/bans", { data: { action: "ban", userId: ADMIN_ID } })).status()).toBe(400);
  });

  test("le panel des bans est fermé aux autres comptes", async ({ page, user }) => {
    const account = await prisma.user.findUniqueOrThrow({ where: { email: user.email } });
    expect((await page.request.post("/api/admin/bans", { data: { action: "ban", userId: account.id } })).status()).toBe(403);
    expect((await page.request.patch("/api/admin/bans", { data: { reportId: "x" } })).status()).toBe(403);
    expect((await page.goto("/fr/admin/bans"))?.status()).toBe(404);
  });
});
