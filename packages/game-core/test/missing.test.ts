import { describe, expect, it } from "vitest";
import {
  ALL_OPERATIONS,
  DIFFICULTIES,
  GameEngine,
  LEVELS,
  MISSING_KINDS,
  OPERATION_SYMBOL,
  defaultSettings,
  evaluateText,
  missingGame,
  sanitizeSettings,
  type GameSettings,
  type Operation,
  type PlayerAnswer,
  type Question,
} from "../src";

const OPS_COMBOS: Operation[][] = [["add"], ["sub"], ["mul"], ["div"], ["add", "sub"], ["mul", "div"], ["add", "sub", "mul", "div"]];

/** La bonne réponse d'un calcul, déduite de la solution de référence. */
function expected(q: Question): PlayerAnswer {
  const op = ALL_OPERATIONS.find((o) => OPERATION_SYMBOL[o] === q.solution);
  return op ? { op } : { value: Number(q.solution) };
}

describe("nombre manquant", () => {
  it("cache un seul morceau, d'une seule façon possible, cohérent avec l'égalité", () => {
    for (const difficulty of DIFFICULTIES) {
      for (const operations of OPS_COMBOS) {
        for (const parentheses of [false, true]) {
          for (const missingKind of MISSING_KINDS) {
            const settings: GameSettings = { ...defaultSettings(difficulty, "speed-race", "missing"), operations, parentheses, missingKind };
            for (let i = 0; i < 40; i++) {
              const q = missingGame.generate(`m-${difficulty}-${operations.join()}-${parentheses}-${missingKind}`, i, settings);
              if (q.puzzle.game !== "missing") throw new Error("puzzle attendu");
              const { hole, result } = q.puzzle;
              expect(q.text.split("?").length).toBe(2);
              expect(q.text.endsWith(`= ${result}`)).toBe(true);
              // L'égalité complétée est vraie.
              const [left] = q.text.replace("?", q.solution).split(" = ");
              expect(evaluateText(left!)).toBe(result);
              expect(missingGame.check(q, expected(q))).toBe(true);
              if (missingKind === "number") expect(hole).toBe("number");
              expect(q.tags).toContain(hole === "number" ? "hole-num" : "hole-op");
              if (!parentheses) expect(q.text).not.toContain("(");
              // Aucune autre réponse ne convient.
              if (hole === "operator") {
                expect(ALL_OPERATIONS.filter((op) => missingGame.check(q, { op }))).toHaveLength(1);
              } else if (i < 8) {
                // Balayage complet sur une partie des calculs (le générateur, lui, vérifie autour de la valeur cachée).
                const bound = Math.min(LEVELS[difficulty].maxResult, 1000);
                const others: number[] = [];
                for (let v = 0; v <= bound; v++) if (v !== Number(q.solution) && missingGame.check(q, { value: v })) others.push(v);
                expect(others, q.text).toEqual([]);
              }
            }
          }
        }
      }
    }
  });

  it("propose des opérateurs manquants en « l'un ou l'autre » et en « opérateur »", () => {
    for (const missingKind of ["operator", "mixed"] as const) {
      const settings = { ...defaultSettings(3, "speed-race", "missing"), missingKind };
      const holes = Array.from({ length: 60 }, (_, i) => missingGame.generate("mix", i, settings).puzzle);
      expect(holes.some((p) => p.game === "missing" && p.hole === "operator")).toBe(true);
      if (missingKind === "mixed") expect(holes.some((p) => p.game === "missing" && p.hole === "number")).toBe(true);
    }
  });

  it("est déterministe", () => {
    const s = defaultSettings(4, "speed-race", "missing");
    expect(missingGame.generate("graine", 7, s)).toEqual(missingGame.generate("graine", 7, s));
  });

  it("n'accepte que la forme de réponse attendue par le calcul", () => {
    const settings = sanitizeSettings({ game: "missing", difficulty: 3, missingKind: "operator", operations: ["add", "sub", "mul", "div"] });
    const g = new GameEngine(settings, [{ id: "p0", name: "A" }], "forme-op");
    const r = g.startRound(0)!;
    expect(r.question.puzzle).toMatchObject({ hole: "operator" });
    expect(g.submit("p0", { value: r.question.answer }, 5)).toMatchObject({ accepted: false, reason: "invalid-value" });
    const res = g.submit("p0", expected(r.question), 10);
    expect(res).toMatchObject({ accepted: true, correct: true });
    expect(r.answers[0]).toMatchObject({ value: null, text: r.question.solution });
  });

  it("garde le type de trou dans les réglages", () => {
    expect(sanitizeSettings({ game: "missing", missingKind: "operator" }).missingKind).toBe("operator");
    expect(sanitizeSettings({ game: "missing", difficulty: 1, missingKind: "hack" }).missingKind).toBe("number");
    expect(sanitizeSettings({ game: "missing", difficulty: 4 }).missingKind).toBe("mixed");
  });
});
