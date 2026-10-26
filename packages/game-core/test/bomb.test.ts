import { describe, expect, it } from "vitest";
import {
  BOMB_LEVELS,
  DIFFICULTIES,
  GameEngine,
  assignBombs,
  bombValue,
  buildReport,
  defaultSettings,
  evaluateText,
  fallbackBomb,
  sanitizeSettings,
  type BombPuzzle,
  type GameSettings,
  type Operation,
} from "../src";

const settings = (over: Partial<GameSettings> = {}): GameSettings => ({ ...defaultSettings(2, "battle-royale", "bomb"), ...over });
const players = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `Joueur ${i}` }));
const puzzle = (over: Partial<BombPuzzle> = {}): BombPuzzle => ({
  game: "bomb",
  tiles: [7, 3, 8, 2, 5],
  operations: ["add", "sub", "mul", "div"],
  minTiles: 3,
  maxResult: 200,
  parentheses: false,
  ...over,
});

/** Une bombe valide quelconque pour ce tirage. */
const someBomb = (g: GameEngine) => {
  const p = g.currentRound!.question.puzzle as BombPuzzle;
  return fallbackBomb(p, "test").expr;
};

describe("la bombe : règles de construction", () => {
  it("accepte une bombe valide et la réécrit proprement", () => {
    expect(bombValue(puzzle(), "7*8+3")).toEqual({ value: 59, text: "7 × 8 + 3" });
  });

  it("refuse chaque règle enfreinte, avec sa raison", () => {
    const cases: [string, string, Partial<BombPuzzle>?][] = [
      ["7 +", "syntax"],
      ["7 + 7 + 3", "tiles"],
      ["9 + 3 + 8", "tiles"],
      ["7 + 3", "min-tiles"],
      ["7 × 3 × 8", "operations", { operations: ["add", "sub"] }],
      ["(7 + 3) × 8", "parentheses"],
      ["7 ÷ 2 + 3", "invalid"],
      ["2 − 7 + 8", "invalid"],
      ["7 × 8 × 5", "too-big"],
    ];
    for (const [expr, error, over] of cases) expect(bombValue(puzzle(over), expr), expr).toEqual({ error });
    expect(bombValue(puzzle({ parentheses: true }), "(7 + 3) × 8")).toMatchObject({ value: 80 });
  });

  it("a toujours une bombe de secours valide, à chaque niveau", () => {
    const combos: Operation[][] = [["add"], ["sub"], ["mul"], ["div"], ["add", "sub"], ["add", "sub", "mul", "div"]];
    for (const d of DIFFICULTIES) {
      for (const operations of combos) {
        for (let i = 0; i < 20; i++) {
          const g = new GameEngine(settings({ difficulty: d, operations }), players(2), `secours-${d}-${operations.join()}-${i}`);
          const p = g.startRound(0)!.question.puzzle as BombPuzzle;
          expect(p.tiles).toHaveLength(BOMB_LEVELS[d].digits + BOMB_LEVELS[d].numbers);
          const fb = fallbackBomb(p, `s${i}`);
          expect(evaluateText(fb.expr)).toBe(fb.value);
          // Avec plusieurs opérations, la bombe de secours respecte toutes les règles.
          if (operations.length > 1) expect(bombValue(p, fb.expr), fb.expr).toMatchObject({ value: fb.value });
        }
      }
    }
  });

  it("attribue chaque bombe à un autre joueur, chacun en recevant une", () => {
    for (let n = 2; n <= 12; n++) {
      for (let s = 0; s < 10; s++) {
        const ids = players(n).map((p) => p.id);
        const a = assignBombs(ids, `a${n}-${s}`);
        expect(Object.keys(a).sort()).toEqual([...ids].sort());
        expect(Object.values(a).sort()).toEqual([...ids].sort());
        for (const [author, defuser] of Object.entries(a)) expect(defuser).not.toBe(author);
      }
    }
    expect(assignBombs(["p0", "p1"], "x")).toEqual({ p0: "p1", p1: "p0" });
  });
});

