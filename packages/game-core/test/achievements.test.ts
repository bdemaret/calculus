import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ACHIEVEMENT_IDS,
  ACHIEVEMENTS,
  GameEngine,
  TITLES,
  TITLE_IDS,
  countersDelta,
  defaultSettings,
  evaluateAchievements,
  factsOf,
  progressOf,
  replaySolo,
  type FactsInput,
  type GameFacts,
  type GameSettings,
  type RoundFacts,
  type SoloAnswer,
} from "../src";

const NOV_NOON = Date.UTC(2026, 10, 1, 12);

function round(over: Partial<RoundFacts> = {}): RoundFacts {
  return {
    answered: true,
    correct: true,
    closest: false,
    timeMs: 3000,
    timeLimitMs: 10000,
    expected: 7,
    tags: ["add"],
    difficulty: 3,
    expr: null,
    tiles: null,
    spared: false,
    ...over,
  };
}

function facts(over: Partial<GameFacts> = {}): GameFacts {
  return {
    solo: false,
    game: "standard",
    mode: "speed-race",
    difficulty: 3,
    turnStyle: "simultaneous",
    operations: ["add", "mul"],
    rated: true,
    players: 2,
    accounts: 2,
    endedAt: NOV_NOON,
    rank: 2,
    won: false,
    eligible: true,
    bestStreak: 0,
    rounds: [round()],
    maxDeficit: 0,
    bestOpponentScore: 1,
    firstOut: false,
    bomb: { built: 0, exploded: 0, usedFallback: false },
    ...over,
  };
}

const unlocked = (f: GameFacts | null, counters: Record<string, number> = {}, owned: string[] = []) =>
  evaluateAchievements(f, counters, new Set(owned)).map((u) => u.achievementId);

const hasCheck = (id: string, f: GameFacts) => unlocked(f).includes(id);

describe("catalogue", () => {
  it("n'a pas de doublon, et chaque succès a une condition", () => {
    expect(new Set(ACHIEVEMENT_IDS).size).toBe(ACHIEVEMENT_IDS.length);
    expect(new Set(TITLE_IDS).size).toBe(TITLE_IDS.length);
    for (const a of ACHIEVEMENTS) expect(!!a.target !== !!a.check, a.id).toBe(true);
  });

  it("relie chaque titre à un succès, et réciproquement", () => {
    const offered = ACHIEVEMENTS.flatMap((a) => (a.title ? [a.title] : []));
    expect(new Set(offered).size).toBe(offered.length);
    expect([...offered].sort()).toEqual([...TITLE_IDS].sort());
  });

  it("ne donne un titre de prestige qu'en ligne", () => {
    for (const t of TITLES.filter((t) => t.rarity === "epic" || t.rarity === "legendary")) {
      const source = ACHIEVEMENTS.find((a) => a.title === t.id);
      expect(source?.online, t.id).toBe(true);
    }
  });

  it("a ses textes dans les deux langues", () => {
    for (const locale of ["fr", "en"]) {
      const url = new URL(`../../../apps/web/messages/${locale}.json`, import.meta.url);
      const messages = JSON.parse(readFileSync(url, "utf8")) as {
        achievements: Record<string, { name: string; desc: string }>;
        titles: Record<string, string>;
      };
      for (const id of ACHIEVEMENT_IDS) {
        expect(messages.achievements[id]?.name, `${locale} ${id}`).toBeTruthy();
        expect(messages.achievements[id]?.desc, `${locale} ${id}`).toBeTruthy();
      }
      for (const id of TITLE_IDS) expect(messages.titles[id], `${locale} ${id}`).toBeTruthy();
    }
  });
});

describe("compteurs", () => {
  it("ne compte une victoire que dans une partie classée", () => {
    expect(countersDelta(facts({ won: true })).wins).toBe(1);
    expect(countersDelta(facts({ won: false, rank: 1, rated: false })).wins).toBeUndefined();
  });

  it("détaille la victoire par jeu, mode et niveau", () => {
    expect(countersDelta(facts({ won: true, game: "bomb", mode: "battle-royale", difficulty: 5 }))).toMatchObject({
      games: 1,
      "games:bomb": 1,
      "wins:bomb": 1,
      "wins:battle-royale": 1,
      "wins:level:5": 1,
    });
  });

  it("ignore une partie non éligible, sauf l'élimination d'entrée", () => {
    expect(countersDelta(facts({ eligible: false }))).toEqual({});
    expect(countersDelta(facts({ eligible: false, firstOut: true }))).toEqual({ "first-out": 1 });
  });
});

describe("succès cumulatifs", () => {
  it("se déclenche pile au seuil, une seule fois", () => {
    expect(unlocked(null, { games: 9 })).not.toContain("games-10");
    expect(unlocked(null, { games: 10 })).toContain("games-10");
    expect(unlocked(null, { games: 10 }, ["games-10"])).not.toContain("games-10");
  });

  it("donne le titre avec le succès", () => {
    const u = evaluateAchievements(null, { games: 250 }, new Set());
    expect(u.find((x) => x.achievementId === "games-250")?.titleId).toBe("regular");
    expect(u.find((x) => x.achievementId === "games-1")?.titleId).toBeNull();
  });

  it("exige tous les compteurs d'un succès à plusieurs compteurs", () => {
    const three = { "games:standard": 1, "games:missing": 1, "games:right-count": 1 };
    expect(unlocked(null, three)).not.toContain("all-games");
    expect(unlocked(null, { ...three, "games:bomb": 1 })).toContain("all-games");
  });

  it("borne la progression à sa cible", () => {
    const a = ACHIEVEMENTS.find((x) => x.id === "games-10")!;
    expect(progressOf(a, { games: 4 })).toEqual({ value: 4, target: 10 });
    expect(progressOf(a, { games: 40 })).toEqual({ value: 10, target: 10 });
  });
});

