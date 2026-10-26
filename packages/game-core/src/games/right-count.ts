import { evaluateStrict, numbersOf, parseExpression } from "../expression";
import { ALL_OPERATIONS } from "../levels";
import { createRng, randInt, type Rng } from "../rng";
import { solveTiles } from "../solver";
import type { Difficulty, Operation, Puzzle, Question } from "../types";
import type { GameDefinition } from "./types";

type RightCountPuzzle = Extract<Puzzle, { game: "right-count" }>;

export interface RightCountLevel {
  /** Petites plaques, tirées entre 1 et `smallMax` (doublons possibles). */
  small: number;
  smallMax: number;
  /** Grandes plaques, tirées sans remise parmi 25, 50, 75, 100. */
  large: number;
  targetMin: number;
  targetMax: number;
  defaultOperations: Operation[];
  /** Temps par défaut, en secondes. */
  defaultTime: number;
}

export const RIGHT_COUNT_LEVELS: Record<Difficulty, RightCountLevel> = {
  1: { small: 4, smallMax: 10, large: 0, targetMin: 10, targetMax: 50, defaultOperations: ["add", "sub"], defaultTime: 45 },
  2: { small: 5, smallMax: 10, large: 0, targetMin: 20, targetMax: 100, defaultOperations: ["add", "sub", "mul"], defaultTime: 60 },
  3: { small: 5, smallMax: 10, large: 1, targetMin: 100, targetMax: 300, defaultOperations: [...ALL_OPERATIONS], defaultTime: 75 },
  4: { small: 4, smallMax: 10, large: 2, targetMin: 100, targetMax: 999, defaultOperations: [...ALL_OPERATIONS], defaultTime: 90 },
  5: { small: 4, smallMax: 10, large: 2, targetMin: 101, targetMax: 999, defaultOperations: [...ALL_OPERATIONS], defaultTime: 90 },
};

const LARGE_TILES = [25, 50, 75, 100];
/** Tirages essayés avec la plage de cibles du niveau, puis avec une plage élargie. */
const ATTEMPTS = 30;
/** Les valeurs intermédiaires du solveur sont bornées à ce multiple de la cible maximale. */
const INTERMEDIATE_FACTOR = 10;

function drawTiles(rng: Rng, cfg: RightCountLevel): number[] {
  const large = [...LARGE_TILES];
  const tiles: number[] = [];
  for (let i = 0; i < cfg.large; i++) tiles.push(large.splice(randInt(rng, 0, large.length - 1), 1)[0]!);
  for (let i = 0; i < cfg.small; i++) tiles.push(randInt(rng, 1, cfg.smallMax));
  return tiles;
}

/** Un tirage toujours résoluble avec une seule opération, en utilisant toutes les plaques. */
function fallback(rng: Rng, count: number, op: Operation): { tiles: number[]; target: number; solution: string } {
  const small = Array.from({ length: count - 1 }, () => randInt(rng, 2, 5));
  const product = small.reduce((p, x) => p * x, 1);
  const sum = small.reduce((p, x) => p + x, 0);
  const sym = { add: "+", sub: "−", mul: "×", div: "÷" }[op];
  // Première plaque choisie pour que l'enchaînement tombe juste : a + b + …, a − b − … > 0, a × b × …, a ÷ b ÷ … entier.
  const k = randInt(rng, 2, 9);
  const first = op === "sub" ? sum + k : op === "div" ? product * k : randInt(rng, 2, 9);
  const tiles = [first, ...small];
  const target = op === "add" ? first + sum : op === "sub" ? k : op === "mul" ? first * product : k;
  return { tiles, target, solution: tiles.join(` ${sym} `) };
}

function question(index: number, difficulty: Difficulty, tiles: number[], target: number, solution: string, operations: Operation[]): Question {
  const puzzle: RightCountPuzzle = { game: "right-count", tiles, target, operations };
  return { index, text: `${tiles.join(" ")} → ${target}`, answer: target, solution, puzzle, tags: [], difficulty };
}

/** Les nombres écrits sont-ils exactement les plaques, chacune une fois ? */
export function usesAllTiles(numbers: readonly number[], tiles: readonly number[]): boolean {
  const a = [...numbers].sort((x, y) => x - y);
  const b = [...tiles].sort((x, y) => x - y);
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

/**
 * Évalue une expression aux règles du bon compte : toutes les plaques, chacune exactement une fois,
 * seulement les opérations permises. Null si elle est invalide pour ce tirage.
 */
export function evaluateRightCount(puzzle: RightCountPuzzle, expr: string): number | null {
  const tree = parseExpression(expr);
  if (!tree || !usesAllTiles(numbersOf(tree), puzzle.tiles)) return null;
  const value = evaluateStrict(tree, puzzle.operations);
  return Number.isNaN(value) ? null : value;
}

/** Le bon compte : atteindre la cible en utilisant toutes les plaques, chacune exactement une fois. */
export const rightCountGame: GameDefinition = {
  id: "right-count",
  modes: ["battle-royale", "speed-race"],
  solo: true,
  minPlayers: 1,
  operationStats: false,
  timeRange: { min: 20, max: 180 },
  defaults: (d) => ({ operations: [...RIGHT_COUNT_LEVELS[d].defaultOperations], parentheses: true, timePerQuestion: RIGHT_COUNT_LEVELS[d].defaultTime }),
  answerKind: () => "expr",
  generate(seed, index, settings) {
    const cfg = RIGHT_COUNT_LEVELS[settings.difficulty];
    const ops = settings.operations.length > 0 ? settings.operations : cfg.defaultOperations;
    const rng = createRng(`${seed}:${index}`);
    for (let attempt = 0; attempt < 2 * ATTEMPTS; attempt++) {
      const tiles = drawTiles(rng, cfg);
      const solved = solveTiles(tiles, ops, cfg.targetMax * INTERMEDIATE_FACTOR);
      // Avec certaines opérations seulement, la plage du niveau peut être hors d'atteinte : on l'élargit.
      const [min, max] = attempt < ATTEMPTS ? [cfg.targetMin, cfg.targetMax] : [1, cfg.targetMax * INTERMEDIATE_FACTOR];
      const candidates = solved.values.filter((v) => v >= min && v <= max);
      if (candidates.length === 0) continue;
      const target = candidates[randInt(rng, 0, candidates.length - 1)]!;
      return question(index, settings.difficulty, tiles, target, solved.solution(target)!, ops);
    }
    // Filet de sécurité : des plaques construites pour la première opération permise.
    const { tiles, target, solution } = fallback(rng, cfg.small + cfg.large, ops[0]!);
    return question(index, settings.difficulty, tiles, target, solution, ops);
  },
  // Une expression mal formée, qui oublie ou invente une plaque, est refusée sans consommer l'essai.
  isValid: (q, answer) => q.puzzle.game === "right-count" && "expr" in answer && evaluateRightCount(q.puzzle, answer.expr) !== null,
  check: (q, answer) => q.puzzle.game === "right-count" && "expr" in answer && evaluateRightCount(q.puzzle, answer.expr) === q.puzzle.target,
};
