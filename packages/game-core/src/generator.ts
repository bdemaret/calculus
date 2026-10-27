import { DEFAULT_POWER } from "./limits";
import { LEVELS, isBasicOperation, type LevelConfig } from "./levels";
import { createRng, pick, randInt, type Rng } from "./rng";
import type { BasicOperation, Difficulty, GameSettings, Operation, OpTag, Question } from "./types";

/** Symboles affichés des quatre opérations de base (signe moins et multiplication Unicode). */
export type OpSymbol = "+" | "−" | "×" | "÷";
/**
 * Jeton d'un calcul : nombre, opérateur, parenthèse, puissance (« ^ » suivi de l'exposant,
 * affiché en exposant : « 7² ») ou racine carrée (« √ » devant un nombre : « √49 »).
 */
export type CalcToken = number | OpSymbol | "^" | "√" | "(" | ")";
type Token = CalcToken;

/** Symbole affiché de chaque opération de base. */
export const OPERATION_SYMBOL: Record<BasicOperation, OpSymbol> = { add: "+", sub: "−", mul: "×", div: "÷" };
const SYMBOL = OPERATION_SYMBOL;
/** Opération de chaque symbole affiché. */
export const SYMBOL_OPERATION: Record<OpSymbol, BasicOperation> = { "+": "add", "−": "sub", "×": "mul", "÷": "div" };
const TAG: Record<OpSymbol | "^" | "√", Operation> = { ...SYMBOL_OPERATION, "^": "pow", "√": "sqrt" };

/** Chiffres en exposant, pour écrire une puissance : « 2¹⁰ ». */
const SUPERSCRIPT_DIGITS = "⁰¹²³⁴⁵⁶⁷⁸⁹";
const toSuperscript = (n: number) => [...String(n)].map((d) => SUPERSCRIPT_DIGITS[Number(d)]).join("");
const fromSuperscript = (s: string) => Number([...s].map((c) => SUPERSCRIPT_DIGITS.indexOf(c)).join(""));

interface Built {
  tokens: Token[];
  value: number;
}

/* ------------------------------------------------------------------ */
/* Évaluation : recalcule le résultat à partir de l'énoncé, pour        */
/* garantir que la réponse attendue correspond exactement au texte.     */
/* ------------------------------------------------------------------ */

type Operator = OpSymbol | "^" | "√";
const PREC: Record<Operator, number> = { "+": 1, "−": 1, "×": 2, "÷": 2, "√": 3, "^": 4 };

/** Racine carrée entière, NaN si le nombre n'est pas un carré parfait. */
function exactSqrt(n: number): number {
  if (n < 0) return Number.NaN;
  const r = Math.round(Math.sqrt(n));
  return r * r === n ? r : Number.NaN;
}