describe("exploits", () => {
  it("n'accorde aucun exploit de vitesse en solo", () => {
    const fast = facts({ rounds: [round({ timeMs: 500 })], solo: true, rated: false });
    expect(hasCheck("sr-flash", fast)).toBe(false);
    expect(hasCheck("buzzer", facts({ solo: true, rounds: [round({ timeMs: 9900 })] }))).toBe(false);
  });

  it("borne la réponse éclair : niveau, opérations, durée", () => {
    const flash = (over: Partial<RoundFacts>, ops: GameSettings["operations"] = ["add", "mul"]) => facts({ operations: ops, rounds: [round({ timeMs: 900, ...over })] });
    expect(hasCheck("sr-flash", flash({}))).toBe(true);
    expect(hasCheck("sr-flash", flash({ timeMs: 1000 }))).toBe(false);
    expect(hasCheck("sr-flash", flash({ difficulty: 2 }))).toBe(false);
    expect(hasCheck("sr-flash", flash({}, ["add"]))).toBe(false);
  });

  it("refuse la grande série en solo, pas la petite", () => {
    expect(hasCheck("streak-10", facts({ solo: true, bestStreak: 50 }))).toBe(true);
    expect(hasCheck("streak-50", facts({ solo: true, bestStreak: 50 }))).toBe(false);
    expect(hasCheck("streak-50", facts({ bestStreak: 50 }))).toBe(true);
    expect(hasCheck("streak-10", facts({ bestStreak: 50, difficulty: 2 }))).toBe(false);
  });

  it("reconnaît une partie presque parfaite en course de vitesse seulement", () => {
    const rounds = [...Array.from({ length: 9 }, () => round()), round({ correct: false })];
    expect(hasCheck("so-close", facts({ rounds }))).toBe(true);
    expect(hasCheck("so-close", facts({ rounds, mode: "battle-royale" }))).toBe(false);
  });

  it("reconnaît toutes les plaques au bon compte", () => {
    const tiles = [1, 2, 3];
    const on = (expr: string) => facts({ game: "right-count", rounds: [round({ tiles, expr })] });
    expect(hasCheck("rc-all-tiles", on("(1 + 2) × 3"))).toBe(true);
    expect(hasCheck("rc-all-tiles", on("1 + 2"))).toBe(false);
  });

  it("lit l'heure à Paris", () => {
    expect(hasCheck("night-owl", facts({ endedAt: Date.UTC(2026, 10, 1, 2, 30) }))).toBe(true); // 3 h 30, heure d'hiver
    expect(hasCheck("night-owl", facts({ endedAt: Date.UTC(2026, 10, 1, 4, 30) }))).toBe(false); // 5 h 30
    expect(hasCheck("pi-day", facts({ endedAt: Date.UTC(2027, 2, 13, 23, 30) }))).toBe(true); // déjà le 14 à Paris
  });

  it("ne donne rien à une partie non éligible", () => {
    expect(hasCheck("answer-42", facts({ eligible: false, rounds: [round({ expected: 42 })] }))).toBe(false);
  });
});

describe("faits d'une partie", () => {
  const input = (engine: GameEngine, over: Partial<FactsInput> = {}): FactsInput => ({
    solo: false,
    settings: engine.settings,
    endedAt: NOV_NOON,
    rated: true,
    accounts: 2,
    standings: engine.standings(),
    history: engine.history,
    ...over,
  });

  it("refuse une partie solo trop courte", () => {
    const settings = { ...defaultSettings(2, "battle-royale"), rounds: 5 };
    const answers: SoloAnswer[] = [{ answer: { value: 999_999 }, timeMs: 100 }];
    const engine = replaySolo(settings, { id: "me", name: "Moi" }, "graine-solo", answers);
    expect(factsOf(input(engine, { solo: true, rated: false, accounts: 1 }), "me")?.eligible).toBe(false);
  });

  it("ne déclare pas gagnant le premier d'une partie non classée", () => {
    const settings = { ...defaultSettings(2, "speed-race"), rounds: 5 };
    const engine = new GameEngine(settings, [{ id: "a", name: "A" }, { id: "b", name: "B" }], "graine");
    let t = 0;
    while (true) {
      const r = engine.startRound(t);
      if (!r) break;
      engine.submit("a", { value: r.question.answer }, t + 100);
      engine.closeRound();
      t += 20_000;
    }
    const a = factsOf(input(engine, { rated: false, accounts: 1 }), "a")!;
    expect(a.rank).toBe(1);
    expect(a.won).toBe(false);
    expect(factsOf(input(engine), "a")?.won).toBe(true);
    expect(factsOf(input(engine), "a")?.bestOpponentScore).toBe(0);
    expect(factsOf(input(engine), "b")?.maxDeficit).toBe(5);
    expect(factsOf(input(engine), "inconnu")).toBeNull();
  });
});
