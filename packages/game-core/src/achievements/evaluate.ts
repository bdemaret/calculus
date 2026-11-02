import { ACHIEVEMENTS } from "./catalog";
import type { AchievementDefinition, Counters, GameFacts, Unlock } from "./types";

/** Ce qu'une partie ajoute aux compteurs d'un joueur. Vide si elle ne compte pas. */
export function countersDelta(facts: GameFacts): Record<string, number> {
  const delta: Record<string, number> = {};
  const add = (key: string, n = 1) => {
    if (n > 0) delta[key] = (delta[key] ?? 0) + n;
  };
  // Éliminé d'entrée : une partie en ligne, mais aussi le succès qui console.
  if (facts.firstOut) add("first-out");
  if (!facts.eligible) return delta;

  const count = (test: (r: GameFacts["rounds"][number]) => boolean) => facts.rounds.filter(test).length;
  add("games");
  add(`games:${facts.game}`);
  add("correct", count((r) => r.correct));
  if (facts.won) {
    add("wins");
    add(`wins:${facts.game}`);
    add(`wins:${facts.mode}`);
    add(`wins:level:${facts.difficulty}`);
  }
  if (facts.game === "standard") add("power", count((r) => r.correct && (r.tags.includes("pow") || r.tags.includes("sqrt"))));
  if (facts.game === "right-count") add("rc-exact", count((r) => r.correct));
  if (facts.game === "missing") add("missing-op", count((r) => r.correct && r.tags.includes("hole-op")));
  if (facts.game === "bomb" && !facts.solo) {
    add("bomb-boom", facts.bomb.exploded);
    add("bomb-defuse", count((r) => r.correct));
  }
  return delta;
}

/** Part d'un succès cumulatif atteint : le compteur et sa cible. */
export function progressOf(definition: AchievementDefinition, counters: Counters): { value: number; target: number } | null {
  const target = definition.target;
  if (!target) return null;
  if ("counter" in target) return { value: Math.min(counters[target.counter] ?? 0, target.value), target: target.value };
  return { value: target.every.filter((key) => (counters[key] ?? 0) > 0).length, target: target.every.length };
}

function earned(definition: AchievementDefinition, facts: GameFacts | null, counters: Counters): boolean {
  const progress = progressOf(definition, counters);
  if (progress) return progress.value >= progress.target;
  if (!definition.check || !facts?.eligible) return false;
  if (definition.online && facts.solo) return false;
  return definition.check(facts);
}

/**
 * Succès nouvellement obtenus. `facts` est null hors d'une partie (amis, guilde) : seuls les
 * compteurs sont alors regardés. `counters` inclut déjà ce que la partie vient d'ajouter.
 */
export function evaluateAchievements(facts: GameFacts | null, counters: Counters, owned: ReadonlySet<string>): Unlock[] {
  return ACHIEVEMENTS.filter((a) => !owned.has(a.id) && earned(a, facts, counters)).map((a) => ({ achievementId: a.id, titleId: a.title ?? null }));
}