function apply(op: OpSymbol | "^", a: number, b: number): number {
  switch (op) {
    case "^": {
      const r = a ** b;
      return Number.isSafeInteger(r) ? r : Number.NaN;
    }
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

/**
 * Évalue une suite de jetons en respectant les priorités. Renvoie NaN si invalide.
 * `nonNegative` : NaN aussi dès qu'un résultat intermédiaire passe sous zéro.
 */
export function evaluateTokens(tokens: readonly Token[], nonNegative = false): number {
  const values: number[] = [];
  const ops: (Operator | "(")[] = [];
  const reduce = () => {
    const op = ops.pop() as Operator;
    const b = values.pop();
    // La racine carrée ne prend qu'un nombre, celui qui la suit.
    const a = op === "√" ? 0 : values.pop();
    if (a === undefined || b === undefined) {
      values.push(Number.NaN);
      return;
    }
    const r = op === "√" ? exactSqrt(b) : apply(op, a, b);
    values.push(nonNegative && r < 0 ? Number.NaN : r);
  };
  for (const t of tokens) {
    if (typeof t === "number") values.push(t);
    else if (t === "(" || t === "√") ops.push(t);
    else if (t === ")") {
      while (ops.length && ops[ops.length - 1] !== "(") reduce();
      ops.pop();
    } else {
      while (ops.length) {
        const top = ops[ops.length - 1];
        if (top === "(" || PREC[top as Operator] < PREC[t]) break;
        reduce();
      }
      ops.push(t);
    }
  }
  while (ops.length) reduce();
  return values.length === 1 ? (values[0] as number) : Number.NaN;
}

/** Transforme un énoncé texte (« (7 + 5) × 3 », « 7² + √49 ») en jetons. Accepte aussi - * / x ^. */
export function tokenize(text: string): Token[] {
  const out: Token[] = [];
  const re = /\s*(\d+|[⁰¹²³⁴⁵⁶⁷⁸⁹]+|[()+\-−×x*÷/^√])/gy;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const s = m[1] as string;
    if (/^\d+$/.test(s)) out.push(Number(s));
    else if (SUPERSCRIPT_DIGITS.includes(s[0]!)) out.push("^", fromSuperscript(s));
    else if (s === "(" || s === ")" || s === "^" || s === "√") out.push(s);
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

/** Écrit une suite de jetons comme on l'affiche : « (7 + 5) × 3 », « 7² + √49 ». */
export function renderTokens(tokens: readonly (Token | "?")[]): string {
  let out = "";
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]!;
    if (t === "^") {
      // L'exposant s'écrit collé, en petits chiffres.
      const e = tokens[++i];
      out += typeof e === "number" ? toSuperscript(e) : `^${e ?? ""}`;
      continue;
    }
    const prev = tokens[i - 1];
    const glued = out === "" || prev === "(" || prev === "√" || t === ")";
    out += (glued ? "" : " ") + String(t);
  }
  return out;
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
function buildFlat(rng: Rng, cfg: LevelConfig, ops: BasicOperation[], nTerms: number): Built | null {
  const chosen: BasicOperation[] = Array.from({ length: nTerms - 1 }, () => pick(rng, ops));

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
function canUseParentheses(ops: BasicOperation[]): boolean {
  const hasSum = ops.includes("add") || ops.includes("sub");
  return hasSum && (ops.includes("mul") || ops.includes("div") || ops.includes("sub"));
}

/** Calcul avec parenthèses, ex. « (14 + 9) × 4 », « 96 ÷ (5 + 3) » inversé, « 50 − (12 + 7) ». */
function buildParen(rng: Rng, cfg: LevelConfig, ops: BasicOperation[], nTerms: number): Built | null {
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

/* ------------------------------------------------------------------ */
/* Puissance et racine carrée                                           */
/* ------------------------------------------------------------------ */

type Special = "pow" | "sqrt";

/** Une puissance « b^e » : exposant entre 2 et `powerMax`, valeur au plus `cfg.powMax`. */
function buildPower(rng: Rng, cfg: LevelConfig, powerMax: number): Built {
  const exponents: number[] = [];
  for (let e = 2; e <= powerMax && 2 ** e <= cfg.powMax; e++) exponents.push(e);
  const e = pick(rng, exponents);
  let maxBase = 2;
  while ((maxBase + 1) ** e <= cfg.powMax) maxBase += 1;
  const b = randInt(rng, 2, maxBase);
  return { tokens: [b, "^", e], value: b ** e };
}

/** Une racine carrée parfaite « √(r²) », de valeur r (ou `value` quand c'est possible, pour garder le calcul juste). */
function buildRoot(rng: Rng, cfg: LevelConfig, value?: number): Built {
  const r = value !== undefined && value >= 2 && value <= cfg.sqrtMax ? value : randInt(rng, 2, cfg.sqrtMax);
  return { tokens: ["√", r * r], value: r };
}

/** Positions des nombres d'un calcul qu'on peut remplacer (pas les exposants). */
function leafPositions(tokens: readonly Token[]): number[] {
  return tokens.flatMap((t, i) => (typeof t === "number" && tokens[i - 1] !== "^" ? [i] : []));
}

/**
 * Remplace un nombre du calcul par une puissance ou une racine. Une racine garde la valeur du nombre
 * quand elle le peut ; sinon la valeur change et le calcul est réévalué (NaN s'il ne tombe plus juste).
 */
function withSpecial(rng: Rng, cfg: LevelConfig, built: Built, special: Special, powerMax: number): Built {
  const leaves = leafPositions(built.tokens);
  const kept = special === "sqrt" ? leaves.filter((i) => (built.tokens[i] as number) >= 2 && (built.tokens[i] as number) <= cfg.sqrtMax) : [];
  const at = pick(rng, kept.length > 0 ? kept : leaves);
  const term = special === "pow" ? buildPower(rng, cfg, powerMax) : buildRoot(rng, cfg, built.tokens[at] as number);
  const tokens = [...built.tokens.slice(0, at), ...term.tokens, ...built.tokens.slice(at + 1)];
  return { tokens, value: evaluateTokens(tokens, true) };
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
  /** Plus grand exposant d'une puissance (2 par défaut). */
  powerMax?: number;
}

/** Génère un calcul avec un générateur aléatoire donné. */
export function generateWithRng(rng: Rng, opts: GenerateOptions, index = 0): Question {
  const cfg = LEVELS[opts.difficulty];
  const ops = opts.operations.length > 0 ? opts.operations : cfg.defaultOperations;
  const parenChance = cfg.level >= 4 ? 0.6 : 0.4;
  const powerMax = opts.powerMax ?? DEFAULT_POWER;
  // Le calcul est construit avec les opérations de base ; une puissance ou une racine vient ensuite remplacer un nombre.
  const basic = ops.filter(isBasicOperation);
  const specials = ops.filter((o): o is Special => !isBasicOperation(o));

  // Chaque opération choisie a la même chance d'apparaître : la puissance ou la racine sert dans une part des calculs.
  // Tirée une fois pour toutes, pour que les essais ratés ne favorisent pas la plus facile à placer.
  const special = specials.length > 0 && (basic.length === 0 || rng() < specials.length / ops.length) ? pick(rng, specials) : null;

  for (let attempt = 0; attempt < 400; attempt++) {
    const nTerms = pick(rng, cfg.terms);
    let built: Built | null;
    if (basic.length === 0) {
      // Seulement la puissance et / ou la racine : un calcul d'un seul terme, « 13² », « √144 ».
      built = special === "pow" ? buildPower(rng, cfg, powerMax) : buildRoot(rng, cfg);
    } else {
      const useParen = opts.parentheses && canUseParentheses(basic) && rng() < parenChance;
      built = useParen ? buildParen(rng, cfg, basic, Math.max(3, nTerms)) : buildFlat(rng, cfg, basic, nTerms);
      if (built && special) built = withSpecial(rng, cfg, built, special, powerMax);
    }
    if (!built) continue;
    // Jamais de résultat intermédiaire négatif (« 5 − 9 + 20 »).
    const checked = evaluateTokens(built.tokens, true);
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
export function generateQuestion(
  seed: string,
  index: number,
  settings: Pick<GameSettings, "difficulty" | "operations" | "parentheses"> & Partial<Pick<GameSettings, "powerMax">>,
): Question {
  return generateWithRng(createRng(`${seed}:${index}`), settings, index);
}
