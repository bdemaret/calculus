import { evaluateStrict, fitsTiles, formatExpression, numbersOf, parseExpression, type ExprNode } from "../expression";
import { OPERATION_SYMBOL } from "../generator";
import { ALL_OPERATIONS } from "../levels";
import { createRng, randInt, type Rng } from "../rng";
import type { Difficulty, OpTag, Operation, Puzzle, Question } from "../types";
import type { GameDefinition } from "./types";

export type BombPuzzle = Extract<Puzzle, { game: "bomb" }>;

export interface BombLevel {
  /** Plaques à un chiffre (1 à 9). */
  digits: number;
  /** Plaques à deux chiffres, tirées entre `numberMin` et `numberMax`. */
  numbers: number;
  numberMin: number;
  numberMax: number;
  /** Plaques à utiliser au minimum dans une bombe. */
  minTiles: number;
  /** Résultat maximal d'une bombe. */
  maxResult: number;
  defaultOperations: Operation[];
  parentheses: boolean;
  /** Temps de désamorçage par défaut, en secondes. */
  defaultTime: number;
}

export const BOMB_LEVELS: Record<Difficulty, BombLevel> = {
  1: { digits: 4, numbers: 0, numberMin: 10, numberMax: 10, minTiles: 2, maxResult: 100, defaultOperations: ["add", "sub"], parentheses: false, defaultTime: 15 },
  2: { digits: 5, numbers: 0, numberMin: 10, numberMax: 10, minTiles: 3, maxResult: 200, defaultOperations: ["add", "sub", "mul"], parentheses: false, defaultTime: 15 },
  3: { digits: 4, numbers: 1, numberMin: 10, numberMax: 25, minTiles: 3, maxResult: 500, defaultOperations: [...ALL_OPERATIONS], parentheses: false, defaultTime: 20 },
  4: { digits: 4, numbers: 2, numberMin: 10, numberMax: 50, minTiles: 4, maxResult: 2000, defaultOperations: [...ALL_OPERATIONS], parentheses: true, defaultTime: 25 },
  5: { digits: 3, numbers: 3, numberMin: 10, numberMax: 99, minTiles: 4, maxResult: 20000, defaultOperations: [...ALL_OPERATIONS], parentheses: true, defaultTime: 30 },
};

/** Pourquoi une bombe est refusée (affiché pendant la construction). */
export type BombError = "syntax" | "tiles" | "min-tiles" | "operations" | "parentheses" | "invalid" | "too-big";

const opsOf = (node: ExprNode): Operation[] => (node.kind === "num" ? [] : [node.op, ...opsOf(node.left), ...opsOf(node.right)]);

/**
 * Valeur d'une bombe, ou la règle qu'elle enfreint : plaques du tirage au plus une fois chacune,
 * au moins `minTiles` plaques, opérations et parenthèses permises, résultat entier entre 0 et `maxResult`.
 */
export function bombValue(puzzle: BombPuzzle, expr: string): { value: number; text: string } | { error: BombError } {
  const tree = parseExpression(expr);
  if (!tree) return { error: "syntax" };
  const numbers = numbersOf(tree);
  if (!fitsTiles(numbers, puzzle.tiles)) return { error: "tiles" };
  if (numbers.length < puzzle.minTiles) return { error: "min-tiles" };
  if (opsOf(tree).some((op) => !puzzle.operations.includes(op))) return { error: "operations" };
  if (!puzzle.parentheses && expr.includes("(")) return { error: "parentheses" };
  const value = evaluateStrict(tree);
  if (Number.isNaN(value)) return { error: "invalid" };
  if (value > puzzle.maxResult) return { error: "too-big" };
  // Écrite proprement, avec le minimum de parenthèses (sans changer la valeur).
  return { value, text: formatExpression(tree) };
}

