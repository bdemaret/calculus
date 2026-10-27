/**
 * Techniques de calcul mental : reconnaître un calcul qui s'y prête, l'expliquer
 * pas à pas, et générer des calculs d'entraînement (déterministes, comme le reste).
 */
import { renderTokens, tagsOf } from "../generator";
import { createRng } from "../rng";
import type { Difficulty, Question } from "../types";
import { DETECTION_ORDER, TECHNIQUES } from "./catalog";
import { nodesOf, parseCalc, tokensOf, type CalcNode } from "./tree";
import { TECHNIQUE_IDS, type TechniqueDefinition, type TechniqueHint, type TechniqueId } from "./types";

export { TECHNIQUES, DETECTION_ORDER } from "./catalog";
export { parseCalc, type CalcNode } from "./tree";
export * from "./types";

export const isTechniqueId = (value: unknown): value is TechniqueId => (TECHNIQUE_IDS as readonly unknown[]).includes(value);

/** Les techniques présentées à un niveau, dans l'ordre d'affichage. */
export function techniquesOfLevel(level: Difficulty): TechniqueDefinition[] {
  return TECHNIQUE_IDS.map((id) => TECHNIQUES[id]).filter((t) => t.level === level);
}

function hintAt(def: TechniqueDefinition, node: CalcNode): TechniqueHint | null {
  const explained = def.explain(node);
  if (!explained) return null;
  return { technique: def.id, target: renderTokens(tokensOf(node)), result: node.value, ...explained };
}

/** Comment la technique `id` s'applique à un morceau de ce calcul, ou null si elle ne s'y applique pas. */
export function explainTechnique(id: TechniqueId, text: string): TechniqueHint | null {
  const root = parseCalc(text);
  if (!root) return null;
  for (const node of nodesOf(root)) {
    const hint = hintAt(TECHNIQUES[id], node);
    if (hint) return hint;
  }
  return null;
}

/**
 * La technique la plus utile pour ce calcul (au plus une), ou null. `text` est un énoncé complet,
 * sans « ? » ni « = » : pour un nombre manquant, remplir le trou avant.
 */
export function detectTechnique(text: string): TechniqueHint | null {
  const root = parseCalc(text);
  if (!root) return null;
  const nodes = nodesOf(root);
  for (const id of DETECTION_ORDER)
    for (const node of nodes) {
      const hint = hintAt(TECHNIQUES[id], node);
      if (hint) return hint;
    }
  return null;
}

/** Nombre d'essais avant de prendre l'exemple de la technique. */
const DRILL_ATTEMPTS = 50;

/**
 * Calcul d'entraînement numéro `index` pour une technique. Ne dépend que de `(id, seed, index)`,
 * et la technique est toujours celle que `detectTechnique` reconnaît dans le calcul.
 */
export function generateDrill(id: TechniqueId, seed: string, index: number): Question {
  const def = TECHNIQUES[id];
  const rng = createRng(`${seed}:${id}:${index}`);
  let tokens = def.example;
  for (let attempt = 0; attempt < DRILL_ATTEMPTS; attempt++) {
    const candidate = def.drill(rng);
    if (detectTechnique(renderTokens(candidate))?.technique === id) {
      tokens = candidate;
      break;
    }
  }
  const text = renderTokens(tokens);
  const answer = parseCalc(text)!.value;
  return { index, text, answer, solution: String(answer), puzzle: { game: "standard" }, tags: tagsOf(tokens), difficulty: def.level };
}
