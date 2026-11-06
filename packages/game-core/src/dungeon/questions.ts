import { generateWithRng } from "../generator";
import { missingGame } from "../games/missing";
import { createRng } from "../rng";
import type { Difficulty, GameSettings, Question } from "../types";
import { ENEMIES, bossProfile, type EnemyId } from "./enemies";

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
    } as unknown as GameSettings;
    return missingGame.generate(key, index, settings);
  }
  return generateWithRng(createRng(`${key}:${index}`), { difficulty, operations: p.operations, parentheses: p.parentheses, level: p.level }, index);
}

/** Calcul numéro `index` d'un joueur contre le boss. */
export function bossQuestion(seed: string, difficulty: Difficulty, playerId: string, index: number): Question {
  const p = bossProfile(difficulty);
  const rng = createRng(`${seed}:dungeon:boss:${playerId}:${index}`);
  return generateWithRng(rng, { difficulty, operations: p.operations, parentheses: p.parentheses, level: p.level }, index);
}
