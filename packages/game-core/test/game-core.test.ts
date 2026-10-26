import { describe, expect, it } from "vitest";
import {
  DIFFICULTIES,
  GameEngine,
  buildReport,
  PLACEMENT_GAMES,
  computeRatingChanges,
  createRng,
  randomPublicSettings,
  describeRatingChange,
  defaultSettings,
  evaluateText,
  generateQuestion,
  GAMES,
  sanitizeSettings,
  type Difficulty,
  type GameSettings,
  type Operation,
} from "../src";

const OPS_COMBOS: Operation[][] = [["add"], ["sub"], ["mul"], ["div"], ["add", "sub"], ["mul", "div"], ["add", "sub", "mul", "div"]];

describe("générateur de calculs", () => {
  it("produit des résultats entiers, positifs, cohérents avec l'énoncé", () => {
    for (const difficulty of DIFFICULTIES) {
      for (const operations of OPS_COMBOS) {
        for (const parentheses of [false, true]) {
          for (let i = 0; i < 300; i++) {
            const q = generateQuestion(`s-${difficulty}-${operations.join()}-${parentheses}`, i, { difficulty, operations, parentheses });
            expect(Number.isInteger(q.answer)).toBe(true);
            expect(q.answer).toBeGreaterThanOrEqual(0);
            expect(evaluateText(q.text)).toBe(q.answer);
            if (!parentheses) expect(q.text).not.toContain("(");
          }
        }
      }
    }
  });

  it("n'utilise que les opérations demandées", () => {
    const symbols: Record<Operation, string> = { add: "+", sub: "−", mul: "×", div: "÷" };
    for (const difficulty of DIFFICULTIES) {
      for (const operations of OPS_COMBOS) {
        for (let i = 0; i < 200; i++) {
          const q = generateQuestion("ops", i, { difficulty, operations, parentheses: true });
          for (const op of Object.keys(symbols) as Operation[]) {
            if (!operations.includes(op)) expect(q.text).not.toContain(symbols[op]);
          }
        }
      }
    }
  });

  it("donne le même calcul pour la même graine", () => {
    const s = defaultSettings(4);
    expect(generateQuestion("abc", 7, s)).toEqual(generateQuestion("abc", 7, s));
    expect(generateQuestion("abc", 7, s).text).not.toBe(generateQuestion("abd", 7, s).text);
  });

  it("utilise des parenthèses aux niveaux 4 et 5 quand c'est permis", () => {
    for (const d of [4, 5] as Difficulty[]) {
      const withParen = Array.from({ length: 100 }, (_, i) => generateQuestion("p", i, defaultSettings(d))).filter((q) => q.text.includes("("));
      expect(withParen.length).toBeGreaterThan(20);
    }
  });

  it("évalue correctement les priorités", () => {
    expect(evaluateText("2 + 3 × 4")).toBe(14);
    expect(evaluateText("(2 + 3) × 4")).toBe(20);
    expect(evaluateText("100 − 36 ÷ 4")).toBe(91);
    expect(evaluateText("10 − 3 − 2")).toBe(5);
    expect(Number.isNaN(evaluateText("7 ÷ 2"))).toBe(true);
  });
});

describe("paramètres", () => {
  it("corrige les valeurs invalides", () => {
    const s = sanitizeSettings({ difficulty: 9, mode: "hack", operations: ["pow"], rounds: 1000, timePerQuestion: -4 });
    expect(s.difficulty).toBe(2);
    expect(s.mode).toBe("speed-race");
    expect(s.operations.length).toBeGreaterThan(0);
    expect(s.rounds).toBe(50);
    expect(s.timePerQuestion).toBe(3);
  });

  it("reprend les anciens réglages sans jeu comme du calcul standard", () => {
    expect(sanitizeSettings({ difficulty: 3, mode: "battle-royale" }).game).toBe("standard");
    expect(sanitizeSettings({ game: "hack" }).game).toBe("standard");
  });

  it("ne garde qu'un mode proposé par le jeu", () => {
    for (const mode of ["battle-royale", "speed-race", "hack"]) {
      const s = sanitizeSettings({ game: "standard", mode });
      expect(GAMES[s.game].modes).toContain(s.mode);
    }
  });
});

const players = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `Joueur ${i}` }));
const settings = (over: Partial<GameSettings>): GameSettings => ({ ...defaultSettings(1), ...over });