function shuffle<T>(rng: Rng, items: readonly T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = randInt(rng, 0, i);
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/**
 * Bombe de secours, pour un joueur qui n'a rien construit à temps : des plaques du tirage
 * enchaînées avec les opérations permises, sans parenthèses. Ne dépend que de la graine donnée.
 */
export function fallbackBomb(puzzle: BombPuzzle, seed: string): { expr: string; value: number } {
  const rng = createRng(`${seed}:secours`);
  for (let attempt = 0; attempt < 200; attempt++) {
    const tiles = shuffle(rng, puzzle.tiles).slice(0, puzzle.minTiles);
    const ops = tiles.slice(1).map(() => OPERATION_SYMBOL[puzzle.operations[randInt(rng, 0, puzzle.operations.length - 1)]!]);
    const expr = tiles.map((t, i) => (i === 0 ? String(t) : `${ops[i - 1]} ${t}`)).join(" ");
    const checked = bombValue(puzzle, expr);
    if ("value" in checked && checked.value > 0) return { expr: checked.text, value: checked.value };
  }
  // Dernier recours (opérations très restreintes) : la plus grande plaque seule.
  const max = Math.max(...puzzle.tiles);
  return { expr: String(max), value: max };
}

/**
 * Qui désamorce la bombe de qui : un cycle tiré au hasard parmi les joueurs, donc personne
 * ne reçoit sa propre bombe et chacun en reçoit exactement une. Renvoie auteur → désamorceur.
 */
export function assignBombs(playerIds: readonly string[], seed: string): Record<string, string> {
  const order = shuffle(createRng(`${seed}:attribution`), playerIds);
  const out: Record<string, string> = {};
  order.forEach((author, i) => {
    if (order.length > 1) out[author] = order[(i + 1) % order.length]!;
  });
  return out;
}

/** Le calcul qu'un joueur doit désamorcer : la bombe d'un autre, comme un calcul standard. */
export function defuseQuestion(index: number, difficulty: Difficulty, text: string, value: number): Question {
  const tree = parseExpression(text);
  const tags = new Set<OpTag>(tree ? opsOf(tree) : []);
  if (text.includes("(")) tags.add("paren");
  return { index, text, answer: value, solution: String(value), puzzle: { game: "standard" }, tags: [...tags], difficulty };
}

function drawTiles(rng: Rng, cfg: BombLevel): number[] {
  const tiles: number[] = [];
  for (let i = 0; i < cfg.numbers; i++) tiles.push(randInt(rng, cfg.numberMin, cfg.numberMax));
  for (let i = 0; i < cfg.digits; i++) tiles.push(randInt(rng, 1, 9));
  return tiles;
}

/**
 * La bombe : tout le monde construit un calcul avec les mêmes plaques, puis désamorce
 * celui d'un autre joueur. En ligne seulement, en battle royale.
 */
export const bombGame: GameDefinition = {
  id: "bomb",
  modes: ["battle-royale"],
  solo: false,
  minPlayers: 2,
  turns: false,
  operationStats: true,
  timeRange: { min: 5, max: 60 },
  defaults: (d) => ({ operations: [...BOMB_LEVELS[d].defaultOperations], parentheses: BOMB_LEVELS[d].parentheses, timePerQuestion: BOMB_LEVELS[d].defaultTime }),
  answerKind: () => "number",
  /** Le tirage commun de la manche ; les calculs à désamorcer arrivent avec `GameEngine.closeBuild`. */
  generate(seed, index, settings) {
    const cfg = BOMB_LEVELS[settings.difficulty];
    const tiles = drawTiles(createRng(`${seed}:${index}`), cfg);
    const operations = settings.operations.length > 0 ? settings.operations : cfg.defaultOperations;
    const puzzle: BombPuzzle = { game: "bomb", tiles, operations, minTiles: cfg.minTiles, maxResult: cfg.maxResult, parentheses: settings.parentheses };
    return { index, text: tiles.join(" "), answer: 0, solution: "", puzzle, tags: [], difficulty: settings.difficulty };
  },
  check: (q, answer) => "value" in answer && answer.value === q.answer,
  resolveExtras(engine, round) {
    // L'auteur d'une bombe qui explose marque un point (pas pour une bombe de secours).
    for (const [defuserId, { authorId }] of Object.entries(round.personal ?? {})) {
      const defuser = engine.player(defuserId);
      const answer = round.answers.find((a) => a.playerId === defuserId);
      if (!defuser || !answer || answer.correct || round.bombs?.[authorId]?.fallback) continue;
      const author = engine.player(authorId);
      if (!author) continue;
      author.score += 1;
      round.scorers.push(authorId);
    }
  },
};
