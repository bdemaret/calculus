/**
 * Le catalogue des techniques : pour chacune, quand elle s'applique, les étapes chiffrées
 * qui l'expliquent, et un générateur de calculs pour s'y entraîner.
 * Une technique ne regarde qu'un morceau dont les opérandes sont des nombres écrits (« 48 × 5 »),
 * pour que le conseil désigne un morceau visible de l'énoncé.
 */
import { evaluateTokens, renderTokens, type CalcToken, type OpSymbol } from "../generator";
import { pick, randInt } from "../rng";
import type { CalcNode } from "./tree";
import type { TechniqueDefinition, TechniqueId, TechniqueStep } from "./types";

type Explained = ReturnType<TechniqueDefinition["explain"]>;

/** Une étape : le calcul écrit et sa valeur. */
const step = (...tokens: CalcToken[]): TechniqueStep => ({ text: renderTokens(tokens), value: evaluateTokens(tokens, true) });

/** Les deux opérandes d'une opération `op` quand ce sont des nombres écrits. */
function operands(node: CalcNode, op: OpSymbol | "^"): [number, number] | null {
  if (node.kind !== "op" || node.op !== op || node.left.kind !== "num" || node.right.kind !== "num") return null;
  return [node.left.value, node.right.value];
}

/** Le nombre élevé au carré : « n² » ou « n × n ». */
function squared(node: CalcNode): number | null {
  const pow = operands(node, "^");
  if (pow) return pow[1] === 2 ? pow[0] : null;
  const mul = operands(node, "×");
  return mul && mul[0] === mul[1] ? mul[0] : null;
}

/** Une multiplication par `factor` : renvoie l'autre facteur. */
function timesFactor(node: CalcNode, factor: number): number | null {
  const mul = operands(node, "×");
  if (!mul) return null;
  if (mul[1] === factor) return mul[0];
  return mul[0] === factor ? mul[1] : null;
}

/** Essaie les deux ordres d'une opération commutative. */
function eitherOrder([a, b]: [number, number], fn: (x: number, y: number) => Explained): Explained {
  return fn(a, b) ?? fn(b, a);
}

/** Les facteurs d'une suite de multiplications (« 25 × 7 × 4 »), si ce sont tous des nombres écrits. */
function factorsOf(node: CalcNode): number[] | null {
  if (node.kind === "num") return [node.value];
  if (node.kind !== "op" || node.op !== "×") return null;
  const left = factorsOf(node.left);
  const right = factorsOf(node.right);
  return left && right ? [...left, ...right] : null;
}

const smallestPrime = (n: number) => {
  for (let p = 2; p * p <= n; p++) if (n % p === 0) return p;
  return n;
};

/** Multiplication par un nombre « presque rond » ou facile : n × 10 puis une retouche. */
function nearRound(factor: number, min: number, finish: (n: number) => TechniqueStep[]): Pick<TechniqueDefinition, "explain"> {
  return {
    explain(node) {
      const n = timesFactor(node, factor);
      // Un multiple de 10 (9 × 40) se calcule sans astuce.
      if (n === null || n < min || n % 10 === 0) return null;
      return { params: { n }, steps: finish(n) };
    },
  };
}

