import { describe, expect, it } from "vitest";
import {
  DIFFICULTIES,
  GameEngine,
  RIGHT_COUNT_LEVELS,
  defaultSettings,
  evaluateStrict,
  formatExpression,
  numbersOf,
  parseExpression,
  rightCountGame,
  sanitizeSettings,
  solveTiles,
  usesAllTiles,
  type Operation,
  type Question,
} from "../src";

const OPS_COMBOS: Operation[][] = [["add"], ["sub"], ["mul"], ["div"], ["add", "sub"], ["mul", "div"], ["add", "sub", "mul", "div"]];
const puzzleOf = (q: Question) => {
  if (q.puzzle.game !== "right-count") throw new Error("puzzle attendu");
  return q.puzzle;
};

describe("solveur du bon compte", () => {
  it("trouve des solutions justes qui utilisent toutes les plaques, une fois chacune", () => {
    const tiles = [75, 50, 3, 6, 8, 2];
    const r = solveTiles(tiles, ["add", "sub", "mul", "div"], 10_000);
    for (const v of [412, 999, 101, 777]) {
      const s = r.solution(v)!;
      const tree = parseExpression(s)!;
      expect(evaluateStrict(tree)).toBe(v);
      expect(usesAllTiles(numbersOf(tree), tiles), s).toBe(true);
    }
  });

  it("n'utilise que les opérations permises, et toujours toutes les plaques", () => {
    expect(solveTiles([4, 6, 9], ["add"], 1_000).values).toEqual([19]);
    expect(solveTiles([4, 6, 9], ["add", "sub"], 1_000).values).toEqual([1, 7, 11, 19]);
    expect(solveTiles([4, 6, 9], ["add"], 1_000).solution(10)).toBeNull();
  });

  it("écrit les solutions avec le minimum de parenthèses", () => {
    const f = (t: string) => formatExpression(parseExpression(t)!);
    expect(f("(75 − 3) × 6 − 20")).toBe("(75 − 3) × 6 − 20");
    expect(f("((2 + 3) + 4)")).toBe("2 + 3 + 4");
    expect(f("10 − (3 − 2)")).toBe("10 − (3 − 2)");
    expect(f("100 ÷ (5 × 2)")).toBe("100 ÷ (5 × 2)");
  });
});

describe("le bon compte", () => {
  it("tire une cible toujours atteignable avec toutes les plaques, dans la plage du niveau", () => {
    for (const difficulty of DIFFICULTIES) {
      const cfg = RIGHT_COUNT_LEVELS[difficulty];
      for (const operations of OPS_COMBOS) {
        const settings = { ...defaultSettings(difficulty, "speed-race", "right-count"), operations };
        for (let i = 0; i < 6; i++) {
          const q = rightCountGame.generate(`bc-${difficulty}-${operations.join()}`, i, settings);
          const p = puzzleOf(q);
          expect(q.answer).toBe(p.target);
          // La solution de référence est acceptée : la cible est atteignable.
          expect(rightCountGame.check(q, { expr: q.solution }), `${q.text} : ${q.solution}`).toBe(true);
          const tree = parseExpression(q.solution)!;
          expect(evaluateStrict(tree, operations)).toBe(p.target);
          // Toutes les plaques, une fois chacune.
          expect(p.tiles).toHaveLength(cfg.small + cfg.large);
          expect(usesAllTiles(numbersOf(tree), p.tiles), q.solution).toBe(true);
          // Avec toutes les opérations, la cible est dans la plage du niveau.
          if (operations.length === 4) {
            expect(p.target).toBeGreaterThanOrEqual(cfg.targetMin);
            expect(p.target).toBeLessThanOrEqual(cfg.targetMax);
          }
        }
      }
    }
  });

  it("est déterministe", () => {
    const s = defaultSettings(5, "speed-race", "right-count");
    expect(rightCountGame.generate("graine", 3, s)).toEqual(rightCountGame.generate("graine", 3, s));
  });

  it("refuse sans consommer l'essai une expression irrecevable, compte une expression fausse", () => {
    const g = new GameEngine(defaultSettings(3, "speed-race", "right-count"), [{ id: "p0", name: "A" }], "bc-moteur");
    const r = g.startRound(0)!;
    const { tiles, target } = puzzleOf(r.question);
    // Plaque répétée, nombre inventé, mal formée, plaque oubliée.
    const invalid = [`${tiles[0]} + ${r.question.solution}`, "999999 + 1", "3 +", `${target}`, String(tiles[0])];
    for (const expr of invalid) expect(g.submit("p0", { expr }, 5), expr).toMatchObject({ accepted: false, reason: "invalid-value" });
    expect(g.submit("p0", { value: target }, 5)).toMatchObject({ accepted: false, reason: "invalid-value" });
    // Toutes les plaques mais un autre total : la réponse compte, fausse.
    const other = solveTiles(tiles, puzzleOf(r.question).operations, 100_000).values.find((v) => v !== target)!;
    const wrong = solveTiles(tiles, puzzleOf(r.question).operations, 100_000).solution(other)!;
    expect(g.submit("p0", { expr: wrong }, 10)).toMatchObject({ accepted: true, correct: false });
    expect(r.answers[0]).toMatchObject({ value: null, text: wrong, correct: false });
  });

  it("accepte n'importe quelle solution juste", () => {
    const g = new GameEngine(defaultSettings(2, "speed-race", "right-count"), [{ id: "p0", name: "A" }], "bc-juste");
    const r = g.startRound(0)!;
    expect(g.submit("p0", { expr: r.question.solution }, 10)).toMatchObject({ accepted: true, correct: true });
  });

  it("a ses propres temps par défaut et bornes", () => {
    expect(defaultSettings(4, "speed-race", "right-count").timePerQuestion).toBe(RIGHT_COUNT_LEVELS[4].defaultTime);
    expect(sanitizeSettings({ game: "right-count", timePerQuestion: 500 }).timePerQuestion).toBe(rightCountGame.timeRange.max);
    expect(sanitizeSettings({ game: "right-count", timePerQuestion: 5 }).timePerQuestion).toBe(rightCountGame.timeRange.min);
    expect(sanitizeSettings({ game: "standard", timePerQuestion: 500 }).timePerQuestion).toBe(60);
  });
});
