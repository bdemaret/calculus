"use client";
import type { ReactNode } from "react";
import { renderTokens, tokenize, type CalcToken, type OpSymbol } from "@calculus/game-core";
import { useSession } from "@/lib/auth-client";

/** Jeton d'un énoncé, « ? » pour la case d'un nombre manquant. */
type Tok = CalcToken | "?";

/** Arbre d'un calcul : `paren` garde les parenthèses écrites dans l'énoncé. */
type Node =
  | { k: "num"; v: number }
  | { k: "hole" }
  | { k: "op"; op: OpSymbol; l: Node; r: Node; paren: boolean }
  | { k: "pow"; base: Node; exp: number }
  | { k: "sqrt"; arg: Node };

/** Vrai quand le joueur connecté a choisi d'afficher les divisions en fraction. */
export function useFractions(): boolean {
  const { data: session } = useSession();
  return session?.user.divisionDisplay === "fraction";
}

/**
 * Arbre d'un calcul à afficher en fraction, ou null s'il n'a pas de division
 * ou ne se lit pas (un « ? » à la place d'un opérateur, par exemple).
 */
export function fractionTree(tokens: readonly Tok[]): Node | null {
  if (!tokens.includes("÷")) return null;
  let i = 0;
  // Descente récursive : expr = terme (± terme)*, terme = facteur (×÷ facteur)*, facteur = [√] atome [^ exposant].
  const atom = (): Node | null => {
    const t = tokens[i++];
    if (typeof t === "number") return { k: "num", v: t };
    if (t === "?") return { k: "hole" };
    if (t !== "(") return null;
    const inner = expr();
    if (!inner || tokens[i++] !== ")") return null;
    return inner.k === "op" ? { ...inner, paren: true } : inner;
  };
  const power = (): Node | null => {
    const base = atom();
    if (!base || tokens[i] !== "^") return base;
    const exp = tokens[i + 1];
    i += 2;
    return typeof exp === "number" ? { k: "pow", base, exp } : null;
  };
  const factor = (): Node | null => {
    if (tokens[i] !== "√") return power();
    i += 1;
    const arg = power();
    return arg ? { k: "sqrt", arg } : null;
  };
  const chain = (next: () => Node | null, ops: OpSymbol[]): Node | null => {
    let l = next();
    while (l && ops.includes(tokens[i] as OpSymbol)) {
      const op = tokens[i++] as OpSymbol;
      const r = next();
      l = r ? { k: "op", op, l, r, paren: false } : null;
    }
    return l;
  };
  const term = () => chain(factor, ["×", "÷"]);
  const expr = (): Node | null => chain(term, ["+", "−"]);
  const tree = expr();
  return tree && i === tokens.length ? tree : null;
}

/** Affiche un arbre : chaque division devient une barre de fraction, `hole` remplit le « ? ». */
export function FractionExpr({ node, hole }: { node: Node; hole?: ReactNode }) {
  return <>{render(node, hole, false)}</>;
}

/** `bare` : la barre de fraction regroupe déjà, les parenthèses de l'énoncé deviennent inutiles. */
function render(node: Node, hole: ReactNode, bare: boolean): ReactNode {
  if (node.k === "num") return node.v;
  if (node.k === "hole") return hole;
  // Sous une racine ou à la base d'une puissance, les parenthèses de l'énoncé restent : « √(16 + 9) », « (7 + 3)² ».
  if (node.k === "pow") return <>{render(node.base, hole, false)}{renderTokens(["^", node.exp])}</>;
  if (node.k === "sqrt") return <>√{render(node.arg, hole, false)}</>;
  if (node.op === "÷")
    return (
      <span className="frac">
        <span className="frac-num">{render(node.l, hole, true)}</span>
        <span className="frac-den">{render(node.r, hole, true)}</span>
      </span>
    );
  const inner = (
    <>
      {render(node.l, hole, false)} {node.op} {render(node.r, hole, false)}
    </>
  );
  return node.paren && !bare ? <>({inner})</> : inner;
}

/** Un énoncé écrit selon la préférence du joueur ; tout texte qui n'est pas un calcul reste tel quel. */
export function MathText({ text }: { text: string }) {
  const fractions = useFractions();
  if (!fractions) return <>{text}</>;
  const tokens = tokenize(text);
  // Le texte doit être entièrement un calcul (pas un tirage du bon compte, par exemple).
  const tree = renderTokens(tokens) === text.trim() ? fractionTree(tokens) : null;
  return tree ? <FractionExpr node={tree} /> : <>{text}</>;
}
