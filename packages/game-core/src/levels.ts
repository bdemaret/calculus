import type { Difficulty, Operation } from "./types";

export interface LevelConfig {
  level: Difficulty;
  /** Plus petit et plus grand nombre pour les additions et soustractions. */
  addMin: number;
  addMax: number;
  /** Plus grand facteur pour les multiplications. */
  mulMax: number;
  /** Plus grand diviseur (et plus grand quotient) pour les divisions. */
  divMax: number;
  /** Nombres de termes possibles dans un calcul sans parenthèses. */
  terms: number[];
  defaultOperations: Operation[];
  defaultParentheses: boolean;
  /** Temps par défaut, en secondes. */
  defaultTime: number;
  /** Résultat maximal accepté. */
  maxResult: number;
}

export const LEVELS: Record<Difficulty, LevelConfig> = {
  1: {
    level: 1,
    addMin: 1,
    addMax: 10,
    mulMax: 5,
    divMax: 5,
    terms: [2],
    defaultOperations: ["add", "sub"],
    defaultParentheses: false,
    defaultTime: 10,
    maxResult: 100,
  },
  2: {
    level: 2,
    addMin: 5,
    addMax: 50,
    mulMax: 10,
    divMax: 10,
    terms: [2],
    defaultOperations: ["add", "sub", "mul"],
    defaultParentheses: false,
    defaultTime: 10,
    maxResult: 200,
  },
  3: {
    level: 3,
    addMin: 10,
    addMax: 100,
    mulMax: 12,
    divMax: 12,
    terms: [2],
    defaultOperations: ["add", "sub", "mul", "div"],
    defaultParentheses: false,
    defaultTime: 12,
    maxResult: 500,
  },
  4: {
    level: 4,
    addMin: 10,
    addMax: 200,
    mulMax: 12,
    divMax: 12,
    terms: [3],
    defaultOperations: ["add", "sub", "mul", "div"],
    defaultParentheses: true,
    defaultTime: 15,
    maxResult: 2000,
  },
  5: {
    level: 5,
    addMin: 50,
    addMax: 999,
    mulMax: 25,
    divMax: 15,
    terms: [3, 4],
    defaultOperations: ["add", "sub", "mul", "div"],
    defaultParentheses: true,
    defaultTime: 20,
    maxResult: 20000,
  },
};

export const DIFFICULTIES: Difficulty[] = [1, 2, 3, 4, 5];
export const ALL_OPERATIONS: Operation[] = ["add", "sub", "mul", "div"];
