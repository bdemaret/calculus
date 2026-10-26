import { OPERATION_SYMBOL, operatorOfSymbol, type AnswerKind, type GameId, type PlayerAnswer, type Puzzle } from "@calculus/game-core";

/** Forme de la réponse attendue pour un calcul affiché (le jeu le décide calcul par calcul). */
export function answerKindOfPuzzle(puzzle: Puzzle | undefined): AnswerKind {
  return puzzle?.game === "missing" && puzzle.hole === "operator" ? "op" : "number";
}

/** Nettoie une saisie : des chiffres, ou le dernier opérateur tapé (affiché avec son symbole). */
export function cleanInput(raw: string, kind: AnswerKind, maxDigits: number): string {
  if (kind !== "op") return raw.replace(/\D/g, "").slice(0, maxDigits);
  const op = operatorOfSymbol(raw.trim().slice(-1));
  return op ? OPERATION_SYMBOL[op] : "";
}

/** La réponse à envoyer pour une saisie, null si elle est vide. */
export function answerFromInput(value: string, kind: AnswerKind): PlayerAnswer | null {
  if (value === "") return null;
  if (kind === "op") {
    const op = operatorOfSymbol(value);
    return op ? { op } : null;
  }
  return { value: Number(value) };
}

/** Une réponse enregistrée, telle qu'on l'affiche (nombre, ou expression / symbole). */
export const shownAnswer = (a: { value: number | null; text?: string | null }): string => (a.value ?? a.text ?? "").toString();

/**
 * Entre un énoncé et sa solution : « 7 + 4 = 11 » pour un calcul, « 23 + ? = 41 → 18 »
 * quand l'énoncé contient déjà son signe égal.
 */
export const revealSeparator = (game: GameId): string => (game === "standard" ? "=" : "→");
