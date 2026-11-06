import type { DungeonSummary } from "../dungeon/engine";
import { ACHIEVEMENTS } from "./catalog";
import { progressOf } from "./evaluate";
import type { Counters, DungeonFacts, Unlock } from "./types";

/** Résume une expédition terminée pour un joueur (null s'il n'en était pas). */
export function dungeonFactsOf(summary: DungeonSummary, playerId: string): DungeonFacts | null {
  const player = summary.players.find((p) => p.id === playerId);
  if (!player) return null;
  return {
    won: summary.outcome === "won",
    difficulty: summary.difficulty,
    players: summary.players.length,
    enemiesDefeated: summary.enemiesDefeated,
    gone: player.gone ?? false,
    lives: player.lives,
    correct: player.correct,
    answered: player.answered,
    heartsGiven: player.heartsGiven,
  };
}

/** Succès nouvellement obtenus après une expédition. `counters` : ceux du compte, expédition comprise (`dungeons`, `dungeon-wins`, `dungeon-hearts`, relus en base). */
export function evaluateDungeonAchievements(facts: DungeonFacts, counters: Counters, owned: ReadonlySet<string>): Unlock[] {
  return ACHIEVEMENTS.filter((a) => {
    if (owned.has(a.id)) return false;
    const progress = progressOf(a, counters);
    if (progress) return progress.value >= progress.target;
    // Parti avant la fin, ou vainqueur sans une seule bonne réponse (porté par l'équipe) : aucun exploit.
    if (facts.gone || (facts.won && facts.correct === 0)) return false;
    return !!a.dungeonCheck && a.dungeonCheck(facts);
  }).map((a) => ({ achievementId: a.id, titleId: a.title ?? null }));
}
