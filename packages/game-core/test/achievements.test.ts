import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ACHIEVEMENT_IDS,
  ACHIEVEMENTS,
  DEFAULT_TITLE_ID,
  GameEngine,
  NO_TITLE,
  TITLES,
  TITLE_IDS,
  countersDelta,
  defaultSettings,
  dungeonFactsOf,
  evaluateAchievements,
  evaluateDungeonAchievements,
  factsOf,
  progressOf,
  replaySolo,
  wornTitle,
  type DungeonSummary,
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
    // Une seule condition : un compteur, un exploit de partie, ou un exploit d'expédition.
    for (const a of ACHIEVEMENTS) expect([a.target, a.check, a.dungeonCheck].filter(Boolean).length, a.id).toBe(1);
  });

  it("relie chaque titre à un succès, et réciproquement", () => {
    const offered = ACHIEVEMENTS.flatMap((a) => (a.title ? [a.title] : []));
    expect(new Set(offered).size).toBe(offered.length);
    expect([...offered].sort()).toEqual(TITLE_IDS.filter((id) => id !== DEFAULT_TITLE_ID).sort());
  });

  it("donne le titre par défaut à un compte qui n'en a pas choisi", () => {
    expect(TITLE_IDS).toContain(DEFAULT_TITLE_ID);
    expect(wornTitle(null)).toBe(DEFAULT_TITLE_ID);
    expect(wornTitle("regular")).toBe("regular");
    expect(wornTitle(NO_TITLE)).toBeNull();
    expect(TITLE_IDS).not.toContain(NO_TITLE);
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

describe("donjons", () => {
  const summary = (over: Partial<DungeonSummary> = {}, player: Partial<DungeonSummary["players"][number]> = {}): DungeonSummary => ({
    difficulty: 2,
    outcome: "won",
    lossReason: null,
    roundsPlayed: 5,
    score: 2000,
    bossMaxHp: 13,
    bossHp: 0,
    enemiesDefeated: 4,
    sealsBroken: 1,
    players: [
      {
        id: "a",
        name: "Ada",
        lives: 2,
        livesLost: 1,
        enemiesDefeated: 2,
        points: 900,
        bossDamage: 7,
        heartsGiven: 0,
        heartsReceived: 0,
        itemsFound: 1,
        correct: 18,
        answered: 20,
        avgTimeMs: 2500,
        gone: false,
        ...player,
      },
      { id: "b", name: "Bob", lives: 3, livesLost: 0, enemiesDefeated: 2, points: 800, bossDamage: 6, heartsGiven: 0, heartsReceived: 0, itemsFound: 0, correct: 15, answered: 15, avgTimeMs: 3000 },
    ],
    ...over,
  });
  const earned = (s: DungeonSummary, counters: Record<string, number> = {}, owned: string[] = []) =>
    evaluateDungeonAchievements(dungeonFactsOf(s, "a")!, counters, new Set(owned)).map((u) => u.achievementId);

  it("les expéditions réussies : 1 (titre Aventurier), 10, 100 (titre Fléau des donjons)", () => {
    expect(evaluateDungeonAchievements(dungeonFactsOf(summary(), "a")!, { "dungeon-wins": 1 }, new Set())).toContainEqual({
      achievementId: "dungeon-wins-1",
      titleId: "adventurer",
    });
    expect(earned(summary(), { "dungeon-wins": 9 }, ["dungeon-wins-1"])).not.toContain("dungeon-wins-10");
    expect(earned(summary(), { "dungeon-wins": 10 }, ["dungeon-wins-1"])).toContain("dungeon-wins-10");
    expect(earned(summary(), { "dungeon-wins": 100 }, ["dungeon-wins-1", "dungeon-wins-10"])).toContain("dungeon-wins-100");
    expect(ACHIEVEMENTS.find((a) => a.id === "dungeon-wins-100")?.title).toBe("dungeon-scourge");
  });

  it("expédition parfaite : victoire, tous les calculs réussis, 10 au moins", () => {
    expect(earned(summary({}, { correct: 20, answered: 20 }))).toContain("dungeon-perfect");
    expect(earned(summary({}, { correct: 19, answered: 20 }))).not.toContain("dungeon-perfect");
    expect(earned(summary({}, { correct: 9, answered: 9 }))).not.toContain("dungeon-perfect");
    expect(earned(summary({ outcome: "lost", lossReason: "boss-timeout" }, { correct: 20, answered: 20 }))).not.toContain("dungeon-perfect");
  });

  it("succès caché : l'expédition échoue sans un seul ennemi vaincu", () => {
    const lost = summary({ outcome: "lost", lossReason: "boss-not-reached", roundsPlayed: 2, enemiesDefeated: 0, bossMaxHp: null, bossHp: null });
    expect(earned(lost)).toEqual(["dungeon-wiped"]);
    expect(earned({ ...lost, enemiesDefeated: 1 })).not.toContain("dungeon-wiped");
    expect(ACHIEVEMENTS.find((a) => a.id === "dungeon-wiped")?.secret).toBe(true);
  });

  it("légende, dernière vie, équipe de quatre, ange gardien", () => {
    expect(earned(summary({ difficulty: 5 }))).toContain("dungeon-legend");
    expect(earned(summary({ difficulty: 4 }))).not.toContain("dungeon-legend");
    expect(earned(summary({}, { lives: 1 }))).toContain("dungeon-last-life");
    const four = summary();
    four.players.push({ ...four.players[1]!, id: "c" }, { ...four.players[1]!, id: "d" });
    expect(earned(four)).toContain("dungeon-full-party");
    expect(earned(summary())).not.toContain("dungeon-full-party");
    expect(earned(summary(), { "dungeon-hearts": 10 })).toContain("dungeon-guardian-10");
  });

  it("parti avant la fin : aucun exploit", () => {
    expect(earned(summary({ difficulty: 5 }, { gone: true, lives: 1, correct: 20, answered: 20 }))).toEqual([]);
  });

  it("une partie ordinaire ne débloque jamais un exploit de donjon", () => {
    const dungeonOnly = ACHIEVEMENTS.filter((a) => a.dungeonCheck).map((a) => a.id);
    expect(dungeonOnly.length).toBeGreaterThan(0);
    for (const a of ACHIEVEMENTS.filter((a) => a.dungeonCheck)) {
      expect(a.check).toBeUndefined();
      expect(a.category).toBe("dungeon");
      expect(a.online).toBe(true);
    }
  });
});

describe("donjons : joueur porté par l'équipe", () => {
  it("une victoire sans une seule bonne réponse ne donne aucun exploit", () => {
    const facts = { won: true, difficulty: 5, players: 4, enemiesDefeated: 6, gone: false, lives: 1, correct: 0, answered: 3, heartsGiven: 0 } as const;
    expect(evaluateDungeonAchievements(facts, {}, new Set())).toEqual([]);
    expect(evaluateDungeonAchievements({ ...facts, correct: 1 }, {}, new Set()).map((u) => u.achievementId)).toEqual(
      expect.arrayContaining(["dungeon-legend", "dungeon-last-life", "dungeon-full-party"]),
    );
  });
});
