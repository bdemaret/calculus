import { gamesOf } from "../../fixtures/db";
import { t } from "../../fixtures/i18n";
import { expect, presetSolo, test } from "../../fixtures/test";
import { SoloPage } from "../../pages/SoloPage";

test.describe("solo en invité", () => {
  test("une partie sans faute donne 5/5 et n'enregistre rien", async ({ page }) => {
    const calls: string[] = [];
    page.on("request", (r) => {
      if (r.url().includes("/api/solo-results")) calls.push(r.url());
    });
    await presetSolo(page, { rounds: 5 });
    const solo = new SoloPage(page);
    await solo.goto();
    await expect(page.getByRole("link", { name: t("solo.loginToSave") })).toBeVisible();
    await solo.start();
    await solo.playAll(["right", "right", "right", "right", "right"]);

    await expect(solo.verdict).toHaveText("5/5");
    await expect(page.getByText(t("report.perfect"))).toBeVisible();
    await expect(page.getByRole("heading", { name: t("report.reviewTitle") })).toBeVisible();
    expect(calls).toEqual([]);
  });

  test("une erreur montre la bonne réponse et compte dans le score", async ({ page }) => {
    await presetSolo(page, { rounds: 5 });
    const solo = new SoloPage(page);
    await solo.goto();
    await solo.start();
    await solo.play("right");
    const missed = await solo.play("wrong");
    await expect(page.locator(".result-line")).toHaveText(`${t("game.no")} : ${missed.answer}`);
    await solo.playAll(["right", "right", "right"]);

    await expect(solo.verdict).toHaveText("4/5");
    await expect(page.getByText(t("report.goodAnswers"), { exact: true })).toBeVisible();
  });

  test("après une erreur, le calcul et sa correction restent jusqu'à « Suivant », sans chrono", async ({ page }) => {
    await presetSolo(page, { rounds: 5, timePerQuestion: 3 });
    const solo = new SoloPage(page);
    await solo.goto();
    await solo.start();
    const missed = await solo.play("wrong");
    const review = page.locator(".solo-review");
    await expect(page.getByTestId("calc-text")).toHaveAttribute("data-calc", missed.text);
    await expect(solo.answer).toHaveValue(missed.wrong);
    await expect(review).toContainText(`${t("solo.yourAnswer")} ${missed.wrong}`);
    await expect(review).toContainText(`${t("solo.correction")} ${missed.text} = ${missed.answer}`);
    // On attend plus que le temps d'une manche : rien ne bouge tant que le joueur ne passe pas à la suite.
    await page.waitForTimeout(3_500);
    await expect(solo.answer).toBeDisabled();
    await expect(page.getByTestId("calc-text")).toHaveAttribute("data-calc", missed.text);

    // Le bouton…
    await page.getByRole("button", { name: t("solo.next") }).click();
    await expect(solo.answer).toBeEnabled();
    await expect(review).toHaveCount(0);
    // … ou la touche Entrée, même quand le bouton n'a pas le focus.
    await solo.play("timeout");
    await expect(page.locator(".result-line")).toContainText(t("game.timeUp"));
    await page.locator("body").click({ position: { x: 5, y: 5 } });
    await page.keyboard.press("Enter");
    await expect(solo.answer).toBeEnabled();
    await expect(solo.answer).toHaveValue("");

    // Une bonne réponse enchaîne toute seule ; la dernière erreur mène au bilan par « Voir le bilan ».
    await solo.playAll(["right", "right"]);
    await solo.play("wrong");
    await page.getByRole("button", { name: t("solo.seeReport") }).click();
    await expect(solo.verdict).toHaveText("2/5");
  });

  test("laisser filer le temps compte comme une erreur", async ({ page }) => {
    await presetSolo(page, { rounds: 5, timePerQuestion: 3 });
    const solo = new SoloPage(page);
    await solo.goto();
    await solo.start();
    const missed = await solo.play("timeout");
    await expect(page.locator(".result-line")).toHaveText(`${t("game.timeUp")} : ${missed.answer}`);
    await solo.playAll(["right", "right", "right", "right"]);

    await expect(solo.verdict).toHaveText("4/5");
  });

  test("en battle royale, la première erreur arrête la partie", async ({ page }) => {
    await presetSolo(page, { mode: "battle-royale" });
    const solo = new SoloPage(page);
    await solo.goto();
    await solo.start();
    await solo.playAll(["right", "right", "wrong"]);

    await expect(solo.verdict).toHaveText("2");
  });

  test("quitter la partie ramène aux réglages", async ({ page }) => {
    await presetSolo(page, {});
    const solo = new SoloPage(page);
    await solo.goto();
    await solo.start();
    await expect(solo.answer).toBeEnabled();
    await page.getByRole("button", { name: t("game.quit") }).click();
    await expect(solo.startButton).toBeVisible();
  });

  test("les réglages choisis s'appliquent aux calculs et sont gardés", async ({ page }) => {
    const solo = new SoloPage(page);
    await solo.goto();
    const pressed = (name: string) => page.getByRole("button", { name, exact: true });

    await pressed(`1 · ${t("levels.1")}`).click();
    await pressed(t("ops.mul")).click();
    await pressed(t("ops.add")).click();
    await pressed(t("ops.sub")).click();
    await page.getByLabel(t("settings.rounds")).fill("5");
    await expect(pressed(t("ops.mul"))).toHaveAttribute("aria-pressed", "true");
    await expect(pressed(t("ops.add"))).toHaveAttribute("aria-pressed", "false");

    // Les réglages sont gardés dans le navigateur.
    await page.reload();
    await expect(pressed(t("ops.mul"))).toHaveAttribute("aria-pressed", "true");
    await expect(pressed(t("ops.sub"))).toHaveAttribute("aria-pressed", "false");

    await solo.start();
    for (let i = 0; i < 5; i++) {
      const { text } = await solo.play("right");
      expect(text).toMatch(/^\d+ × \d+$/);
    }
    await expect(solo.verdict).toHaveText("5/5");
  });

  test("on ne peut pas retirer la dernière opération", async ({ page }) => {
    await presetSolo(page, { operations: ["add"] });
    const solo = new SoloPage(page);
    await solo.goto();
    const add = page.getByRole("button", { name: t("ops.add"), exact: true });
    await add.click();
    await expect(add).toHaveAttribute("aria-pressed", "true");
  });

  test("les calculs du niveau 5 se résolvent avec les priorités", async ({ page }) => {
    await presetSolo(page, { difficulty: 5, operations: ["add", "sub", "mul", "div"], parentheses: true, timePerQuestion: 20 });
    const solo = new SoloPage(page);
    await solo.goto();
    await solo.start();
    await solo.playAll(["right", "right", "right", "right", "right"]);
    await expect(solo.verdict).toHaveText("5/5");
  });

  test("puissances et racines carrées se résolvent, avec l'exposant maximal choisi", async ({ page }) => {
    await presetSolo(page, { difficulty: 3, operations: ["pow", "sqrt"], powerMax: 5, timePerQuestion: 20 });
    const solo = new SoloPage(page);
    await solo.goto();
    await expect(page.getByRole("slider", { name: t("settings.powerMax") })).toHaveValue("5");
    await solo.start();
    await solo.playAll(["right", "right", "right", "right", "right"]);
    await expect(solo.verdict).toHaveText("5/5");
  });

  test("puissance et racine : par défaut au niveau légende, jamais au bon compte", async ({ page }) => {
    await presetSolo(page, { difficulty: 4 });
    const solo = new SoloPage(page);
    await solo.goto();
    const pow = page.getByRole("button", { name: t("ops.pow"), exact: true });
    await expect(pow).toHaveAttribute("aria-pressed", "false");
    await expect(page.getByRole("slider", { name: t("settings.powerMax") })).toHaveCount(0);
    await page.getByRole("button", { name: `5 · ${t("levels.5")}` }).click();
    await expect(pow).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("button", { name: t("ops.sqrt"), exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("slider", { name: t("settings.powerMax") })).toHaveValue("2");
    await page.getByRole("button", { name: t("games.right-count.name") }).click();
    await expect(pow).toHaveCount(0);
  });
});

test.describe("solo connecté", () => {
  test("la partie est rejouée par le serveur, enregistrée et visible dans le tableau de bord", async ({ page, user }) => {
    await presetSolo(page, { rounds: 5 });
    const solo = new SoloPage(page);
    await solo.goto();
    await expect(page.getByRole("link", { name: t("solo.loginToSave") })).toHaveCount(0);
    await solo.start();
    await solo.playAll(["right", "wrong", "right", "right", "right"]);
    await expect(solo.verdict).toHaveText("4/5");
    await expect(page.getByText(t("solo.saved"))).toBeVisible();

    const [played] = await gamesOf(user.email);
    expect(played?.game.solo).toBe(true);
    expect(played?.correct).toBe(4);
    expect(played?.answered).toBe(5);

    await page.goto("/fr/dashboard");
    await expect(page.getByRole("heading", { name: t("dashboard.hello", { name: user.name }) })).toBeVisible();
    await page.getByRole("link", { name: t("dashboard.view") }).click();
    await expect(page).toHaveURL(/\/fr\/report\//);
    await expect(page.getByTestId("report-verdict")).toHaveText("4/5");
  });
});
