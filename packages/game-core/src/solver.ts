/**
 * Solveur du bon compte : toutes les valeurs atteignables avec au moins une opération, chaque plaque
 * servant au plus une fois, aux règles du jeu (intermédiaires entiers positifs, divisions exactes).
 * Sert à choisir une cible toujours atteignable et à donner une solution de référence.
 */
import { formatExpression, type ExprNode } from "./expression";
import type { BasicOperation } from "./types";

/** Comment une valeur est obtenue dans un sous-ensemble de plaques (pour reconstruire une solution). */
type Witness = { tile: number } | { op: BasicOperation; left: [mask: number, value: number]; right: [mask: number, value: number] };

export interface Reachable {
  /** Valeurs atteignables avec au moins deux plaques, dans l'ordre croissant. */
  values: number[];
  /** Une solution lisible, avec le moins de plaques possible ; null si la valeur n'est pas atteignable. */
  solution(value: number): string | null;
}

const popcount = (n: number) => {
  let c = 0;
  for (let x = n; x; x &= x - 1) c++;
  return c;
};

/**
 * Programmation dynamique sur les sous-ensembles de plaques (6 plaques → 64 sous-ensembles) :
 * les valeurs d'un sous-ensemble viennent de ses découpages en deux moitiés.
 * Les valeurs au-delà de `maxValue` sont ignorées, ce qui borne le travail.
 */
export function solveTiles(tiles: readonly number[], operations: readonly BasicOperation[], maxValue: number): Reachable {
  const n = tiles.length;
  const full = (1 << n) - 1;
  const sets: Map<number, Witness>[] = Array.from({ length: full + 1 }, () => new Map());
  const ops = new Set(operations);

  // Par taille croissante : les deux moitiés d'un sous-ensemble sont toujours déjà calculées.
  const masks = Array.from({ length: full }, (_, i) => i + 1).sort((a, b) => popcount(a) - popcount(b) || a - b);
  for (const mask of masks) {
    const out = sets[mask]!;
    if (popcount(mask) === 1) {
      const tile = tiles[Math.log2(mask)]!;
      out.set(tile, { tile });
      continue;
    }
    // Chaque découpage en deux moitiés non vides, une seule fois (a contient le bit le plus bas).
    const low = mask & -mask;
    for (let a = (mask - 1) & mask; a > 0; a = (a - 1) & mask) {
      if (!(a & low)) continue;
      const b = mask ^ a;
      for (const x of sets[a]!.keys()) {
        for (const y of sets[b]!.keys()) {
          const add = (value: number, op: BasicOperation, l: number, lm: number, r: number, rm: number) => {
            if (value >= 0 && value <= maxValue && !out.has(value)) out.set(value, { op, left: [lm, l], right: [rm, r] });
          };
          if (ops.has("add")) add(x + y, "add", x, a, y, b);
          if (ops.has("sub")) {
            if (x >= y) add(x - y, "sub", x, a, y, b);
            else add(y - x, "sub", y, b, x, a);
          }
          if (ops.has("mul")) add(x * y, "mul", x, a, y, b);
          if (ops.has("div")) {
            if (y > 0 && x % y === 0) add(x / y, "div", x, a, y, b);
            else if (x > 0 && y % x === 0) add(y / x, "div", y, b, x, a);
          }
        }
      }
    }
  }

  const tree = (mask: number, value: number): ExprNode => {
    const w = sets[mask]!.get(value)!;
    if ("tile" in w) return { kind: "num", value: w.tile };
    return { kind: "op", op: w.op, left: tree(...w.left), right: tree(...w.right) };
  };
  // Pour chaque valeur, le plus petit sous-ensemble qui l'atteint (les masques sont triés par taille).
  const best = new Map<number, number>();
  for (const mask of masks) if (popcount(mask) > 1) for (const v of sets[mask]!.keys()) if (!best.has(v)) best.set(v, mask);
  return {
    values: [...best.keys()].sort((a, b) => a - b),
    solution: (value) => (best.has(value) ? formatExpression(tree(best.get(value)!, value)) : null),
  };
}
