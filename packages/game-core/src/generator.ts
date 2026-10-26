import { LEVELS, type LevelConfig } from "./levels";
import { createRng, pick, randInt, type Rng } from "./rng";
import type { Difficulty, GameSettings, Operation, OpTag, Question } from "./types";

/** Symboles affichés (signe moins et multiplication Unicode). */
export type OpSymbol = "+" | "−" | "×" | "÷";
/** Jeton d'un calcul : nombre, opérateur ou parenthèse. */
export type CalcToken = number | OpSymbol | "(" | ")";
type Token = CalcToken;

/** Symbole affiché de chaque opération. */
export const OPERATION_SYMBOL: Record<Operation, OpSymbol> = { add: "+", sub: "−", mul: "×", div: "÷" };
const SYMBOL = OPERATION_SYMBOL;
/** Opération de chaque symbole affiché. */
export const SYMBOL_OPERATION: Record<OpSymbol, Operation> = { "+": "add", "−": "sub", "×": "mul", "÷": "div" };
const TAG = SYMBOL_OPERATION;

interface Built {
  tokens: Token[];
  value: number;
}

/* ------------------------------------------------------------------ */
/* Évaluation : recalcule le résultat à partir de l'énoncé, pour        */
/* garantir que la réponse attendue correspond exactement au texte.     */
/* ------------------------------------------------------------------ */

const PREC: Record<OpSymbol, number> = { "+": 1, "−": 1, "×": 2, "÷": 2 };

function apply(op: OpSymbol, a: number, b: number): number {
  switch (op) {
    case "+":
      return a + b;
    case "−":
      return a - b;
    case "×":
      return a * b;
    case "÷":
      if (b === 0 || a % b !== 0) return Number.NaN; // division non entière : invalide
      return a / b;
  }
}

/** Évalue une suite de jetons en respectant les priorités. Renvoie NaN si invalide. */
export function evaluateTokens(tokens: Token[]): number {
  const values: number[] = [];
  const ops: (OpSymbol | "(")[] = [];
  const reduce = () => {
    const op = ops.pop() as OpSymbol;
    const b = values.pop();
    const a = values.pop();
    if (a === undefined || b === undefined) {
      values.push(Number.NaN);
      return;
    }
    values.push(apply(op, a, b));
  };
  for (const t of tokens) {
    if (typeof t === "number") values.push(t);
    else if (t === "(") ops.push(t);
    else if (t === ")") {
      while (ops.length && ops[ops.length - 1] !== "(") reduce();
      ops.pop();
    } else {
      while (ops.length) {
        const top = ops[ops.length - 1];
        if (top === "(" || PREC[top as OpSymbol] < PREC[t]) break;
        reduce();
      }
      ops.push(t);
    }
  }
  while (ops.length) reduce();
  return values.length === 1 ? (values[0] as number) : Number.NaN;
}

/** Transforme un énoncé texte (« (7 + 5) × 3 ») en jetons. Accepte aussi - * / x. */
export function tokenize(text: string): Token[] {
  const out: Token[] = [];
  const re = /\s*(\d+|[()+\-−×x*÷/])/gy;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const s = m[1] as string;
    if (/^\d+$/.test(s)) out.push(Number(s));
    else if (s === "(" || s === ")") out.push(s);
    else if (s === "+") out.push("+");
    else if (s === "-" || s === "−") out.push("−");
    else if (s === "×" || s === "x" || s === "*") out.push("×");
    else out.push("÷");
  }
  return out;
}

export function evaluateText(text: string): number {
  return evaluateTokens(tokenize(text));
}

/** Écrit une suite de jetons comme on l'affiche : « (7 + 5) × 3 ». */
export function renderTokens(tokens: readonly (Token | "?")[]): string {
  return tokens
    .map(String)
    .join(" ")
    .replace(/\( /g, "(")
    .replace(/ \)/g, ")");
}

/* ------------------------------------------------------------------ */
/* Construction                                                          */
/* ------------------------------------------------------------------ */

/** Diviseurs de n compris entre min et max. */
function divisorsBetween(n: number, min: number, max: number): number[] {
  const out: number[] = [];
  for (let d = min; d <= Math.min(max, n); d++) if (n % d === 0) out.push(d);
  return out;
}

