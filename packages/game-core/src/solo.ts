import { GameEngine } from "./engine";
import type { GameSettings, PlayerAnswer, PlayerInfo } from "./types";

/** Une manche d'une partie solo, telle que le navigateur l'envoie : la réponse (null si le temps s'est écoulé) et son temps. */
export interface SoloAnswer {
  answer: PlayerAnswer | null;
  timeMs: number;
}

/**
 * Rejoue une partie solo à partir de sa graine et des réponses du joueur.
 * Les calculs et la justesse des réponses sont recalculés ici ; seul le temps de réponse
 * vient du joueur, borné par le temps de la manche.
 *
 * Seul compte le temps de chaque manche, de son début à la réponse : ce qui se passe entre deux
 * manches (la correction affichée après une erreur, aussi longue que le joueur le veut) n'existe
 * pas pour le rejeu, qui enchaîne les manches sur une horloge fictive.
 */
export function replaySolo(settings: GameSettings, player: PlayerInfo, seed: string, answers: SoloAnswer[]): GameEngine {
  const engine = new GameEngine(settings, [player], seed);
  let t = 0;
  for (const a of answers) {
    const round = engine.startRound(t);
    if (!round) break;
    if (a.answer !== null) engine.submit(player.id, a.answer, t + Math.min(a.timeMs, round.timeLimitMs));
    engine.closeRound();
    t += round.timeLimitMs + 1;
  }
  return engine;
}
