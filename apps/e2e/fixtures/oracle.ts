import type { Locator, Page } from "@playwright/test";
import { evaluateText } from "@calculus/game-core";

/** Le calcul affiché sur la ligne de cahier. */
export const calcText = (page: Page): Locator => page.getByTestId("calc-text");

/**
 * La bonne réponse au calcul affiché, recalculée avec le même évaluateur que le jeu.
 * Le test n'a donc besoin d'aucune fuite côté serveur pour répondre juste.
 */
export async function expectedAnswer(page: Page): Promise<{ text: string; answer: number }> {
  const text = (await calcText(page).textContent())?.trim() ?? "";
  const answer = evaluateText(text);
  if (!Number.isInteger(answer)) throw new Error(`Calcul illisible : « ${text} »`);
  return { text, answer };
}
