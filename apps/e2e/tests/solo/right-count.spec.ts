import { prisma } from "@calculus/db";
import { gamesOf } from "../../fixtures/db";
import { t } from "../../fixtures/i18n";
import { calcText, expectedAnswer } from "../../fixtures/oracle";
import { expect, presetSolo, test } from "../../fixtures/test";
import { answerBox } from "../../pages/answer";
import { SoloPage } from "../../pages/SoloPage";

const RIGHT_COUNT = { game: "right-count", operations: ["add", "sub"], timePerQuestion: 45 } as const;

test.describe("le bon compte en solo", () => {
  test("on ne valide qu'avec toutes les plaques", async ({ page }) => {
    await presetSolo(page, { ...RIGHT_COUNT, operations: [...RIGHT_COUNT.operations] });
    const solo = new SoloPage(page);
    await solo.goto();
    await solo.start();

    const box = answerBox(page);
    await expect(box).toBeEnabled();
    const ok = page.getByRole("button", { name: t("game.submit") });
    await expect(ok).toBeDisabled();
    const q = await expectedAnswer(page);
    const tiles = page.getByRole("group", { name: t("game.tiles") }).getByRole("button");
    await expect(tiles).toHaveCount(4);

    // Une seule plaque : total affiché, mais pas validable.
    const first = (await tiles.first().textContent())!;
    await box.fill(first);
    await expect(page.locator(".count-total")).toContainText(first);
    await expect(ok).toBeDisabled();
    // Toutes les plaques, mauvais total : on peut le valider ; « = » le pose comme étape.
    await box.fill(q.wrong);
    await expect(ok).toBeEnabled();
    await box.press("=");
    const steps = page.getByRole("list", { name: t("game.steps") });
    await expect(steps.getByRole("listitem")).toHaveCount(1);
    await expect(box).toHaveValue("");
    await expect(tiles).toHaveCount(1);
    await expect(ok).toBeEnabled();
    // Effacer dans une ligne vide rouvre l'étape.
    await box.press("Backspace");
    await expect(steps).toHaveCount(0);
    await expect(box).not.toHaveValue("");

    await box.fill("");
    await solo.play("right");
    await solo.playAll(["right", "right", "right", "right"]);
    await expect(solo.verdict).toHaveText("5/5");
    // Revue : le tirage, puis une solution.
    await expect(page.locator(".rv-q").first()).toContainText("→");
  });

  test("chaque calcul posé devient une plaque, jusqu'au compte", async ({ page }) => {
    await presetSolo(page, { ...RIGHT_COUNT, operations: [...RIGHT_COUNT.operations] });
    const solo = new SoloPage(page);
    await solo.goto();
    await solo.start();
    const box = answerBox(page);
    await expect(box).toBeEnabled();
    const q = await expectedAnswer(page);
    const tiles = page.getByRole("group", { name: t("game.tiles") }).getByRole("button");
    const values = (await tiles.allTextContents()).map(Number);

    // Première étape : les deux premières plaques additionnées, avec le bouton « = ».
    for (const tok of [String(values[0]), "+", String(values[1])]) {
      if (tok === "+") await page.getByRole("button", { name: t("game.operator.add"), exact: true }).click();
      else await page.getByRole("group", { name: t("game.tiles") }).getByRole("button", { name: tok, exact: true, pressed: false }).first().click();
    }
    await page.getByRole("button", { name: t("game.commitStep") }).click();
    const steps = page.getByRole("list", { name: t("game.steps") }).getByRole("listitem");
    await expect(steps).toHaveText([`${values[0]} + ${values[1]} = ${values[0]! + values[1]!}`]);
    await expect(tiles).toHaveCount(3);
    await expect(page.locator(".tile.made")).toHaveText(String(values[0]! + values[1]!));

    // On revient au départ et on tape la solution d'un coup : elle se valide toujours.
    await page.getByRole("button", { name: t("game.delete") }).click();
    await box.fill("");
    await expect(tiles).toHaveCount(4);
    await box.fill(q.answer);
    await box.press("Enter");
    await expect(box).toBeDisabled();
    await expect(page.locator(".result-line .ok")).toBeVisible();
  });

  test("les opérations choisies sont les seules proposées, sans réglage de parenthèses", async ({ page }) => {
    await presetSolo(page, { ...RIGHT_COUNT, operations: ["add", "mul"] });
    const solo = new SoloPage(page);
    await solo.goto();
    await expect(page.getByRole("button", { name: t("ops.paren") })).toHaveCount(0);
    await solo.start();
    await expect(answerBox(page)).toBeEnabled();
    await expect(calcText(page)).toHaveAttribute("data-ops", "add mul");
    await expect(page.getByRole("button", { name: t("game.operator.add"), exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: t("game.operator.sub"), exact: true })).toHaveCount(0);
  });
});

test.describe("le bon compte en solo connecté", () => {
  test("la partie est rejouée par le serveur avec les expressions saisies", async ({ page, user }) => {
    await presetSolo(page, { ...RIGHT_COUNT, operations: ["add", "sub", "mul", "div"], difficulty: 3, timePerQuestion: 60 });
    const solo = new SoloPage(page);
    await solo.goto();
    await solo.start();
    const played = await solo.playAll(["right", "right", "right", "right", "right"]);
    await expect(solo.verdict).toHaveText("5/5");
    await expect(page.getByText(t("solo.saved"))).toBeVisible();

    const [saved] = await gamesOf(user.email);
    expect(saved?.correct).toBe(5);
    const game = await prisma.game.findUniqueOrThrow({ where: { id: saved!.game.id }, include: { questions: { orderBy: { position: "asc" }, include: { answers: true } } } });
    expect(game.game).toBe("right-count");
    game.questions.forEach((q, i) => expect(q.answers[0]!.text).toBe(played[i]!.answer));
  });
});
