import { evaluateText } from "../generator";
import { missingGame } from "../games/missing";
import type { BasicOperation, Question } from "../types";
import type { DungeonAnswer, DungeonView } from "./engine";

/*
 * Aides pour les bots (script `dungeon:bots`, tests e2e) : résoudre le calcul affiché et choisir une salle.
 * Elles ne lisent que la vue d'un joueur : rien qu'un joueur ne puisse faire de tête.
 */

/** La bonne réponse au calcul affiché (ordinaire, nombre manquant ou opérateur caché). */
export function solveDungeonQuestion(q: { text: string; puzzle: Question["puzzle"] }): DungeonAnswer {
  if (q.puzzle.game !== "missing") return { value: evaluateText(q.text) };
  const probe = { puzzle: q.puzzle } as Question;
  if (q.puzzle.hole === "operator") {
    const op = (["add", "sub", "mul", "div"] as BasicOperation[]).find((o) => missingGame.check(probe, { op: o }));
    return { op: op ?? "add" };
  }
  for (let v = 0; v <= 100_000; v++) if (missingGame.check(probe, { value: v })) return { value: v };
  return { value: 0 };
}

/** Une réponse sûrement fausse, de la même forme. */
export function wrongDungeonAnswer(a: DungeonAnswer): DungeonAnswer {
  return "value" in a ? { value: a.value + 1 } : { op: a.op === "add" ? "sub" : "add" };
}

/**
 * Salles accessibles, de la plus proche du boss à la plus lointaine (passages et portes du boss sont visibles
 * dès le départ ; les coffres passent après les combats à distance égale).
 */
export function roomsTowardBoss(view: DungeonView): DungeonView["rooms"] {
  const byKey = new Map(view.rooms.map((r) => [r.key, r]));
  const memo = new Map<string, number>();
  const steps = (key: string): number => {
    const known = memo.get(key);
    if (known !== undefined) return known;
    const r = byKey.get(key);
    let best = r?.bossLink ? 1 : Infinity;
    for (const k of r?.links ?? []) best = Math.min(best, 1 + steps(k));
    memo.set(key, best);
    return best;
  };
  return view.rooms
    .filter((r) => r.accessible)
    .sort((a, b) => steps(a.key) - steps(b.key) || Number(a.kind === "chest") - Number(b.kind === "chest") || a.index - b.index);
}
