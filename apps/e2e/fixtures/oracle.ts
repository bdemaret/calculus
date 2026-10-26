import type { Locator, Page } from "@playwright/test";
import { ALL_OPERATIONS, OPERATION_SYMBOL, evaluateText } from "@calculus/game-core";

/** Le calcul affiché sur la ligne de cahier. */
export const calcText = (page: Page): Locator => page.getByTestId("calc-text");

/** Plus grand nombre essayé pour un nombre manquant. */
const MAX_MISSING = 25_000;

/**
 * La bonne réponse d'un énoncé (« 7 + 4 » ou, pour un nombre manquant, « 23 + ? = 41 » / « 12 ? 4 = 3 »),
 * recalculée avec le même évaluateur que le jeu, et une réponse sûrement fausse.
 */
export function solveText(text: string): { answer: string; wrong: string } {
  if (!text.includes("?")) {
    const answer = evaluateText(text);
    if (!Number.isInteger(answer)) throw new Error(`Calcul illisible : « ${text} »`);
    return { answer: String(answer), wrong: String(answer + 1) };
  }
  const [left, right] = text.split(" = ");
  const holds = (x: string) => evaluateText(left!.replace("?", x)) === Number(right);
  // Le jeu garantit une seule réponse : toute autre valeur est fausse.
  const symbols = ALL_OPERATIONS.map((op) => OPERATION_SYMBOL[op]);
  // Entre deux termes, c'est un opérateur qui manque ; sinon un nombre.
  if (/[\d)]\s*\?\s*[\d(]/.test(left!)) {
    const op = symbols.find(holds);
    if (!op) throw new Error(`Opérateur manquant introuvable : « ${text} »`);
    return { answer: op, wrong: symbols.find((s) => s !== op)! };
  }
  for (let v = 0; v <= MAX_MISSING; v++) if (holds(String(v))) return { answer: String(v), wrong: String(v + 1) };
  throw new Error(`Nombre manquant introuvable : « ${text} »`);
}

/**
 * La bonne réponse au calcul affiché (et une fausse), sans aucune fuite côté serveur.
 * L'énoncé complet est dans `data-calc` (la case réponse peut être au milieu de l'égalité).
 */
export async function expectedAnswer(page: Page): Promise<{ text: string; answer: string; wrong: string }> {
  const text = ((await calcText(page).getAttribute("data-calc")) ?? (await calcText(page).textContent()) ?? "").trim();
  return { text, ...solveText(text) };
}
