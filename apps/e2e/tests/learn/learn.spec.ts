import { DIFFICULTIES, TECHNIQUES, TECHNIQUE_IDS, detectTechnique, techniquesOfLevel, type GameSettings } from "@calculus/game-core";
import { t } from "../../fixtures/i18n";
import { expectedAnswer } from "../../fixtures/oracle";
import { expect, presetSolo, test } from "../../fixtures/test";
import { answerBox, answerRound } from "../../pages/answer";
import { SoloPage } from "../../pages/SoloPage";

/** Une partie de calcul mental qui donne presque toujours des conseils : niveau 1, additions seules (41 % des calculs). */
const TIPS_GAME = { difficulty: 1, operations: ["add"], rounds: 15 } satisfies Partial<GameSettings>;

test.describe("techniques de calcul", () => {
  test("la page montre un niveau à la fois, une fiche par technique", async ({ page }) => {
    await page.goto("/fr/learn");
    await expect(page.getByRole("heading", { name: t("learn.title") })).toBeVisible();
    const tabs = page.getByRole("navigation", { name: t("learn.levelsNav") });
    // Sans niveau : le premier.
    await expect(tabs.getByRole("link", { name: `1 · ${t("levels.1")}` })).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("article")).toHaveCount(techniquesOfLevel(1).length);

    for (const d of DIFFICULTIES) {
      await tabs.getByRole("link", { name: `${d} · ${t(`levels.${d}`)}` }).click();
      await expect(page).toHaveURL(new RegExp(`/fr/learn\\?level=${d}$`));
      await expect(page.getByRole("heading", { name: new RegExp(`^${t("learn.level", { level: d, name: t(`levels.${d}`) })}`) })).toBeVisible();
      await expect(page.getByRole("article")).toHaveCount(techniquesOfLevel(d).length);
    }
    expect(DIFFICULTIES.reduce((n, d) => n + techniquesOfLevel(d).length, 0)).toBe(TECHNIQUE_IDS.length);

    await page.goto("/fr/learn?level=2");
    const card = page.getByRole("article", { name: t("techniques.mul-by-9.name") });
    await expect(card.getByText(t("learn.kicker"))).toBeVisible();
    await expect(card.getByRole("list", { name: t("learn.steps") }).getByRole("listitem")).toHaveCount(2);
    await card.getByRole("link", { name: t("learn.trainOn", { name: t("techniques.mul-by-9.name") }) }).click();
    await expect(page).toHaveURL(/\/fr\/learn\/mul-by-9$/);
  });

  test("un ancien lien vers une technique ouvre son niveau et la met en avant", async ({ page }) => {
    await page.goto("/fr/learn#sqrt-bracketing");
    await expect(page).toHaveURL(/\/fr\/learn\?level=5#sqrt-bracketing$/);
    await expect(page.locator("#sqrt-bracketing:target")).toBeInViewport();
  });

  test("l'entraînement donne des calculs de la technique et l'explique après chaque réponse", async ({ page }) => {
    await page.goto("/fr/learn/mul-by-9");
    await expect(page.getByRole("heading", { name: t("techniques.mul-by-9.name") })).toBeVisible();

    const first = await answerRound(page, "wrong");
    expect(detectTechnique(first.text)?.technique).toBe("mul-by-9");
    await expect(page.locator(".result-line")).toHaveText(`${t("game.no")} : ${first.answer}`);
    await expect(page.getByRole("heading", { name: t("learn.howTo") })).toBeVisible();
    await expect(page.getByRole("list", { name: t("learn.steps") }).getByRole("listitem")).toHaveCount(2);

    // Entrée sur « Calcul suivant », qui a le focus.
    await page.keyboard.press("Enter");
    await expect(answerBox(page)).toBeEnabled();
    const second = await expectedAnswer(page);
    expect(second.text).not.toBe(first.text);
    expect(detectTechnique(second.text)?.technique).toBe("mul-by-9");
    await answerRound(page, "right");
    await expect(page.locator(".result-line")).toContainText(t("learn.right"));
    await expect(page.locator("#margin-notes")).toContainText("1/2");
  });

  test("le chrono compte un calcul non répondu comme une erreur", async ({ page }) => {
    await page.goto("/fr/learn/plus-minus-9");
    await page.getByRole("button", { name: t("learn.timerSeconds", { seconds: 10 }) }).click();
    const missed = await answerRound(page, "timeout");
    await expect(page.locator(".result-line")).toHaveText(`${t("game.timeUp")} : ${missed.answer}`);
    await expect(page.getByRole("heading", { name: t("learn.howTo") })).toBeVisible();
  });

  test("une technique inconnue répond 404", async ({ page }) => {
    const res = await page.goto("/fr/learn/nimporte-quoi");
    expect(res?.status()).toBe(404);
  });
});

