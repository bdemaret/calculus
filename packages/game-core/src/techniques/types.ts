import type { CalcToken } from "../generator";
import type { Rng } from "../rng";
import type { Difficulty, Operation } from "../types";
import type { CalcNode } from "./tree";

/** Les techniques de calcul mental, dans l'ordre d'affichage (par niveau). */
export const TECHNIQUE_IDS = [
  // Niveau 1
  "complement-10",
  "plus-minus-9",
  "near-doubles",
  // Niveau 2
  "complement-100",
  "compensation-sub",
  "mul-by-5",
  "mul-by-9",
  "mul-by-11",
  // Niveau 3
  "distributivity",
  "mul-by-25",
  "div-by-5",
  "square-ending-5",
  "div-by-steps",
  // Niveau 4
  "regroup-factors",
  "diff-squares",
  "mul-by-99",
  "div-by-25",
  // Niveau 5
  "neighbor-square",
  "powers-of-2",
  "sqrt-bracketing",
  "mul-by-15",
] as const;

export type TechniqueId = (typeof TECHNIQUE_IDS)[number];

/** Une étape d'explication : un petit calcul et son résultat (« 48 × 10 », 480). */
export interface TechniqueStep {
  text: string;
  value: number;
}

/** Comment une technique résout un morceau précis d'un calcul. */
export interface TechniqueHint {
  technique: TechniqueId;
  /** Le morceau concerné, ex. « 48 × 5 ». */
  target: string;
  /** Sa valeur. */
  result: number;
  /** Nombres repris par les textes de l'explication (`techniques.<id>` dans les messages du site). */
  params: Record<string, number>;
  /** Les calculs intermédiaires, dans l'ordre. Le texte qui les relie vient des messages du site. */
  steps: TechniqueStep[];
}

export interface TechniqueDefinition {
  id: TechniqueId;
  /** Niveau à partir duquel la technique est présentée. */
  level: Difficulty;
  /** Opérations sur lesquelles elle porte. */
  operations: Operation[];
  /** L'explication si la technique s'applique à ce nœud (opérandes simples), sinon null. */
  explain(node: CalcNode): Pick<TechniqueHint, "params" | "steps"> | null;
  /** Un calcul d'entraînement (jetons), à reconnaître ensuite par `explain`. */
  drill(rng: Rng): CalcToken[];
  /** Exemple de la page des techniques, et filet de sécurité de l'entraînement. */
  example: CalcToken[];
}
