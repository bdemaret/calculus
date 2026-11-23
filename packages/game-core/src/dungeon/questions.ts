import { evaluateTokens, generateWithRng, renderTokens, tagsOf, type CalcToken } from "../generator";
import { missingGame } from "../games/missing";
import { createRng, pick, randInt } from "../rng";
import type { Difficulty, Question, QuestionSettings } from "../types";
import { ENEMIES, bossProfile, type EnemyId, type EnemyProfile } from "./enemies";

/**
 * Calcul numéro `index` de la série d'un joueur contre un ennemi, à une manche donnée.
 * Chaque joueur a sa propre série (graine propre au joueur) ; un ennemi resté debout pose une nouvelle série à la manche suivante.
 * `attempt` : un nouveau tirage du même rang (seconde chance, tête d'hydre repoussée).
 */
export function enemyQuestion(
  seed: string,
  round: number,
  roomKey: string,
  enemy: EnemyId,
  floor: number,
  difficulty: Difficulty,
  playerId: string,
  index: number,
  attempt = 0,
): Question {
  const p = ENEMIES[enemy].profile(difficulty, floor);
  const key = `${seed}:dungeon:${round}:${roomKey}:${playerId}${attempt ? `:${attempt}` : ""}`;
  if (p.question === "missing-number" || p.question === "missing-operator") {
    // Le nombre manquant du site, sur les bornes de l'ennemi : même générateur, même vérification (unicité garantie).
    const settings = {
      difficulty,
      operations: p.operations,
      parentheses: p.parentheses,
      missingKind: p.question === "missing-operator" ? "operator" : "number",
      level: p.level,
    } as unknown as QuestionSettings;
    return missingGame.generate(key, index, settings);
  }
  if (p.bigTerm) {
    const q = bigTermQuestion(`${key}:${index}`, p, index);
    if (q) return q;
  }
  return generateWithRng(createRng(`${key}:${index}`), { difficulty, operations: p.operations, parentheses: p.parentheses, level: p.level }, index);
}

/**
 * Additions et soustractions dont un terme est tiré dans `p.bigTerm` (« 412 + 3857 − 690 ») ;
 * jamais de résultat intermédiaire négatif. null si aucun tirage ne convient (on retombe alors sur le générateur).
 */
function bigTermQuestion(key: string, p: EnemyProfile, index: number): Question | null {
  const big = p.bigTerm!;
  const rng = createRng(`${key}:big`);
  for (let attempt = 0; attempt < 400; attempt++) {
    const nTerms = pick(rng, p.level.terms);
    const at = randInt(rng, 0, nTerms - 1);
    const tokens: CalcToken[] = [];
    let total = 0;
    let ok = true;
    for (let i = 0; i < nTerms; i++) {
      const n = i === at ? randInt(rng, big.min, big.max) : randInt(rng, p.level.addMin, p.level.addMax);
      if (i === 0) total = n;
      else if (p.operations.includes("sub") && (!p.operations.includes("add") || rng() < 0.5)) {
        if (n >= total) { ok = false; break; }
        tokens.push("−");
        total -= n;
      } else {
        tokens.push("+");
        total += n;
      }
      tokens.push(n);
    }
    if (!ok || total <= 0 || total > p.level.maxResult || evaluateTokens(tokens, true) !== total) continue;
    return { index, text: renderTokens(tokens), answer: total, solution: String(total), puzzle: { game: "standard" }, tags: tagsOf(tokens), difficulty: p.level.level };
  }
  return null;
}

/** Calcul numéro `index` d'un joueur contre le boss. */
export function bossQuestion(seed: string, difficulty: Difficulty, playerId: string, index: number): Question {
  const p = bossProfile(difficulty);
  const rng = createRng(`${seed}:dungeon:boss:${playerId}:${index}`);
  return generateWithRng(rng, { difficulty, operations: p.operations, parentheses: p.parentheses, level: p.level }, index);
}
