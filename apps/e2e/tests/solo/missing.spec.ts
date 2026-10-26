import { prisma } from "@calculus/db";
import { gamesOf } from "../../fixtures/db";
import { t } from "../../fixtures/i18n";
import { calcText } from "../../fixtures/oracle";
import { expect, presetSolo, test } from "../../fixtures/test";
import { answerBox } from "../../pages/answer";
import { SoloPage } from "../../pages/SoloPage";

const ALL_OPS = ["add", "sub", "mul", "div"] as const;

test.describe("nombre manquant en solo", () => {
  test("la case réponse prend la place du nombre caché ; une erreur montre la solution", async ({ page }) => {
    await presetSolo(page, { game: "missing", missingKind: "number" });
    const solo = new SoloPage(page);
    await solo.goto();
    await solo.start();

    await expect(answerBox(page)).toBeEnabled();
    await expect(calcText(page)).toHaveAttribute("data-calc", /\?.* = \d+$/);
    // La case est dans l'égalité, pas après elle.
    await expect(calcText(page).getByRole("textbox", { name: t("game.yourAnswer") })).toBeVisible();

    await solo.play("right");
    const missed = await solo.play("wrong");
    expect(missed.text).toContain("?");
    await expect(page.locator(".result-line")).toHaveText(`${t("game.no")} : ${missed.answer}`);
    await solo.playAll(["right", "right", "right"]);

    await expect(solo.verdict).toHaveText("4/5");
    // Revue : l'égalité à trou, puis ce qui manquait.
    await expect(page.locator(".rv-q").filter({ hasText: missed.text }).first()).toContainText(`→${missed.answer}`);
  });

  test("un opérateur manquant se tape au clavier", async ({ page }) => {
    await presetSolo(page, { game: "missing", missingKind: "operator", difficulty: 3, operations: [...ALL_OPS], timePerQuestion: 20 });
    const solo = new SoloPage(page);
    await solo.goto();
    await solo.start();
    const played = await solo.playAll(["right", "right", "right", "wrong", "right"]);
    for (const p of played) expect(["+", "−", "×", "÷"]).toContain(p.answer);
    await expect(solo.verdict).toHaveText("4/5");
  });

  test("le jeu et ce qui manque se choisissent dans les réglages, et sont gardés", async ({ page }) => {
    const solo = new SoloPage(page);
    await solo.goto();
    const kind = page.getByRole("group", { name: t("settings.missingKind.label") });
    await expect(kind).toHaveCount(0);
    // La bombe se joue en ligne seulement : pas proposée en solo.
    await expect(page.getByRole("button", { name: new RegExp(t("games.bomb.name")) })).toHaveCount(0);
    await page.getByRole("button", { name: new RegExp(t("games.missing.name")) }).click();
    await page.getByRole("button", { name: t("settings.missingKind.operator"), exact: true }).click();
    await expect(page.getByText(new RegExp(` \\? .* = \\d+$`))).toBeVisible();

    await page.reload();
    await expect(page.getByRole("button", { name: new RegExp(t("games.missing.name")) })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("button", { name: t("settings.missingKind.operator"), exact: true })).toHaveAttribute("aria-pressed", "true");
  });
});

test.describe("nombre manquant en solo connecté", () => {
  test("la partie est rejouée par le serveur avec les opérateurs saisis", async ({ page, user }) => {
    await presetSolo(page, { game: "missing", missingKind: "mixed", difficulty: 3, operations: [...ALL_OPS], timePerQuestion: 20 });
    const solo = new SoloPage(page);
    await solo.goto();
    await solo.start();
    const played = await solo.playAll(["right", "wrong", "right", "right", "right"]);
    await expect(solo.verdict).toHaveText("4/5");
    await expect(page.getByText(t("solo.saved"))).toBeVisible();

    const [saved] = await gamesOf(user.email);
    expect(saved?.correct).toBe(4);
    const game = await prisma.game.findUniqueOrThrow({ where: { id: saved!.game.id }, include: { questions: { orderBy: { position: "asc" }, include: { answers: true } } } });
    expect(game.game).toBe("missing");
    // Chaque réponse est gardée telle que saisie : un nombre, ou le symbole de l'opérateur.
    game.questions.forEach((q, i) => {
      const a = q.answers[0]!;
      expect(q.solution).toBe(played[i]!.answer);
      expect(String(a.value ?? a.text)).toBe(i === 1 ? played[i]!.wrong : played[i]!.answer);
    });
  });
});
