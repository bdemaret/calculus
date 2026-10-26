import { OPERATION_SYMBOL, evaluateTokens, generateWithRng, renderTokens, tokenize, type CalcToken, type OpSymbol } from "../generator";
import { ALL_OPERATIONS, LEVELS } from "../levels";
import { MAX_TIME, MIN_TIME } from "../limits";
import { createRng, pick, randInt } from "../rng";
import type { Puzzle, Question } from "../types";
import type { GameDefinition } from "./types";

type MissingPuzzle = Extract<Puzzle, { game: "missing" }>;
type MissingToken = MissingPuzzle["tokens"][number];

/** En « l'un ou l'autre », part des égalités où c'est un opérateur qui manque. */
const OPERATOR_CHANCE = 1 / 3;
/**
 * Écart autour du nombre caché dans lequel on vérifie qu'aucune autre valeur ne convient.
 * Avec un seul trou, le membre de gauche varie toujours dans le même sens avec ce nombre,
 * sauf s'il est multiplié par zéro : il devient alors constant, ce qu'on voit tout de suite
 * à côté du nombre caché (à un diviseur près, toujours ≤ 25).
 */
const UNIQUE_WINDOW = 30;
/** Essais avant de se rabattre sur une égalité simple (ne devrait jamais servir). */
const MAX_ATTEMPTS = 60;

/** Remplace le trou par une valeur. */
function fill(tokens: readonly MissingToken[], value: number | OpSymbol): CalcToken[] {
  return tokens.map((t) => (t === "?" ? value : t));
}

const holds = (tokens: readonly MissingToken[], value: number | OpSymbol, result: number) => evaluateTokens(fill(tokens, value)) === result;

/** Seule la valeur cachée rend l'égalité vraie (sinon la réponse serait ambiguë). */
function isUnique(tokens: readonly MissingToken[], hidden: number | OpSymbol, result: number): boolean {
  if (typeof hidden !== "number") {
    return ALL_OPERATIONS.filter((op) => holds(tokens, OPERATION_SYMBOL[op], result)).length === 1;
  }
  for (let v = Math.max(0, hidden - UNIQUE_WINDOW); v <= hidden + UNIQUE_WINDOW; v++) {
    if (v !== hidden && holds(tokens, v, result)) return false;
  }
  return hidden <= UNIQUE_WINDOW || !holds(tokens, 0, result);
}

function question(index: number, base: Question, tokens: MissingToken[], hidden: number | OpSymbol): Question {
  const hole = typeof hidden === "number" ? "number" : "operator";
  return {
    index,
    text: `${renderTokens(tokens)} = ${base.answer}`,
    // Un opérateur n'est pas un nombre : la valeur attendue reste alors le résultat de l'égalité.
    answer: typeof hidden === "number" ? hidden : base.answer,
    solution: String(hidden),
    puzzle: { game: "missing", hole, tokens, result: base.answer },
    tags: [...base.tags, hole === "number" ? "hole-num" : "hole-op"],
    difficulty: base.difficulty,
  };
}

/** Nombre manquant : une égalité complète où il manque un nombre ou un opérateur. */
export const missingGame: GameDefinition = {
  id: "missing",
  modes: ["battle-royale", "speed-race"],
  solo: true,
  minPlayers: 1,
  turns: true,
  operationStats: true,
  timeRange: { min: MIN_TIME, max: MAX_TIME },
  defaults: (d) => ({ operations: [...LEVELS[d].defaultOperations], parentheses: LEVELS[d].defaultParentheses, timePerQuestion: LEVELS[d].defaultTime }),
  answerKind: (q) => (q.puzzle.game === "missing" && q.puzzle.hole === "operator" ? "op" : "number"),
  generate(seed, index, settings) {
    const rng = createRng(`${seed}:${index}`);
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      // Même calcul que le jeu standard (niveaux, opérations, parenthèses), dont on cache un morceau.
      const base = generateWithRng(rng, settings, index);
      const tokens: MissingToken[] = tokenize(base.text);
      const wantOperator = settings.missingKind === "operator" || (settings.missingKind === "mixed" && rng() < OPERATOR_CHANCE);
      const positions = tokens.flatMap((t, i) => ((wantOperator ? typeof t === "string" && t !== "(" && t !== ")" : typeof t === "number") ? [i] : []));
      if (positions.length === 0) continue;
      const pos = pick(rng, positions);
      const hidden = tokens[pos] as number | OpSymbol;
      tokens[pos] = "?";
      if (!isUnique(tokens, hidden, base.answer)) continue;
      return question(index, base, tokens, hidden);
    }
    // Filet de sécurité : « a + ? = a + b » n'a qu'une solution.
    const a = randInt(rng, 1, 10);
    const b = randInt(rng, 1, 10);
    const base: Question = { index, text: `${a} + ${b}`, answer: a + b, solution: String(a + b), puzzle: { game: "standard" }, tags: ["add"], difficulty: settings.difficulty };
    return question(index, base, [a, "+", "?"], b);
  },
  check(q, answer) {
    if (q.puzzle.game !== "missing") return false;
    const { tokens, result, hole } = q.puzzle;
    if (hole === "operator") return "op" in answer && holds(tokens, OPERATION_SYMBOL[answer.op], result);
    return "value" in answer && holds(tokens, answer.value, result);
  },
};