/**
 * Une chaîne de facteurs (ex. « 6 × 7 », « 96 ÷ 8 », « 4 × 6 ÷ 3 »).
 * Les divisions sont toujours exactes par construction.
 */
function buildFactorChain(rng: Rng, cfg: LevelConfig, chain: ("mul" | "div")[]): Built | null {
  if (chain.length === 0) {
    const n = randInt(rng, cfg.addMin, cfg.addMax);
    return { tokens: [n], value: n };
  }
  const tokens: Token[] = [];
  let value: number;
  const first = chain[0];
  if (first === "mul") {
    const a = randInt(rng, 2, cfg.mulMax);
    const b = randInt(rng, 2, Math.min(cfg.mulMax, 12));
    tokens.push(a, "×", b);
    value = a * b;
  } else {
    const q = randInt(rng, 2, cfg.divMax);
    const d = randInt(rng, 2, cfg.divMax);
    tokens.push(q * d, "÷", d);
    value = q;
  }
  for (const op of chain.slice(1)) {
    if (op === "mul") {
      const f = randInt(rng, 2, 9);
      tokens.push("×", f);
      value *= f;
    } else {
      const ds = divisorsBetween(value, 2, cfg.divMax);
      if (ds.length === 0) return null;
      const d = pick(rng, ds);
      tokens.push("÷", d);
      value /= d;
    }
  }
  return { tokens, value };
}

/** Calcul sans parenthèses à n termes, ex. « 125 × 8 − 36 ÷ 4 ». */
function buildFlat(rng: Rng, cfg: LevelConfig, ops: Operation[], nTerms: number): Built | null {
  const chosen: Operation[] = Array.from({ length: nTerms - 1 }, () => pick(rng, ops));

  // Découpe en « termes » séparés par + et −, chacun étant une chaîne de × et ÷.
  const groups: { joiner: "add" | "sub" | null; chain: ("mul" | "div")[] }[] = [{ joiner: null, chain: [] }];
  for (const op of chosen) {
    if (op === "add" || op === "sub") groups.push({ joiner: op, chain: [] });
    else groups[groups.length - 1]!.chain.push(op);
  }

  const tokens: Token[] = [];
  let total = 0;
  for (const g of groups) {
    if (g.joiner === "sub" && g.chain.length === 0) {
      // Soustraction d'un simple nombre : on le choisit pour ne jamais passer sous zéro.
      if (total < 1) return null;
      const n = randInt(rng, Math.min(cfg.addMin, total), Math.min(cfg.addMax, total));
      tokens.push("−", n);
      total -= n;
      continue;
    }
    const term = buildFactorChain(rng, cfg, g.chain);
    if (!term) return null;
    if (g.joiner === "sub") {
      if (term.value > total) return null;
      tokens.push("−", ...term.tokens);
      total -= term.value;
    } else {
      if (g.joiner === "add") tokens.push("+");
      tokens.push(...term.tokens);
      total += term.value;
    }
  }
  return { tokens, value: total };
}

/** Peut-on faire un calcul où les parenthèses changent vraiment le résultat ? */
function canUseParentheses(ops: Operation[]): boolean {
  const hasSum = ops.includes("add") || ops.includes("sub");
  return hasSum && (ops.includes("mul") || ops.includes("div") || ops.includes("sub"));
}