test.describe("conseils en fin de partie", () => {
  test("le rapport signale les calculs qu'une technique simplifie, et un invité peut les masquer", async ({ page }) => {
    await presetSolo(page, TIPS_GAME);
    const solo = new SoloPage(page);
    await solo.goto();
    await solo.start();
    const played = await solo.playAll(Array<"wrong">(TIPS_GAME.rounds).fill("wrong"));
    await expect(solo.verdict).toBeVisible();

    // Les conseils attendus, recalculés avec game-core à partir des calculs joués.
    const hints = played.map((q) => detectTechnique(q.text)).filter((h) => h !== null);
    expect(hints.length, "aucun conseil sur 15 calculs : tirage très improbable").toBeGreaterThan(0);
    const tips = page.locator(".rv-tip");
    await expect(tips).toHaveCount(hints.length);
    await expect(page.getByRole("button", { name: t("report.reviewTips", { count: hints.length }) })).toBeVisible();

    const first = hints[0]!;
    const tip = tips.first();
    await expect(tip.locator("summary")).toContainText(t("report.tipLabel", { name: t(`techniques.${first.technique}.name`), target: first.target }));
    await tip.locator("summary").click();
    await expect(tip.getByRole("list", { name: t("learn.steps") }).getByRole("listitem")).toHaveCount(first.steps.length);
    await expect(tip.getByRole("link", { name: t("report.tipLearn") })).toHaveAttribute("href", `/fr/learn?level=${TECHNIQUES[first.technique].level}#${first.technique}`);
    await expect(tip.getByRole("link", { name: t("report.tipPractice") })).toHaveAttribute("href", `/fr/learn/${first.technique}`);

    // Masqués : retenu dans le navigateur, et réaffichables au même endroit.
    await page.getByRole("button", { name: t("report.tipsHide") }).click();
    await expect(tips).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem("calculus:tips"))).toBe("false");
    await page.getByRole("button", { name: t("report.tipsShow") }).click();
    await expect(tips).toHaveCount(hints.length);
  });

  test("« Désactiver l'aide » dans les préférences retire les conseils du rapport", async ({ page, user }) => {
    void user;
    await page.goto("/fr/profile/preferences");
    await page.getByRole("button", { name: t("profile.tipsOff") }).click();
    await expect(page.getByText(t("profile.inputSaved"))).toBeVisible();
    await expect(page.getByRole("button", { name: t("profile.tipsOff") })).toHaveAttribute("aria-pressed", "true");

    await presetSolo(page, TIPS_GAME);
    const solo = new SoloPage(page);
    await solo.goto();
    await solo.start();
    const played = await solo.playAll(Array<"wrong">(TIPS_GAME.rounds).fill("wrong"));
    await expect(solo.verdict).toBeVisible();
    expect(played.some((q) => detectTechnique(q.text))).toBe(true);
    await expect(page.getByRole("heading", { name: t("report.reviewTitle") })).toBeVisible();
    await expect(page.locator(".rv-tip")).toHaveCount(0);
    await expect(page.getByRole("button", { name: t("report.tipsShow") })).toHaveCount(0);
  });
});
