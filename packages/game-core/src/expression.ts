/**
 * Expressions saisies par les joueurs (le bon compte, la bombe) : analyse stricte,
 * évaluation aux règles du jeu et vérification des plaques utilisées.
 * Rien n'est cru sur parole : une saisie mal formée est refusée, jamais « corrigée ».
 */
import type { Operation } from "./types";

/** Longueur maximale d'une expression, en caractères. */
export const MAX_EXPRESSION_LENGTH = 64;
/** Chiffres au plus dans un nombre saisi. */
const MAX_NUMBER_DIGITS = 6;

export type ExprNode = { kind: "num"; value: number } | { kind: "op"; op: Operation; left: ExprNode; right: ExprNode };

type ExprToken = number | Operation | "(" | ")";

/** Symboles acceptés à la saisie (clavier ou affichage). */
const OPERATOR_OF: Record<string, Operation> = {
  "+": "add",
  "-": "sub",
  "−": "sub",
  "×": "mul",
  x: "mul",
  X: "mul",
  "*": "mul",
  "÷": "div",
  "/": "div",
  ":": "div",
};

/** Opération d'un symbole saisi (« + », « - », « x », « ÷ »…), null si ce n'en est pas un. */
export function operatorOfSymbol(symbol: string): Operation | null {
  return OPERATOR_OF[symbol] ?? null;
}

function tokenizeStrict(text: string): ExprToken[] | null {
  const out: ExprToken[] = [];
  let i = 0;
  while (i < text.length) {
    const c = text[i]!;
    if (c === " ") {
      i += 1;
    } else if (c >= "0" && c <= "9") {
      let j = i;
      while (j < text.length && text[j]! >= "0" && text[j]! <= "9") j += 1;
      if (j - i > MAX_NUMBER_DIGITS) return null;
      out.push(Number(text.slice(i, j)));
      i = j;
    } else if (c === "(" || c === ")") {
      out.push(c);
      i += 1;
    } else if (c in OPERATOR_OF) {
      out.push(OPERATOR_OF[c]!);
      i += 1;
    } else {
      return null;
    }
  }
  return out;
}

/**
 * Analyse une expression (« (75 − 5) × 3 + 8 »). Renvoie null si elle est vide, trop longue,
 * mal formée ou contient autre chose que des nombres, `+ − × ÷` (ou `- * x / :`) et des parenthèses.
 * Pas de moins unaire : une plaque est toujours un nombre positif.
 */
export function parseExpression(text: string): ExprNode | null {
  if (text.length > MAX_EXPRESSION_LENGTH) return null;
  const tokens = tokenizeStrict(text);
  if (!tokens || tokens.length === 0) return null;
  let pos = 0;

  const parseSum = (): ExprNode | null => {
    let left = parseProduct();
    while (left && (tokens[pos] === "add" || tokens[pos] === "sub")) {
      const op = tokens[pos++] as Operation;
      const right = parseProduct();
      left = right ? { kind: "op", op, left, right } : null;
    }
    return left;
  };
  const parseProduct = (): ExprNode | null => {
    let left = parseFactor();
    while (left && (tokens[pos] === "mul" || tokens[pos] === "div")) {
      const op = tokens[pos++] as Operation;
      const right = parseFactor();
      left = right ? { kind: "op", op, left, right } : null;
    }
    return left;
  };
  const parseFactor = (): ExprNode | null => {
    const t = tokens[pos++];
    if (typeof t === "number") return { kind: "num", value: t };
    if (t !== "(") return null;
    const inner = parseSum();
    if (!inner || tokens[pos++] !== ")") return null;
    return inner;
  };

  const tree = parseSum();
  return tree && pos === tokens.length ? tree : null;
}

/**
 * Évalue un arbre aux règles du jeu : chaque résultat intermédiaire est un entier positif ou nul,
 * les divisions tombent juste, et seules les `operations` données sont permises (toutes par défaut).
 * Renvoie NaN si une règle n'est pas respectée.
 */
export function evaluateStrict(node: ExprNode, operations?: readonly Operation[]): number {
  if (node.kind === "num") return node.value;
  if (operations && !operations.includes(node.op)) return Number.NaN;
  const a = evaluateStrict(node.left, operations);
  const b = evaluateStrict(node.right, operations);
  if (Number.isNaN(a) || Number.isNaN(b)) return Number.NaN;
  let r: number;
  switch (node.op) {
    case "add":
      r = a + b;
      break;
    case "sub":
      r = a - b;
      break;
    case "mul":
      r = a * b;
      break;
    case "div":
      if (b === 0 || a % b !== 0) return Number.NaN;
      r = a / b;
      break;
  }
  return r >= 0 && Number.isSafeInteger(r) ? r : Number.NaN;
}

/** Nombres présents dans l'expression, de gauche à droite. */
export function numbersOf(node: ExprNode): number[] {
  return node.kind === "num" ? [node.value] : [...numbersOf(node.left), ...numbersOf(node.right)];
}

/** Les nombres utilisés sont-ils tous pris parmi les plaques, chacune au plus une fois ? */
export function fitsTiles(numbers: readonly number[], tiles: readonly number[]): boolean {
  const left = new Map<number, number>();
  for (const t of tiles) left.set(t, (left.get(t) ?? 0) + 1);
  for (const n of numbers) {
    const k = left.get(n) ?? 0;
    if (k === 0) return false;
    left.set(n, k - 1);
  }
  return true;
}

const SYMBOL_OF: Record<Operation, string> = { add: "+", sub: "−", mul: "×", div: "÷" };
const PRECEDENCE: Record<Operation, number> = { add: 1, sub: 1, mul: 2, div: 2 };

/**
 * Écrit un arbre avec les symboles affichés et le minimum de parenthèses :
 * « (75 − 3) × 6 − 20 ». Relire le texte avec `parseExpression` redonne la même valeur.
 */
export function formatExpression(node: ExprNode): string {
  if (node.kind === "num") return String(node.value);
  const p = PRECEDENCE[node.op];
  const side = (child: ExprNode, right: boolean) => {
    const text = formatExpression(child);
    if (child.kind === "num") return text;
    const cp = PRECEDENCE[child.op];
    // À droite d'un − ou d'un ÷, une opération de même priorité doit rester groupée.
    const needs = cp < p || (right && cp === p && (node.op === "sub" || node.op === "div"));
    return needs ? `(${text})` : text;
  };
  return `${side(node.left, false)} ${SYMBOL_OF[node.op]} ${side(node.right, true)}`;
}
