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
  usesTilesOnce,
  commitStep,
  readSteps,
  undoStep,
  type GameSettings,
  type BasicOperation,
  type Question,
} from "../src";

const OPS_COMBOS: BasicOperation[][] = [["add"], ["sub"], ["mul"], ["div"], ["add", "sub"], ["mul", "div"], ["add", "sub", "mul", "div"]];
const puzzleOf = (q: Question) => {
  if (q.puzzle.game !== "right-count") throw new Error("puzzle attendu");
  return q.puzzle;
};

describe("solveur du bon compte", () => {
  it("trouve des solutions justes, chaque plaque au plus une fois", () => {
    const tiles = [75, 50, 3, 6, 8, 2];
    const r = solveTiles(tiles, ["add", "sub", "mul", "div"], 10_000);
    for (const v of [412, 999, 101, 777]) {
      const s = r.solution(v)!;
      const tree = parseExpression(s)!;
      expect(evaluateStrict(tree)).toBe(v);
      expect(usesTilesOnce(numbersOf(tree), tiles), s).toBe(true);
    }
  });

  it("n'utilise que les opérations permises, pas forcément toutes les plaques", () => {
    expect(solveTiles([4, 6, 9], ["add"], 1_000).values).toEqual([10, 13, 15, 19]);
    expect(solveTiles([4, 6, 9], ["add", "sub"], 1_000).values).toEqual([1, 2, 3, 5, 7, 10, 11, 13, 15, 19]);
    expect(solveTiles([4, 6, 9], ["add"], 1_000).solution(11)).toBeNull();
    // Le moins de plaques possible.
    expect(solveTiles([4, 6, 9], ["add", "sub"], 1_000).solution(5)).toBe("9 − 4");
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
  it("tire une cible toujours atteignable, dans la plage du niveau", () => {
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
          // Des plaques, chacune au plus une fois ; jamais une cible égale à une plaque.
          expect(p.tiles).toHaveLength(cfg.small + cfg.large);
          expect(p.tiles).not.toContain(p.target);
          expect(usesTilesOnce(numbersOf(tree), p.tiles), q.solution).toBe(true);
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
    // Plaque répétée, nombre inventé, mal formée, sans opération.
    const invalid = [`${tiles[0]} + ${tiles[0]} + ${r.question.solution}`, "999999 + 1", "3 +", `${target}`, String(tiles[0])];
    for (const expr of invalid) expect(g.submit("p0", { expr }, 5), expr).toMatchObject({ accepted: false, reason: "invalid-value" });
    expect(g.submit("p0", { value: target }, 5)).toMatchObject({ accepted: false, reason: "invalid-value" });
    // Des plaques valides mais un autre total : la réponse compte, fausse.
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

  it("accepte une solution qui laisse des plaques de côté", () => {
    const tiles = [75, 50, 3, 6, 8, 2];
    const q = { ...rightCountGame.generate("x", 0, defaultSettings(3, "speed-race", "right-count")), puzzle: { game: "right-count" as const, tiles, target: 150, operations: ["add", "mul"] as BasicOperation[] } };
    expect(rightCountGame.check(q, { expr: "75 × 2" })).toBe(true);
    expect(rightCountGame.isValid!(q, { expr: "75 × 75" })).toBe(false);
    expect(usesTilesOnce([3, 3], [3, 6, 3])).toBe(true);
  });

  it("a ses propres temps par défaut et bornes", () => {
    expect(defaultSettings(4, "speed-race", "right-count").timePerQuestion).toBe(RIGHT_COUNT_LEVELS[4].defaultTime);
    expect(sanitizeSettings({ game: "right-count", timePerQuestion: 500 }).timePerQuestion).toBe(rightCountGame.timeRange.max);
    expect(sanitizeSettings({ game: "right-count", timePerQuestion: 5 }).timePerQuestion).toBe(rightCountGame.timeRange.min);
    expect(sanitizeSettings({ game: "standard", timePerQuestion: 500 }).timePerQuestion).toBe(60);
  });
});

/** Une partie à plusieurs, et des expressions de valeur connue pour son premier tirage. */
function closestSetup(settings: Partial<GameSettings>, players = 3) {
  const g = new GameEngine(
    { ...defaultSettings(3, "speed-race", "right-count"), ...settings },
    Array.from({ length: players }, (_, i) => ({ id: `p${i}`, name: `J${i}` })),
    "bc-proche",
  );
  const r = g.startRound(0)!;
  const { tiles, target, operations } = puzzleOf(r.question);
  const solved = solveTiles(tiles, operations, 100_000);
  // Valeurs atteignables autres que la cible, de la plus proche à la plus lointaine.
  const near = solved.values.filter((v) => v !== target).sort((a, b) => Math.abs(a - target) - Math.abs(b - target));
  const expr = (v: number) => solved.solution(v)!;
  return { g, r, target, near, expr };
}

describe("le bon compte : le plus proche", () => {
  it("course de vitesse : personne ne trouve, le plus proche marque", () => {
    const { g, near, expr } = closestSetup({});
    const far = near[near.length - 1]!;
    expect(g.submit("p0", { expr: expr(far) }, 10)).toMatchObject({ accepted: true, correct: false, roundCanClose: false });
    expect(g.submit("p1", { expr: expr(near[0]!) }, 20)).toMatchObject({ accepted: true, correct: false });
    const rec = g.closeRound()!;
    expect(rec.scorers).toEqual(["p1"]);
    expect(rec.answers.find((a) => a.playerId === "p1")?.closest).toBe(true);
    expect(rec.answers.find((a) => a.playerId === "p0")?.closest).toBeUndefined();
    expect(g.player("p1")).toMatchObject({ score: 1, correct: 0 });
  });

  it("à égalité d'écart, la première proposition arrivée marque ; une réponse juste passe avant tout", () => {
    const a = closestSetup({});
    a.g.submit("p2", { expr: a.expr(a.near[0]!) }, 10);
    a.g.submit("p0", { expr: a.expr(a.near[0]!) }, 20);
    expect(a.g.closeRound()!.scorers).toEqual(["p2"]);

    const b = closestSetup({});
    b.g.submit("p0", { expr: b.expr(b.near[0]!) }, 10);
    b.g.submit("p1", { expr: b.r.question.solution }, 20);
    const rec = b.g.closeRound()!;
    expect(rec.scorers).toEqual(["p1"]);
    expect(rec.answers.some((x) => x.closest)).toBe(false);
  });

  it("battle royale : personne ne trouve, les plus proches restent en vie", () => {
    const { g, near, expr } = closestSetup({ mode: "battle-royale" });
    g.submit("p0", { expr: expr(near[0]!) }, 10);
    g.submit("p1", { expr: expr(near[near.length - 1]!) }, 10);
    const rec = g.closeRound()!;
    expect(rec.spared).toBe(false);
    expect(rec.eliminated.sort()).toEqual(["p1", "p2"]);
    expect(g.player("p0")?.alive).toBe(true);
  });

  it("ne joue ni seul, ni en « chacun son tour »", () => {
    const solo = closestSetup({}, 1);
    solo.g.submit("p0", { expr: solo.expr(solo.near[0]!) }, 10);
    expect(solo.g.closeRound()!.scorers).toEqual([]);

    const turns = closestSetup({ turnStyle: "turns" }, 2);
    turns.g.submit("p0", { expr: turns.expr(turns.near[0]!) }, 10);
    expect(turns.g.closeRound()!.scorers).toEqual([]);
  });
});

describe("le bon compte : saisie en étapes", () => {
  const tiles = [75, 50, 3, 6, 8, 2];
  const ops: BasicOperation[] = ["add", "sub", "mul", "div"];
  const read = (input: string) => readSteps(tiles, ops, input);

  it("chaque étape devient un nombre disponible, l'expression complète les enchaîne", () => {
    const s = read("75 + 2;77 × 6;50 − 8;462 − 42;");
    expect(s.steps.map((x) => x.value)).toEqual([77, 462, 42, 420]);
    expect(s.tiles).toEqual([
      { value: 3, step: null, used: false },
      { value: 420, step: 3, used: false },
    ]);
    // Ligne vide : la dernière étape est la réponse proposée, même s'il reste des plaques.
    expect(s.complete).toEqual({ expr: "(75 + 2) × 6 − (50 − 8)", value: 420 });
    const done = read("75 + 2;77 × 6;50 − 8;462 − 42;420 ÷ 3");
    expect(done.lineValue).toBe(140);
    expect(done.complete).toEqual({ expr: "((75 + 2) × 6 − (50 − 8)) ÷ 3", value: 140 });
    // L'expression complète respecte les règles : chaque plaque au plus une fois.
    const q = { ...rightCountGame.generate("x", 0, defaultSettings(3, "speed-race", "right-count")), puzzle: { game: "right-count" as const, tiles, target: 140, operations: ops } };
    expect(rightCountGame.check(q, { expr: done.complete!.expr })).toBe(true);
  });

  it("propose le calcul en cours, ou la dernière étape quand la ligne est vide", () => {
    expect(read("75 + 50 + 3 + 6 + 8 + 2;").complete).toEqual({ expr: "75 + 50 + 3 + 6 + 8 + 2", value: 144 });
    expect(read("75 + 50 + 3 + 6 + 8 + 2").complete?.value).toBe(144);
    // Sans toutes les plaques : proposé aussi ; une ligne sans opération ou incomplète ne l'est pas.
    expect(read("6 + 3;9 × 50").complete).toEqual({ expr: "(6 + 3) × 50", value: 450 });
    expect(read("75 + 2;3").complete).toBeNull();
    expect(read("75 +").complete).toBeNull();
    expect(read("").complete).toBeNull();
  });

  it("refuse les étapes hors des règles et les nombres indisponibles", () => {
    expect(read("3 − 6").canCommit).toBe(false);
    expect(read("75 ÷ 2").canCommit).toBe(false);
    expect(read("75").canCommit).toBe(false);
    expect(read("75 + 75").lineValue).toBeNull();
    expect(read("9 + 1").lineValue).toBeNull();
    // Une étape enregistrée illisible est ignorée.
    expect(read("75 + 75;3 + 6;").steps.map((x) => x.text)).toEqual(["3 + 6"]);
    expect(readSteps(tiles, ["add"], "75 × 2").lineValue).toBeNull();
  });

  it("marque les nombres pris par la ligne en cours, même incomplète", () => {
    expect(read("6 + 2;8 ×").tiles.filter((x) => x.used).map((x) => x.value)).toEqual([8]);
    // Un résultat d'étape égal à une plaque : la plaque du tirage est prise d'abord.
    const twin = read("6 + 2;8");
    expect(twin.tiles.filter((x) => x.value === 8).map((x) => x.used)).toEqual([true, false]);
  });

  it("pose et défait les étapes", () => {
    const one = commitStep(read("75+2"));
    expect(one).toBe("75 + 2;");
    expect(commitStep(read("75 −"))).toBe("75 −");
    expect(undoStep(read("75 + 2;77 × 6"))).toBe("75 + 2;77 ×");
    // Ligne vide : la dernière étape revient dans la ligne.
    expect(undoStep(read("75 + 2;77 × 6;"))).toBe("75 + 2;77 × 6");
    expect(undoStep(read("75 + 2;"))).toBe("75 + 2");
    expect(undoStep(read(""))).toBe("");
  });
});