const TECHNIQUE_LIST: TechniqueDefinition[] = [
  /* ---------------------------------------------------------------- */
  /* Niveau 1                                                          */
  /* ---------------------------------------------------------------- */
  {
    // 8 + 5 = 8 + 2 + 3 : on complète d'abord la dizaine.
    id: "complement-10",
    level: 1,
    operations: ["add"],
    explain(node) {
      const pair = operands(node, "+");
      if (!pair) return null;
      const [x, y] = pair[0] >= pair[1] ? pair : [pair[1], pair[0]];
      return eitherOrder([x, y], (a, b) => {
        const units = a % 10;
        if (b < 1 || b > 9 || units === 0 || units + b <= 10) return null;
        const c = 10 - units;
        const ten = a + c;
        return { params: { a, b, c, ten, rest: b - c }, steps: [step(a, "+", c), step(ten, "+", b - c)] };
      });
    },
    drill(rng) {
      const a = rng() < 0.4 ? 10 * randInt(rng, 1, 4) + randInt(rng, 6, 9) : randInt(rng, 6, 9);
      const b = randInt(rng, 11 - (a % 10), 9);
      return rng() < 0.5 ? [a, "+", b] : [b, "+", a];
    },
    example: [8, "+", 5],
  },
  {
    // 47 + 9 = 47 + 10 − 1 ; 63 − 19 = 63 − 20 + 1.
    id: "plus-minus-9",
    level: 1,
    operations: ["add", "sub"],
    explain(node) {
      const sum = operands(node, "+");
      if (sum)
        return eitherOrder(sum, (a, b) => {
          if (b % 10 !== 9 || b > 99 || a < 2) return null;
          const round = b + 1;
          return { params: { a, b, round, minus: 0 }, steps: [step(a, "+", round), step(a + round, "−", 1)] };
        });
      const diff = operands(node, "−");
      if (!diff) return null;
      const [a, b] = diff;
      if (b % 10 !== 9 || b > 99 || a <= b) return null;
      const round = b + 1;
      return { params: { a, b, round, minus: 1 }, steps: [step(a, "−", round), step(a - round, "+", 1)] };
    },
    drill(rng) {
      const b = pick(rng, [9, 9, 19, 29]);
      if (rng() < 0.5) {
        const a = randInt(rng, 3, 40);
        return rng() < 0.5 ? [a, "+", b] : [b, "+", a];
      }
      return [randInt(rng, b + 2, b + 40), "−", b];
    },
    example: [47, "+", 9],
  },
  {
    // 7 + 8 = 7 + 7 + 1 : un double qu'on connaît, puis l'écart.
    id: "near-doubles",
    level: 1,
    operations: ["add"],
    explain(node) {
      const pair = operands(node, "+");
      if (!pair) return null;
      const a = Math.min(...pair);
      const d = Math.max(...pair) - a;
      // Sous la dizaine, la somme se connaît par cœur.
      if (a < 4 || d < 1 || d > 2 || 2 * a + d <= 10) return null;
      return { params: { a, d, double: 2 * a }, steps: [step(a, "+", a), step(2 * a, "+", d)] };
    },
    drill(rng) {
      const a = rng() < 0.3 ? randInt(rng, 11, 25) : randInt(rng, 5, 9);
      const d = randInt(rng, 1, 2);
      return rng() < 0.5 ? [a, "+", a + d] : [a + d, "+", a];
    },
    example: [7, "+", 8],
  },

  /* ---------------------------------------------------------------- */
  /* Niveau 2                                                          */
  /* ---------------------------------------------------------------- */
  {
    // 100 − 37 : les dizaines vont à 9, les unités à 10 → 63.
    id: "complement-100",
    level: 2,
    operations: ["sub"],
    explain(node) {
      const diff = operands(node, "−");
      if (!diff) return null;
      const [a, b] = diff;
      if (a < 100 || a % 100 !== 0 || b <= 10 || b >= 100 || b % 10 === 0) return null;
      const tens = 9 - Math.floor(b / 10);
      const units = 10 - (b % 10);
      const complement = 100 - b;
      const steps = [step(9, "−", Math.floor(b / 10)), step(10, "−", b % 10), step(tens * 10, "+", units)];
      if (a > 100) steps.push(step(a - 100, "+", complement));
      return { params: { a, b, tens, units, complement, hundreds: a - 100 }, steps };
    },
    drill(rng) {
      let b = randInt(rng, 11, 99);
      if (b % 10 === 0) b += randInt(rng, 1, 9);
      return [100 * pick(rng, [1, 1, 2, 3, 5]), "−", b];
    },
    example: [100, "−", 37],
  },
  {
    // 73 − 28 = 75 − 30 : on ajoute la même chose aux deux nombres, l'écart ne change pas.
    id: "compensation-sub",
    level: 2,
    operations: ["sub"],
    explain(node) {
      const diff = operands(node, "−");
      if (!diff) return null;
      const [a, b] = diff;
      const u = b % 10;
      if (b <= 10 || u < 6 || u > 8 || a % 10 >= u || a <= b) return null;
      const c = 10 - u;
      return { params: { a, b, c, a2: a + c, b2: b + c }, steps: [step(a, "+", c), step(b, "+", c), step(a + c, "−", b + c)] };
    },
    drill(rng) {
      const b = 10 * randInt(rng, 1, 6) + pick(rng, [6, 7, 8]);
      return [b + randInt(rng, 5, 60), "−", b];
    },
    example: [73, "−", 28],
  },
  {
    // 48 × 5 = 48 × 10 ÷ 2.
    id: "mul-by-5",
    level: 2,
    operations: ["mul"],
    ...nearRound(5, 11, (n) => [step(n, "×", 10), step(n * 10, "÷", 2)]),
    drill: (rng) => (rng() < 0.5 ? [randInt(rng, 12, 68), "×", 5] : [5, "×", randInt(rng, 12, 68)]),
    example: [48, "×", 5],
  },
  {
    // 17 × 9 = 17 × 10 − 17.
    id: "mul-by-9",
    level: 2,
    operations: ["mul"],
    ...nearRound(9, 11, (n) => [step(n, "×", 10), step(n * 10, "−", n)]),
    drill: (rng) => (rng() < 0.5 ? [randInt(rng, 12, 40), "×", 9] : [9, "×", randInt(rng, 12, 40)]),
    example: [17, "×", 9],
  },
  {
    // 43 × 11 : on écarte 4 et 3 et on glisse leur somme au milieu → 473.
    id: "mul-by-11",
    level: 2,
    operations: ["mul"],
    explain(node) {
      const n = timesFactor(node, 11);
      if (n === null || n < 11 || n > 99 || n % 10 === 0) return null;
      const t = Math.floor(n / 10);
      const u = n % 10;
      const s = t + u;
      return { params: { n, t, u, s, carry: s >= 10 ? 1 : 0 }, steps: [step(t, "+", u), step(t * 100, "+", s * 10, "+", u)] };
    },
    drill: (rng) => (rng() < 0.5 ? [randInt(rng, 12, 99), "×", 11] : [11, "×", randInt(rng, 12, 99)]),
    example: [43, "×", 11],
  },

  /* ---------------------------------------------------------------- */
  /* Niveau 3                                                          */
  /* ---------------------------------------------------------------- */
  {
    // 14 × 12 = 14 × 10 + 14 × 2 : on découpe un facteur en dizaines et unités.
    id: "distributivity",
    level: 3,
    operations: ["mul"],
    explain(node) {
      const pair = operands(node, "×");
      if (!pair) return null;
      // Un produit rond (4 × 25) se connaît : rien à découper.
      const fits = (x: number, y: number) => x >= 13 && x <= 99 && x % 10 !== 0 && y >= 3 && y <= 99 && y % 10 !== 0 && (x * y) % 100 !== 0;
      // On découpe le facteur aux plus petites unités (14 × 12 : on découpe 12).
      const [p, q] = pair;
      const order: [number, number][] = p % 10 < q % 10 || (p % 10 === q % 10 && p >= q) ? [[p, q], [q, p]] : [[q, p], [p, q]];
      const found = order.find(([x, y]) => fits(x, y));
      if (!found) return null;
      const [x, y] = found;
      const units = x % 10;
      const tens = x - units;
      return {
        params: { x, y, tens, units },
        steps: [step(tens, "×", y), step(units, "×", y), step(tens * y, "+", units * y)],
      };
    },
    drill(rng) {
      let x = randInt(rng, 13, 49);
      if (x % 10 === 0) x += 3;
      const y = randInt(rng, 3, 12);
      return rng() < 0.5 ? [x, "×", y] : [y, "×", x];
    },
    example: [14, "×", 12],
  },
  {
    // 16 × 25 = 1600 ÷ 4.
    id: "mul-by-25",
    level: 3,
    operations: ["mul"],
    ...nearRound(25, 5, (n) => [step(n, "×", 100), step(n * 100, "÷", 4)]),
    drill: (rng) => (rng() < 0.5 ? [randInt(rng, 5, 40), "×", 25] : [25, "×", randInt(rng, 5, 40)]),
    example: [16, "×", 25],
  },
  {
    // 135 ÷ 5 = 270 ÷ 10.
    id: "div-by-5",
    level: 3,
    operations: ["div"],
    explain(node) {
      const div = operands(node, "÷");
      if (!div || div[1] !== 5 || div[0] < 30 || div[0] % 5 !== 0) return null;
      const a = div[0];
      return { params: { a, double: a * 2 }, steps: [step(a, "×", 2), step(a * 2, "÷", 10)] };
    },
    drill: (rng) => [5 * randInt(rng, 7, 60), "÷", 5],
    example: [135, "÷", 5],
  },
  {
    // 35² : 3 × 4 = 12, puis on écrit 25 → 1225.
    id: "square-ending-5",
    level: 3,
    operations: ["mul", "pow"],
    explain(node) {
      const n = squared(node);
      if (n === null || n < 15 || n > 95 || n % 10 !== 5) return null;
      const t = Math.floor(n / 10);
      const product = t * (t + 1);
      return { params: { n, t, next: t + 1, product }, steps: [step(t, "×", t + 1), step(product, "×", 100, "+", 25)] };
    },
    drill(rng) {
      const n = 10 * randInt(rng, 1, 9) + 5;
      return rng() < 0.5 ? [n, "^", 2] : [n, "×", n];
    },
    example: [35, "^", 2],
  },
  {
    // 168 ÷ 6 : 168 est pair, on divise par 2 puis par 3.
    id: "div-by-steps",
    level: 3,
    operations: ["div"],
    explain(node) {
      const div = operands(node, "÷");
      if (!div) return null;
      const [a, d] = div;
      const p = smallestPrime(d);
      const q = d / p;
      if (d < 4 || p === d || a % d !== 0 || a / d <= 10) return null;
      return { params: { a, d, p, q, half: a / p }, steps: [step(a, "÷", p), step(a / p, "÷", q)] };
    },
    drill(rng) {
      const d = pick(rng, [4, 6, 8, 9, 12, 14, 15, 16, 18]);
      return [d * randInt(rng, 11, 30), "÷", d];
    },
    example: [168, "÷", 6],
  },

  /* ---------------------------------------------------------------- */
  /* Niveau 4                                                          */
  /* ---------------------------------------------------------------- */
  {
    // 25 × 7 × 4 = (25 × 4) × 7 = 700 : on change l'ordre pour faire un nombre rond.
    id: "regroup-factors",
    level: 4,
    operations: ["mul"],
    explain(node) {
      const factors = factorsOf(node);
      if (!factors || factors.length < 3) return null;
      for (let i = 0; i < factors.length; i++)
        for (let j = i + 1; j < factors.length; j++) {
          // Les deux premiers facteurs se calculent déjà dans l'ordre : rien à regrouper.
          if (i === 0 && j === 1) continue;
          const x = factors[i]!;
          const y = factors[j]!;
          const round = x * y;
          if (round !== 10 && round !== 100 && round !== 1000) continue;
          const rest = factors.filter((_, k) => k !== i && k !== j);
          const restValue = rest.reduce((p, f) => p * f, 1);
          const steps = [step(x, "×", y)];
          if (rest.length > 1) steps.push(step(...rest.flatMap((f, k): CalcToken[] => (k === 0 ? [f] : ["×", f]))));
          steps.push(step(round, "×", restValue));
          return { params: { x, y, round, rest: restValue }, steps };
        }
      return null;
    },
    drill(rng) {
      const [x, y] = pick(rng, [[2, 5], [4, 25], [5, 20], [25, 4], [5, 2], [50, 2], [8, 125]] as const);
      const r = randInt(rng, 3, 19);
      return rng() < 0.5 ? [x, "×", r, "×", y] : [r, "×", x, "×", y];
    },
    example: [25, "×", 7, "×", 4],
  },
  {
    // 48 × 52 = 50² − 2² : deux nombres de part et d'autre d'un nombre rond.
    id: "diff-squares",
    level: 4,
    operations: ["mul"],
    explain(node) {
      const pair = operands(node, "×");
      if (!pair) return null;
      const [x, y] = pair;
      const m = (x + y) / 2;
      const d = Math.abs(x - y) / 2;
      if (!Number.isInteger(m) || m % 10 !== 0 || d < 1 || d > 9) return null;
      return { params: { x, y, m, d }, steps: [step(m, "×", m), step(d, "×", d), step(m * m, "−", d * d)] };
    },
    drill(rng) {
      const m = 10 * randInt(rng, 2, 9);
      const d = randInt(rng, 1, 5);
      return rng() < 0.5 ? [m - d, "×", m + d] : [m + d, "×", m - d];
    },
    example: [48, "×", 52],
  },
  {
    // 23 × 99 = 2300 − 23.
    id: "mul-by-99",
    level: 4,
    operations: ["mul"],
    ...nearRound(99, 2, (n) => [step(n, "×", 100), step(n * 100, "−", n)]),
    drill: (rng) => (rng() < 0.5 ? [randInt(rng, 3, 40), "×", 99] : [99, "×", randInt(rng, 3, 40)]),
    example: [23, "×", 99],
  },
  {
    // 475 ÷ 25 = 1900 ÷ 100 : il y a 4 fois 25 dans 100.
    id: "div-by-25",
    level: 4,
    operations: ["div"],
    explain(node) {
      const div = operands(node, "÷");
      if (!div || div[1] !== 25 || div[0] < 100 || div[0] % 25 !== 0) return null;
      const a = div[0];
      return { params: { a, quadruple: a * 4 }, steps: [step(a, "×", 4), step(a * 4, "÷", 100)] };
    },
    drill: (rng) => [25 * randInt(rng, 4, 40), "÷", 25],
    example: [475, "÷", 25],
  },

  /* ---------------------------------------------------------------- */
  /* Niveau 5                                                          */
  /* ---------------------------------------------------------------- */
  {
    // 31² = 30² + 2 × 30 + 1 ; 29² = 30² − (2 × 30 − 1).
    id: "neighbor-square",
    level: 5,
    operations: ["mul", "pow"],
    explain(node) {
      const n = squared(node);
      // Les carrés jusqu'à 15 se connaissent par cœur.
      if (n === null || n < 19 || n > 99 || (n % 10 !== 1 && n % 10 !== 9)) return null;
      const up = n % 10 === 1;
      const m = up ? n - 1 : n + 1;
      const gap = up ? 2 * m + 1 : 2 * m - 1;
      return {
        params: { n, m, square: m * m, gap, below: up ? 0 : 1 },
        steps: [step(m, "×", m), step(2, "×", m, up ? "+" : "−", 1), step(m * m, up ? "+" : "−", gap)],
      };
    },
    drill(rng) {
      const n = 10 * randInt(rng, 2, 9) + pick(rng, [1, 9]);
      return rng() < 0.5 ? [n, "^", 2] : [n, "×", n];
    },
    example: [31, "^", 2],
  },
  {
    // 2⁸ : on part d'un repère (2¹⁰ = 1024) et on divise par 2 deux fois.
    id: "powers-of-2",
    level: 5,
    operations: ["pow"],
    explain(node) {
      const pow = operands(node, "^");
      if (!pow || pow[0] !== 2 || pow[1] < 6 || pow[1] > 20) return null;
      const e = pow[1];
      const ref = e <= 7 ? 5 : 10;
      const steps = [step(2, "^", ref)];
      let value = 2 ** ref;
      for (let k = ref; k !== e; k += Math.sign(e - ref)) {
        const s = e > ref ? step(value, "×", 2) : step(value, "÷", 2);
        steps.push(s);
        value = s.value;
      }
      return { params: { e, ref, refValue: 2 ** ref, count: Math.abs(e - ref), down: e < ref ? 1 : 0 }, steps };
    },
    drill: (rng) => [2, "^", randInt(rng, 6, 12)],
    example: [2, "^", 8],
  },
  {
    // √576 : entre 20² = 400 et 30² = 900, finit par 6 → 24 ou 26 ; 25² = 625, donc 24.
    id: "sqrt-bracketing",
    level: 5,
    operations: ["sqrt"],
    explain(node) {
      if (node.kind !== "sqrt" || node.arg.kind !== "num") return null;
      const n = node.arg.value;
      const r = node.value;
      if (!Number.isInteger(r) || r < 16 || r > 99 || r % 10 === 0) return null;
      const low = r - (r % 10);
      const steps = [step(low, "×", low), step(low + 10, "×", low + 10)];
      // Deux racines possibles (sauf pour 5) : le carré du milieu tranche.
      if (r % 10 !== 5) steps.push(step(low + 5, "×", low + 5));
      steps.push(step(r, "×", r));
      const u = Math.min(r % 10, 10 - (r % 10));
      return {
        params: { n, root: r, low, high: low + 10, mid: low + 5, last: n % 10, cand1: low + u, cand2: low + 10 - u, single: u === 5 ? 1 : 0 },
        steps,
      };
    },
    drill(rng) {
      let r = randInt(rng, 16, 99);
      if (r % 10 === 0) r += randInt(rng, 1, 9);
      return ["√", r * r];
    },
    example: ["√", 576],
  },
  {
    // 18 × 15 = 180 + 90 : dix fois, plus la moitié.
    id: "mul-by-15",
    level: 5,
    operations: ["mul"],
    ...nearRound(15, 4, (n) => [step(n, "×", 10), step(n * 10, "÷", 2), step(n * 10, "+", n * 5)]),
    drill: (rng) => (rng() < 0.5 ? [randInt(rng, 4, 40), "×", 15] : [15, "×", randInt(rng, 4, 40)]),
    example: [18, "×", 15],
  },
];

export const TECHNIQUES = Object.fromEntries(TECHNIQUE_LIST.map((t) => [t.id, t])) as Record<TechniqueId, TechniqueDefinition>;

/**
 * Ordre de recherche d'un conseil : les techniques les plus précises d'abord
 * (35 × 35 est un carré qui finit par 5 avant d'être une multiplication à découper).
 */
export const DETECTION_ORDER: TechniqueId[] = [
  "square-ending-5",
  "neighbor-square",
  "sqrt-bracketing",
  "powers-of-2",
  "regroup-factors",
  "diff-squares",
  "mul-by-11",
  "mul-by-25",
  "mul-by-99",
  "mul-by-15",
  "mul-by-9",
  "mul-by-5",
  "div-by-25",
  "div-by-5",
  "div-by-steps",
  "distributivity",
  "complement-100",
  "plus-minus-9",
  "compensation-sub",
  "near-doubles",
  "complement-10",
];