describe("course de vitesse", () => {
  it("donne le point au premier qui répond juste", () => {
    const g = new GameEngine(settings({ mode: "speed-race", rounds: 5 }), players(3), "seed");
    let now = 0;
    while (!g.isOver) {
      const r = g.startRound(now)!;
      expect(g.submit("p1", r.question.answer + 1, now + 500).correct).toBe(false);
      expect(g.submit("p1", r.question.answer, now + 600).accepted).toBe(false); // une seule réponse
      const res = g.submit("p2", r.question.answer, now + 800);
      expect(res.roundCanClose).toBe(true);
      g.closeRound();
      now += 10_000;
    }
    const [first] = g.standings();
    expect(first!.player.id).toBe("p2");
    expect(first!.player.score).toBe(5);
    expect(g.roundsPlayed).toBe(5);
  });

  it("en tour par tour, chacun reçoit le nombre de calculs prévu", () => {
    const g = new GameEngine(settings({ mode: "speed-race", rounds: 5, turnStyle: "turns" }), players(3), "t");
    const counts: Record<string, number> = {};
    let now = 0;
    while (!g.isOver) {
      const r = g.startRound(now)!;
      counts[r.activePlayerId!] = (counts[r.activePlayerId!] ?? 0) + 1;
      expect(g.submit(r.activePlayerId === "p0" ? "p1" : "p0", r.question.answer, now + 10).accepted).toBe(false);
      g.submit(r.activePlayerId!, r.question.answer, now + 100);
      g.closeRound();
      now += 1000;
    }
    expect(counts).toEqual({ p0: 5, p1: 5, p2: 5 });
  });
});

describe("battle royale", () => {
  it("élimine à la première erreur et désigne le dernier en vie", () => {
    const g = new GameEngine(settings({ mode: "battle-royale" }), players(3), "br");
    let now = 0;
    // Manche 1 : p0 se trompe.
    let r = g.startRound(now)!;
    g.submit("p0", -1, now + 100);
    g.submit("p1", r.question.answer, now + 200);
    g.submit("p2", r.question.answer, now + 300);
    expect(g.closeRound()!.eliminated).toEqual(["p0"]);
    now += 20_000;
    // Manche 2 : p2 ne répond pas (temps écoulé).
    r = g.startRound(now)!;
    expect(g.canAnswer("p0")).toBe(false);
    g.submit("p1", r.question.answer, now + 200);
    expect(g.closeRound()!.eliminated).toEqual(["p2"]);
    expect(g.isOver).toBe(true);
    const ranking = g.standings().map((s) => s.player.id);
    expect(ranking).toEqual(["p1", "p2", "p0"]);
  });

  it("n'élimine personne si tous les survivants se trompent", () => {
    const g = new GameEngine(settings({ mode: "battle-royale" }), players(2), "spare");
    g.startRound(0);
    g.submit("p0", -1, 10);
    g.submit("p1", -1, 20);
    const round = g.closeRound()!;
    expect(round.spared).toBe(true);
    expect(g.players.every((p) => p.alive)).toBe(true);
  });

  it("en solo, la partie s'arrête à la première erreur", () => {
    const g = new GameEngine(settings({ mode: "battle-royale" }), players(1), "solo");
    let now = 0;
    for (let i = 0; i < 4; i++) {
      const r = g.startRound(now)!;
      g.submit("p0", r.question.answer, now + 50);
      g.closeRound();
      now += 1000;
    }
    g.startRound(now);
    g.submit("p0", -5, now + 50);
    g.closeRound();
    expect(g.isOver).toBe(true);
    expect(g.players[0]!.score).toBe(4);
  });

  it("accélère au fil des manches", () => {
    const g = new GameEngine(settings({ mode: "battle-royale", timePerQuestion: 10 }), players(1), "fast");
    const first = g.startRound(0)!.timeLimitMs;
    g.submit("p0", g.currentRound!.question.answer, 1);
    g.closeRound();
    const second = g.startRound(10)!.timeLimitMs;
    expect(second).toBeLessThan(first);
  });

  it("élimine un joueur qui quitte la partie", () => {
    const g = new GameEngine(settings({ mode: "battle-royale" }), players(2), "leave");
    g.startRound(0);
    g.setConnected("p0", false);
    expect(g.canAnswer("p0")).toBe(false);
  });
});

describe("rapport", () => {
  it("calcule précision, temps moyen et calcul le plus raté", () => {
    const g = new GameEngine(settings({ mode: "speed-race", rounds: 5 }), players(2), "rep");
    let now = 0;
    while (!g.isOver) {
      const r = g.startRound(now)!;
      g.submit("p1", -1, now + 100);
      g.submit("p0", r.question.answer, now + 1000);
      g.closeRound();
      now += 5000;
    }
    const rep = buildReport(g.standings(), g.history);
    const p0 = rep.players.find((p) => p.playerId === "p0")!;
    const p1 = rep.players.find((p) => p.playerId === "p1")!;
    expect(p0.accuracy).toBe(1);
    expect(p0.avgCorrectMs).toBe(1000);
    expect(p0.bestStreak).toBe(5);
    expect(p1.accuracy).toBe(0);
    expect(rep.hardest?.misses).toBe(1);
    expect(rep.players[0]!.rank).toBe(1);
  });
});

describe("rapport : revoir les calculs", () => {
  it("garde chaque manche avec la bonne réponse et les réponses de chaque joueur", () => {
    const settings = { ...defaultSettings(2, "speed-race"), rounds: 5 };
    const engine = new GameEngine(settings, [{ id: "a", name: "Ana" }, { id: "b", name: "Bob" }], "revue");
    let now = 0;
    while (!engine.isOver) {
      const r = engine.startRound(now)!;
      engine.submit("b", r.question.answer + 1, now + 500);
      engine.submit("a", r.question.answer, now + 900);
      engine.closeRound();
      now += 10_000;
    }
    const report = buildReport(engine.standings(), engine.history);
    expect(report.review).toHaveLength(5);
    const first = report.review[0]!;
    expect(first.round).toBe(1);
    expect(first.answer).toBe(engine.history[0]!.question.answer);
    expect(first.answers.map((x) => [x.playerId, x.correct])).toEqual([["b", false], ["a", true]]);
    expect(first.scorers).toEqual(["a"]);
  });
});