describe("la bombe : une manche", () => {
  it("construction, attribution, désamorçage, élimination et point pour l'auteur", () => {
    const g = new GameEngine(settings(), players(3), "manche");
    const r = g.startRound(0)!;
    expect(r.stage).toBe("build");
    expect(r.timeLimitMs).toBe(settings().buildTime * 1000);
    // Pas de réponse pendant la construction.
    expect(g.submit("p0", 3, 10)).toMatchObject({ accepted: false, reason: "not-allowed" });

    const bomb = someBomb(g);
    expect(g.submitBomb("p0", bomb)).toMatchObject({ accepted: true, allBuilt: false });
    expect(g.submitBomb("p0", bomb)).toMatchObject({ accepted: false, reason: "already-answered" });
    expect(g.submitBomb("p1", "1 +")).toMatchObject({ accepted: false, reason: "syntax" });
    expect(g.submitBomb("p1", bomb)).toMatchObject({ accepted: true, allBuilt: false });
    // p2 ne construit rien : il reçoit une bombe de secours.
    g.closeBuild(5_000);
    expect(r.stage).toBe("solve");
    expect(r.startedAt).toBe(5_000);
    expect(r.bombs!.p2!.fallback).toBe(true);
    expect(Object.keys(r.personal!).sort()).toEqual(["p0", "p1", "p2"]);
    for (const [defuser, { authorId, question }] of Object.entries(r.personal!)) {
      expect(authorId).not.toBe(defuser);
      expect(evaluateText(question.text)).toBe(question.answer);
    }

    // p0 et p1 désamorcent, p2 se trompe.
    const right = (id: string) => r.personal![id]!.question.answer;
    expect(g.submit("p0", right("p0"), 6_000)).toMatchObject({ accepted: true, correct: true, timeMs: 1_000 });
    expect(g.submit("p1", right("p1"), 6_500)).toMatchObject({ accepted: true, correct: true });
    expect(g.submit("p2", right("p2") + 1, 7_000)).toMatchObject({ accepted: true, correct: false, roundCanClose: true });
    g.closeRound();
    expect(r.eliminated).toEqual(["p2"]);
    // L'auteur de la bombe ratée par p2 marque un point de plus (sauf si c'était une bombe de secours).
    const author = r.personal!.p2!.authorId;
    expect(r.scorers).toEqual(r.bombs![author]!.fallback ? [] : [author]);
    expect(g.player(author)!.score).toBe(r.bombs![author]!.fallback ? 1 : 2);

    const rep = buildReport(g.standings(), g.history);
    expect(rep.review[0]!.bombs).toHaveLength(3);
    expect(rep.review[0]!.bombs!.find((b) => b.defuserId === "p2")).toMatchObject({ authorId: author, text: r.personal!.p2!.question.text });
  });

  it("si tout le monde rate, personne ne sort", () => {
    const g = new GameEngine(settings(), players(2), "rate");
    g.startRound(0);
    g.closeBuild(100);
    g.submit("p0", -1 as number, 200);
    const r = g.closeRound()!;
    expect(r.spared).toBe(true);
    expect(g.players.every((p) => p.alive)).toBe(true);
  });

  it("une partie finie pendant la construction annule la manche", () => {
    const g = new GameEngine(settings(), players(2), "depart");
    g.startRound(0);
    g.setConnected("p1", false);
    expect(g.closeRound()).toBeNull();
    expect(g.history).toHaveLength(0);
    expect(g.isOver).toBe(true);
    expect(g.winners().map((p) => p.id)).toEqual(["p0"]);
  });

  it("ne se joue qu'en battle royale, en simultané, avec un temps de construction borné", () => {
    const s = sanitizeSettings({ game: "bomb", mode: "speed-race", turnStyle: "turns", buildTime: 999 });
    expect(s).toMatchObject({ mode: "battle-royale", turnStyle: "simultaneous", buildTime: 120 });
    expect(sanitizeSettings({ game: "bomb", buildTime: 1 }).buildTime).toBe(15);
  });
});