/** Calcul avec parenthèses, ex. « (14 + 9) × 4 », « 96 ÷ (5 + 3) » inversé, « 50 − (12 + 7) ». */
function buildParen(rng: Rng, cfg: LevelConfig, ops: Operation[], nTerms: number): Built | null {
  const innerOps = ops.filter((o): o is "add" | "sub" => o === "add" || o === "sub");
  const outerOps = ops.filter((o) => o === "mul" || o === "div" || o === "sub");
  if (innerOps.length === 0 || outerOps.length === 0) return null;
  const inner = pick(rng, innerOps);
  const outer = pick(rng, outerOps);
  const innerMax = cfg.level <= 3 ? 20 : 40;

  const innerPair = (target?: number): [number, number] | null => {
    if (target === undefined) {
      const a = randInt(rng, 2, innerMax);
      const b = randInt(rng, 1, innerMax);
      if (inner === "add") return [a, b];
      return a > b ? [a, b] : b > a ? [b, a] : null;
    }
    if (inner === "add") {
      if (target < 2) return null;
      const a = randInt(rng, 1, target - 1);
      return [a, target - a];
    }
    const b = randInt(rng, 1, innerMax);
    return [target + b, b];
  };

  let tokens: Token[];
  let value: number;
  if (outer === "mul") {
    const pair = innerPair();
    if (!pair) return null;
    const s = inner === "add" ? pair[0] + pair[1] : pair[0] - pair[1];
    const f = randInt(rng, 2, 9);
    const group: Token[] = ["(", pair[0], SYMBOL[inner], pair[1], ")"];
    tokens = rng() < 0.5 ? [...group, "×", f] : [f, "×", ...group];
    value = s * f;
  } else if (outer === "div") {
    const d = randInt(rng, 2, Math.min(cfg.divMax, 10));
    const q = randInt(rng, 2, 12);
    const pair = innerPair(q * d);
    if (!pair) return null;
    tokens = ["(", pair[0], SYMBOL[inner], pair[1], ")", "÷", d];
    value = q;
  } else {
    const pair = innerPair();
    if (!pair) return null;
    const s = inner === "add" ? pair[0] + pair[1] : pair[0] - pair[1];
    if (s < 1) return null;
    const c = randInt(rng, s + 1, s + cfg.addMax);
    tokens = [c, "−", "(", pair[0], SYMBOL[inner], pair[1], ")"];
    value = c - s;
  }

  // Niveau 5 : un terme de plus, ex. « (14 + 9) × 4 − 17 ».
  if (nTerms >= 4) {
    const op = pick(rng, innerOps);
    if (op === "add") {
      const n = randInt(rng, 1, cfg.addMax);
      tokens.push("+", n);
      value += n;
    } else {
      if (value < 2) return null;
      const n = randInt(rng, 1, Math.min(cfg.addMax, value - 1));
      tokens.push("−", n);
      value -= n;
    }
  }
  return { tokens, value };
}

function tagsOf(tokens: Token[]): OpTag[] {
  const tags = new Set<OpTag>();
  for (const t of tokens) {
    if (t === "(") tags.add("paren");
    else if (typeof t === "string" && t !== ")") tags.add(TAG[t]);
  }
  return [...tags];
}

export interface GenerateOptions {
  difficulty: Difficulty;
  operations: Operation[];
  parentheses: boolean;
}

/** Génère un calcul avec un générateur aléatoire donné. */
export function generateWithRng(rng: Rng, opts: GenerateOptions, index = 0): Question {
  const cfg = LEVELS[opts.difficulty];
  const ops = opts.operations.length > 0 ? opts.operations : cfg.defaultOperations;
  const parenChance = cfg.level >= 4 ? 0.6 : 0.4;

  for (let attempt = 0; attempt < 400; attempt++) {
    const nTerms = pick(rng, cfg.terms);
    const useParen = opts.parentheses && canUseParentheses(ops) && rng() < parenChance;
    const built = useParen ? buildParen(rng, cfg, ops, Math.max(3, nTerms)) : buildFlat(rng, cfg, ops, nTerms);
    if (!built) continue;
    const checked = evaluateTokens(built.tokens);
    if (!Number.isInteger(checked) || checked !== built.value) continue;
    // Un résultat nul (« 7 − 7 ») est trop facile : on le refuse.
    if (checked <= 0 || checked > cfg.maxResult) continue;
    return {
      index,
      text: renderTokens(built.tokens),
      answer: checked,
      solution: String(checked),
      puzzle: { game: "standard" },
      tags: tagsOf(built.tokens),
      difficulty: cfg.level,
    };
  }
  // Filet de sécurité (ne devrait jamais servir).
  const a = randInt(rng, 1, cfg.addMax);
  const b = randInt(rng, 1, cfg.addMax);
  return { index, text: `${a} + ${b}`, answer: a + b, solution: String(a + b), puzzle: { game: "standard" }, tags: ["add"], difficulty: cfg.level };
}

/**
 * Calcul numéro `index` d'une partie. Ne dépend que de la graine et de l'index :
 * le serveur et le navigateur obtiennent exactement le même calcul.
 */
export function generateQuestion(seed: string, index: number, settings: Pick<GameSettings, "difficulty" | "operations" | "parentheses">): Question {
  return generateWithRng(createRng(`${seed}:${index}`), settings, index);
}