describe("Elo", () => {
  const e = (id: string, rating: number, rank: number, provisional = false) => ({ id, rating, rank, provisional });

  it("ne change rien sans adversaire", () => {
    expect(computeRatingChanges([])).toEqual({});
    expect(computeRatingChanges([e("a", 1000, 1)])).toEqual({ a: 0 });
  });

  it("duel à égalité d'Elo : ±16, ex aequo : 0", () => {
    expect(computeRatingChanges([e("a", 1000, 1), e("b", 1000, 2)])).toEqual({ a: 16, b: -16 });
    expect(computeRatingChanges([e("a", 1000, 1), e("b", 1000, 1)])).toEqual({ a: 0, b: 0 });
  });

  it("battre un plus fort rapporte plus que battre un plus faible", () => {
    const upset = computeRatingChanges([e("a", 1000, 1), e("b", 1200, 2)]);
    const expected = computeRatingChanges([e("a", 1200, 1), e("b", 1000, 2)]);
    expect(upset.a!).toBeGreaterThan(16);
    expect(expected.a!).toBeLessThan(16);
    expect(upset.a! + upset.b!).toBe(0);
  });

  it("à plusieurs, le gain suit le classement et reste borné par K", () => {
    const d = computeRatingChanges([1, 2, 3, 4].map((rank) => e(`p${rank}`, 1000, rank)));
    expect(d.p1!).toBe(16);
    expect(d.p1!).toBeGreaterThan(d.p2!);
    expect(d.p2!).toBeGreaterThan(d.p3!);
    expect(d.p4!).toBe(-16);
  });

  it("un joueur en placement bouge mais ne donne ni ne prend rien aux joueurs classés", () => {
    // Le classé bat le nouveau : rien pour le classé, le nouveau perd.
    expect(computeRatingChanges([e("pro", 1000, 1), e("new", 1000, 2, true)])).toEqual({ pro: 0, new: -16 });
    // Le classé ne compte que les autres classés.
    const d = computeRatingChanges([e("new", 1000, 1, true), e("a", 1000, 2), e("b", 1000, 3)]);
    expect(d.a).toBe(16);
    expect(d.b).toBe(-16);
    expect(d.new).toBe(16);
    // Deux joueurs en placement s'affrontent normalement.
    expect(computeRatingChanges([e("x", 1000, 1, true), e("y", 1000, 2, true)])).toEqual({ x: 16, y: -16 });
  });

  it("l'Elo reste caché pendant le placement, puis est dévoilé", () => {
    expect(describeRatingChange(1000, 1016, 1)).toEqual({ status: "placement", played: 1 });
    expect(describeRatingChange(1040, 1056, PLACEMENT_GAMES)).toEqual({ status: "revealed", after: 1056 });
    expect(describeRatingChange(1056, 1040, PLACEMENT_GAMES + 1)).toEqual({ status: "rated", before: 1056, after: 1040 });
  });
});

describe("lobbys publics", () => {
  it("tire des réglages valides et reproductibles", () => {
    for (let i = 0; i < 200; i++) {
      const s = randomPublicSettings(createRng(`pub-${i}`));
      expect(sanitizeSettings(s)).toEqual(s);
      expect(randomPublicSettings(createRng(`pub-${i}`))).toEqual(s);
      // En « chacun son tour », chaque joueur reçoit `rounds` calculs : la partie reste courte.
      if (s.turnStyle === "turns") expect(s.rounds).toBeLessThanOrEqual(5);
    }
  });

  it("fait varier le jeu, la façon de jouer et le niveau", () => {
    const rng = createRng("variete");
    const drawn = Array.from({ length: 200 }, () => randomPublicSettings(rng));
    expect(new Set(drawn.map((s) => s.mode)).size).toBe(2);
    expect(new Set(drawn.map((s) => s.turnStyle)).size).toBe(2);
    expect(new Set(drawn.map((s) => s.difficulty)).size).toBe(5);
    // Tous les jeux qui se jouent seul ; jamais la bombe (deux joueurs au moins).
    expect([...new Set(drawn.map((s) => s.game))].sort()).toEqual(["missing", "right-count", "standard"]);
  });

  it("évite de proposer le même lobby que ceux déjà ouverts", () => {
    for (let i = 0; i < 200; i++) {
      const open = randomPublicSettings(createRng(`ouvert-${i}`));
      const next = randomPublicSettings(createRng(`suivant-${i}`), [open]);
      expect([next.game, next.mode, next.turnStyle, next.difficulty]).not.toEqual([open.game, open.mode, open.turnStyle, open.difficulty]);
    }
  });
});
