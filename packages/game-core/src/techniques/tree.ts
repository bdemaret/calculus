/**
 * Arbre d'un énoncé de calcul (« 48 × 5 + 17 », « √576 », « 35² »), pour chercher
 * les morceaux auxquels une technique de calcul s'applique.
 * Mêmes priorités que `evaluateTokens` : l'arbre se lit comme le calcul est évalué.
 */
import { evaluateTokens, tokenize, type CalcToken, type OpSymbol } from "../generator";

export type CalcNode =
  | { kind: "num"; value: number }
  | { kind: "op"; op: OpSymbol | "^"; left: CalcNode; right: CalcNode; value: number }
  | { kind: "sqrt"; arg: CalcNode; value: number };

type Operator = OpSymbol | "^" | "√";
const PREC: Record<Operator, number> = { "+": 1, "−": 1, "×": 2, "÷": 2, "√": 3, "^": 4 };

/** Caractères d'un énoncé complet : pas de « ? » ni de « = » (le nombre manquant se remplit avant). */
const CALC_CHARS = /^[\d\s()+\-−×x*÷/^√⁰¹²³⁴⁵⁶⁷⁸⁹]+$/;

/** Jetons d'un nœud, avec les parenthèses nécessaires. */
export function tokensOf(node: CalcNode): CalcToken[] {
  if (node.kind === "num") return [node.value];
  if (node.kind === "sqrt") return node.arg.kind === "num" ? ["√", node.arg.value] : ["√", "(", ...tokensOf(node.arg), ")"];
  const prec = PREC[node.op];
  const wrap = (child: CalcNode, right: boolean): CalcToken[] => {
    const inner = tokensOf(child);
    if (child.kind === "num") return inner;
    const childPrec = child.kind === "sqrt" ? PREC["√"] : PREC[child.op];
    // À droite d'un − ou d'un ÷ (ou d'une puissance), une opération de même rang garde ses parenthèses.
    const needs = childPrec < prec || (right && childPrec === prec && node.op !== "+" && node.op !== "×");
    return needs ? ["(", ...inner, ")"] : inner;
  };
  return [...wrap(node.left, false), node.op, ...wrap(node.right, true)];
}

function make(node: Omit<Extract<CalcNode, { kind: "op" }>, "value"> | Omit<Extract<CalcNode, { kind: "sqrt" }>, "value">): CalcNode {
  const partial = { ...node, value: 0 } as CalcNode;
  return { ...partial, value: evaluateTokens(tokensOf(partial), true) } as CalcNode;
}

/** Arbre d'un énoncé, ou null s'il est mal formé, incomplet ou ne tombe pas juste. */
export function parseCalc(text: string): CalcNode | null {
  if (!CALC_CHARS.test(text)) return null;
  const tokens = tokenize(text);
  const values: CalcNode[] = [];
  const ops: (Operator | "(")[] = [];
  let ok = true;
  const reduce = () => {
    const op = ops.pop() as Operator;
    if (op === "√") {
      const arg = values.pop();
      if (!arg) ok = false;
      else values.push(make({ kind: "sqrt", arg }));
      return;
    }
    const right = values.pop();
    const left = values.pop();
    if (!left || !right) ok = false;
    else values.push(make({ kind: "op", op, left, right }));
  };
  for (const t of tokens) {
    if (typeof t === "number") values.push({ kind: "num", value: t });
    else if (t === "(" || t === "√") ops.push(t);
    else if (t === ")") {
      while (ops.length && ops[ops.length - 1] !== "(") reduce();
      if (ops.pop() !== "(") return null;
    } else {
      while (ops.length) {
        const top = ops[ops.length - 1]!;
        if (top === "(" || PREC[top] < PREC[t]) break;
        reduce();
      }
      ops.push(t);
    }
  }
  while (ops.length) {
    if (ops[ops.length - 1] === "(") return null;
    reduce();
  }
  const root = values.length === 1 ? values[0]! : null;
  if (!ok || !root || !Number.isInteger(root.value) || root.value < 0) return null;
  return root;
}

/** Tous les nœuds, de la racine vers les feuilles. */
export function nodesOf(root: CalcNode): CalcNode[] {
  if (root.kind === "num") return [root];
  if (root.kind === "sqrt") return [root, ...nodesOf(root.arg)];
  return [root, ...nodesOf(root.left), ...nodesOf(root.right)];
}
