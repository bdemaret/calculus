import { expect, type Locator, type Page } from "@playwright/test";
import { t } from "../fixtures/i18n";
import { expectedAnswer } from "../fixtures/oracle";

export type Move = "right" | "wrong" | "timeout";

/** La case réponse de la ligne de cahier. */
export const answerBox = (page: Page): Locator => page.getByRole("textbox", { name: t("game.yourAnswer") });

/**
 * Attend le calcul suivant, puis répond juste, faux ou laisse filer le temps.
 * Rend la main quand la case se verrouille, ou quand le rapport s'affiche après la dernière manche.
 */
export async function answerRound(page: Page, move: Move, touch = false): Promise<{ text: string; answer: number }> {
  const box = answerBox(page);
  await expect(box).toBeEnabled({ timeout: 20_000 });
  await expect(box).toHaveValue("");
  const q = await expectedAnswer(page);
  if (move !== "timeout") await type(page, String(move === "right" ? q.answer : q.answer + 1), touch);
  const closed = box.and(page.locator(":disabled")).or(page.getByTestId("report-verdict"));
  await expect(closed).toBeVisible({ timeout: move === "timeout" ? 70_000 : 5_000 });
  return q;
}

async function type(page: Page, value: string, touch: boolean) {
  const box = answerBox(page);
  if (!touch) {
    await box.fill(value);
    await box.press("Enter");
    return;
  }
  const keypad = page.locator(".keypad");
  for (const d of value) await keypad.getByRole("button", { name: d, exact: true }).click();
  await keypad.getByRole("button", { name: t("game.submit") }).click();
}
