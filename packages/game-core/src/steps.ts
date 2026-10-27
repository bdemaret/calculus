/**
 * Saisie en étapes du bon compte : « 75 − 3;72 × 6;432 − 20 ». Chaque étape posée devient une
 * nouvelle plaque, utilisable dans les suivantes ; ce qui suit le dernier « ; » est la ligne en cours.
 * Le texte entier décrit l'état de la saisie (il est relayé tel quel aux spectateurs en « chacun son tour ») ;
 * seule l'expression complète (`complete.expr`) part au serveur, qui la revérifie comme toute réponse.
 */
import { MAX_EXPRESSION_LENGTH, evaluateStrict, formatExpression, parseExpression, type ExprNode } from "./expression";
import type { BasicOperation } from "./types";

export const STEP_SEPARATOR = ";";
/** Longueur maximale d'une saisie en étapes (six plaques : cinq étapes au plus, plus la ligne). */
export const MAX_STEPS_LENGTH = 6 * MAX_EXPRESSION_LENGTH;

/** Un nombre disponible : une plaque du tirage ou le résultat d'une étape. */
export interface StepTile {
  value: number;
  /** Étape qui l'a produit (à partir de 0), null pour une plaque du tirage. */
  step: number | null;
  /** Déjà pris dans la ligne en cours. */
  used: boolean;
}

export interface Step {
  /** L'opération posée, avec les nombres utilisés : « 75 − 3 ». */
  text: string;
  value: number;
}

export interface StepsState {
  steps: Step[];
  /** Nombres disponibles : les plaques du tirage pas encore utilisées, puis les résultats des étapes. */
  tiles: StepTile[];
  line: string;
  /** Valeur de la ligne en cours, null si elle est vide, incomplète ou hors des règles. */
  lineValue: number | null;
  /** La ligne est une opération valide : on peut la poser comme étape. */
  canCommit: boolean;
  /** Toutes les plaques du tirage sont utilisées : l'expression complète à envoyer, et sa valeur. */
  complete: { expr: string; value: number } | null;
}

interface PoolItem {
  node: ExprNode;
  value: number;
  step: number | null;
}

/** Remplace chaque nombre de l'arbre par le premier nombre disponible de même valeur ; null s'il en manque un. */
function bind(tree: ExprNode, pool: readonly PoolItem[]): { node: ExprNode; taken: Set<number> } | null {
  const taken = new Set<number>();
  const walk = (n: ExprNode): ExprNode | null => {
    if (n.kind === "num") {
      const i = pool.findIndex((p, k) => !taken.has(k) && p.value === n.value);
      if (i < 0) return null;
      taken.add(i);
      return pool[i]!.node;
    }
    const left = walk(n.left);
    const right = left && walk(n.right);
    return left && right ? { kind: "op", op: n.op, left, right } : null;
  };
  const node = walk(tree);
  return node ? { node, taken } : null;
}

const split = (input: string) => {
  const parts = input.split(STEP_SEPARATOR);
  return { committed: parts.slice(0, -1), line: parts[parts.length - 1]!.trimStart() };
};

/** Réécrit une saisie à partir de ses étapes et de la ligne en cours. */
export const encodeSteps = (steps: readonly string[], line: string): string =>
  steps.length > 0 ? `${steps.join(STEP_SEPARATOR)}${STEP_SEPARATOR}${line}` : line;

/** Lit une saisie en étapes. Une étape illisible ou hors des règles est ignorée, jamais « corrigée ». */
export function readSteps(tiles: readonly number[], operations: readonly BasicOperation[], input: string): StepsState {
  let pool: PoolItem[] = tiles.map((value) => ({ node: { kind: "num", value }, value, step: null }));
  const steps: Step[] = [];
  const { committed, line } = split(input);

  for (const part of committed) {
    const tree = parseExpression(part.trim());
    if (!tree || tree.kind === "num") continue;
    const bound = bind(tree, pool);
    const value = evaluateStrict(tree, operations);
    if (!bound || Number.isNaN(value)) continue;
    pool = [...pool.filter((_, i) => !bound.taken.has(i)), { node: bound.node, value, step: steps.length }];
    steps.push({ text: formatExpression(tree), value });
  }

  // Nombres déjà écrits dans la ligne, même incomplète : chacun prend le premier disponible de cette valeur.
  const used = pool.map(() => false);
  for (const m of line.match(/\d+/g) ?? []) {
    const i = pool.findIndex((p, k) => !used[k] && p.value === Number(m));
    if (i >= 0) used[i] = true;
  }

  const tree = line.trim() ? parseExpression(line.trim()) : null;
  const bound = tree && bind(tree, pool);
  const raw = tree && bound ? evaluateStrict(tree, operations) : Number.NaN;
  const lineValue = Number.isNaN(raw) ? null : raw;

  let complete: StepsState["complete"] = null;
  if (!tree && line.trim() === "" && pool.length === 1 && steps.length > 0) {
    complete = { expr: formatExpression(pool[0]!.node), value: pool[0]!.value };
  } else if (bound && lineValue !== null && bound.taken.size === pool.length) {
    complete = { expr: formatExpression(bound.node), value: lineValue };
  }

  return {
    steps,
    tiles: pool.map((p, i) => ({ value: p.value, step: p.step, used: used[i]! })),
    line,
    lineValue,
    canCommit: lineValue !== null && tree?.kind === "op",
    complete,
  };
}

/** Pose la ligne en cours comme étape (sans effet si elle n'est pas une opération valide). */
export function commitStep(state: StepsState): string {
  if (!state.canCommit) return encodeSteps(state.steps.map((s) => s.text), state.line);
  return encodeSteps([...state.steps.map((s) => s.text), formatExpression(parseExpression(state.line.trim())!)], "");
}

/** Retire le dernier jeton de la ligne ; ligne vide : rouvre la dernière étape pour la corriger. */
export function undoStep(state: StepsState): string {
  const texts = state.steps.map((s) => s.text);
  const line = state.line.trimEnd();
  if (line !== "") return encodeSteps(texts, line.replace(/(\d+|\S)$/, "").trimEnd());
  if (texts.length === 0) return "";
  return encodeSteps(texts.slice(0, -1), texts[texts.length - 1]!);
}
