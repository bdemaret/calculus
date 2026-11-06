import { describe, expect, it } from "vitest";
import {
  BAG_SIZE,
  BOMB_DAMAGE,
  BOSS_HP_PER_PLAYER,
  DIFFICULTIES,
  DUNGEON_FLOORS,
  DUNGEON_MAX_LIVES,
  DUNGEON_START_LIVES,
  DungeonEngine,
  ENEMIES,
  ENEMY_IDS,
  FLOOR_POOLS,
  HOURGLASS_FACTOR,
  ITEM_IDS,
  PURSE_POINTS,
  SEAL_FLOOR_RATIO,
  SEAL_WEAKEN,
  SYMBOL_OPERATION,
  bossQuestion,
  buildDungeon,
  enemyQuestion,
  evaluateText,
  missingGame,
  rollLoot,
  sanitizeDungeonSettings,
  stepsToBoss,
  type BasicOperation,
  type Difficulty,
  type DungeonAnswer,
  type DungeonView,
  type ItemId,
  type MapRoom,
  type OpSymbol,
  type Question,
} from "../src";

const players = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `Joueur ${i}` }));
const engine = (n = 2, difficulty: Difficulty = 1, seed = "graine") => {
  const g = new DungeonEngine({ difficulty }, players(n), seed);
  g.start(0);
  return g;
};

/** Accès aux entrailles du moteur, pour poser une situation précise (sac, salles ouvertes). */
type Internals = { players: { id: string; bag: ItemId[]; lives: number }[]; cleared: Set<string> };
const inside = (g: DungeonEngine) => g as unknown as Internals;
const giveBag = (g: DungeonEngine, id: string, ...items: ItemId[]) => inside(g).players.find((p) => p.id === id)!.bag.push(...items);
/** Ouvre une salle : une salle qui y mène passe pour réussie. */
const openRoom = (g: DungeonEngine, key: string) => {
  const target = g.map.rooms.find((r) => r.key === key)!;
  if (target.floor === 1) return;
  const before = g.map.rooms.find((r) => r.links.includes(key))!;
  inside(g).cleared.add(before.key);
};

/** La bonne réponse au calcul en cours d'un joueur, retrouvée à partir de la vue seule (rien n'y fuit). */
function solve(view: DungeonView): DungeonAnswer {
  const q = view.question;
  if (!q) throw new Error("pas de calcul");
  if (q.puzzle.game !== "missing") return { value: evaluateText(q.text) };
  const probe = { puzzle: q.puzzle } as Question;
  if (q.puzzle.hole === "operator") {
    const op = (["add", "sub", "mul", "div"] as BasicOperation[]).find((o) => missingGame.check(probe, { op: o }));
    return { op: op! };
  }
  for (let v = 0; v < 30_000; v++) if (missingGame.check(probe, { value: v })) return { value: v };
  throw new Error(`sans solution : ${q.text}`);
}
const wrongOf = (a: DungeonAnswer): DungeonAnswer => ("value" in a ? { value: a.value + 1 } : { op: a.op === "add" ? "sub" : "add" });

/** Fait réussir sa série à un joueur, un calcul toutes les 100 ms. Renvoie l'heure de fin. */
function clearSeries(g: DungeonEngine, id: string, now: number): number {
  let t = now;
  for (let guard = 0; guard < 60; guard++) {
    const v = g.view(id, t);
    const me = v.players.find((p) => p.id === id)!;
    if (!v.question || me.fight?.status !== "fighting") return t;
    const answer = solve(v);
    t += 100;
    const r = g.submit(id, answer, t);
    expect(r.accepted && r.correct).toBe(true);
    if (r.done) return t;
  }
  throw new Error("série sans fin");
}

/** Une salle accessible au plus court vers le boss (hors coffres), pour avancer vite. */
const bestRoom = (g: DungeonEngine): MapRoom => {
  const memo = new Map<string, number>();
  return g
    .accessible()
    .filter((r) => r.kind !== "chest" && r.kind !== "mimic")
    .sort((a, b) => stepsToBoss(g.map, a, memo) - stepsToBoss(g.map, b, memo))[0]!;
};

/** Une manche où toute l'équipe va dans la même salle et la réussit. */
function winRound(g: DungeonEngine, now: number, key = bestRoom(g).key): number {
  for (const p of g.view("", now).players) if (p.standing) expect(g.pick(p.id, key)).toEqual({ ok: true });
  g.closePositioning(now);
  let t = now;
  for (const p of g.view("", now).players) if (p.standing) t = Math.max(t, clearSeries(g, p.id, now));
  g.closeCombat(t);
  if (g.phase === "loot") g.closeLoot(t);
  g.advance(t);
  return t;
}

/* ------------------------------------------------------------------ */

describe("donjon : réglages et carte", () => {
  it("ne garde qu'une difficulté valide", () => {
    expect(sanitizeDungeonSettings({ difficulty: 4 })).toEqual({ difficulty: 4 });
    expect(sanitizeDungeonSettings({ difficulty: 9 })).toEqual({ difficulty: 1 });
    expect(sanitizeDungeonSettings(null)).toEqual({ difficulty: 1 });
  });

  it("tire une carte en réseau déterministe, toujours jouable", () => {
    for (let n = 2; n <= 4; n++) {
      for (let s = 0; s < 300; s++) {
        const map = buildDungeon(`s${s}`, n);
        expect(map).toEqual(buildDungeon(`s${s}`, n));
        const byKey = new Map(map.rooms.map((r) => [r.key, r]));
        const floor = (f: number) => map.rooms.filter((r) => r.floor === f);
        expect(new Set(map.rooms.map((r) => r.floor))).toEqual(new Set([1, 2, 3, 4]));
        // L'entrée : que des ennemis.
        expect(floor(1).every((r) => r.kind === "enemy")).toBe(true);
        // Toute salle au-delà de l'entrée a un passage qui y mène, depuis l'étage du dessous.
        for (const r of map.rooms.filter((x) => x.floor > 1)) {
          const from = map.rooms.filter((x) => x.links.includes(r.key));
          expect(from.length).toBeGreaterThan(0);
          expect(from.every((x) => x.floor === r.floor - 1)).toBe(true);
        }
        for (const r of map.rooms) for (const k of r.links) expect(byKey.get(k)!.floor).toBe(r.floor + 1);
        // Un seul dragon, au 3e étage, qui mène au boss ; 1 ou 2 portes au 4e.
        const dragons = map.rooms.filter((r) => r.enemy === "dragon");
        expect(dragons).toHaveLength(1);
        expect(dragons[0]).toMatchObject({ floor: 3, bossLink: true });
        expect(floor(4).filter((r) => r.bossLink)).toHaveLength(n <= 2 ? 1 : 2);
        // Le boss est atteignable en 4 salles au plus (3 par le dragon).
        const memo = new Map<string, number>();
        expect(Math.min(...floor(1).map((r) => stepsToBoss(map, r, memo)))).toBe(3);
        // Coffres sans ennemi, mimiques avec ; au plus 2 sceaux, sur des branches qui mènent au boss.
        for (const r of map.rooms) {
          if (r.kind === "chest") expect(r).toMatchObject({ enemy: null, loot: true });
          if (r.kind === "mimic") expect(r.enemy).toBe("mimic");
          if (r.kind === "enemy" && r.enemy !== "dragon") expect(FLOOR_POOLS[r.floor - 1]).toContain(r.enemy);
        }
        const seals = map.rooms.filter((r) => r.kind === "seal");
        expect(seals.length).toBeLessThanOrEqual(2);
        for (const s2 of seals) expect(stepsToBoss(map, s2, new Map())).toBeLessThan(Infinity);
        // Il y a du butin quelque part.
        expect(map.rooms.some((r) => r.kind === "chest" || r.kind === "mimic")).toBe(true);
      }
    }
  });
});

describe("donjon : calculs des ennemis", () => {
  it("pose des calculs justes, de la bonne forme, à tous les niveaux et étages", () => {
    for (const difficulty of DIFFICULTIES) {
      for (const id of ENEMY_IDS) {
        for (let floor = 0; floor < DUNGEON_FLOORS; floor++) {
          const profile = ENEMIES[id].profile(difficulty, floor);
          expect(profile.count).toBeGreaterThan(0);
          for (let i = 0; i < 60; i++) {
            const q = enemyQuestion("graine", floor, `1-${floor}`, id, floor, difficulty, `p${i % 3}`, i);
            if (profile.question === "missing-number") {
              expect(q.puzzle).toMatchObject({ game: "missing", hole: "number" });
              expect(missingGame.check(q, { value: Number(q.solution) })).toBe(true);
            } else if (profile.question === "missing-operator") {
              expect(q.puzzle).toMatchObject({ game: "missing", hole: "operator" });
              expect(missingGame.check(q, { op: SYMBOL_OPERATION[q.solution as OpSymbol] })).toBe(true);
            } else {
              expect(evaluateText(q.text)).toBe(q.answer);
              expect(q.answer).toBeGreaterThan(0);
              for (const tag of q.tags) if (tag !== "paren") expect(profile.operations).toContain(tag);
            }
          }
        }
      }
    }
  });

  it("le cyclope pose un seul gros calcul ; le squelette a de moins en moins de temps", () => {
    const cyclops = ENEMIES.cyclops.profile(3, 2);
    expect(cyclops.count).toBe(1);
    expect(enemyQuestion("g", 0, "2-0", "cyclops", 2, 3, "p0", 0).text.split(/[+−×÷]/).length).toBeGreaterThanOrEqual(4);
    const skel = ENEMIES.skeleton.profile(1, 0);
    expect(skel.timeStepMs).toBeGreaterThan(0);
  });

  it("le boss pose des calculs justes à tous les niveaux", () => {
    for (const difficulty of DIFFICULTIES) for (let i = 0; i < 50; i++) expect(evaluateText(bossQuestion("g", difficulty, "p0", i).text)).toBe(bossQuestion("g", difficulty, "p0", i).answer);
  });
});

describe("donjon : exploration", () => {
  it("on ne choisit qu'une salle accessible ; une salle réussie ouvre les suivantes", () => {
    const g = engine();
    const deep = g.map.rooms.find((r) => r.floor === 2)!;
    expect(g.pick("p0", deep.key)).toEqual({ ok: false, reason: "no-room" });
    expect(g.pick("p9", "1-0")).toEqual({ ok: false, reason: "unknown-player" });
    const room = bestRoom(g);
    winRound(g, 0, room.key);
    const open = new Set(g.accessible().map((r) => r.key));
    for (const k of room.links) expect(open.has(k)).toBe(true);
    expect(open.has(room.key)).toBe(false);
  });

  it("exige 100 % ; un échec coûte une vie même si l'allié a réussi la salle", () => {
    const g = engine(2, 1, "cent");
    const room = g.accessible().find((r) => (ENEMIES[r.enemy!].profile(1, 0).form ?? "solo") === "solo")!;
    g.pick("p0", room.key);
    g.pick("p1", room.key);
    g.closePositioning(0);
    g.submit("p0", wrongOf(solve(g.view("p0", 0))), 50);
    const t = clearSeries(g, "p1", 50);
    const out = g.closeCombat(t)!;
    expect(out.cleared).toEqual([room.key]);
    expect(out.fights.find((f) => f.playerId === "p0")!.failure).toMatchObject({ solution: expect.any(String) });
    expect(g.view("", t).players.map((p) => p.lives)).toEqual([DUNGEON_START_LIVES - 1, DUNGEON_START_LIVES]);
  });

  it("perd dès que le boss ne peut plus être atteint à temps", () => {
    const g = engine();
    let rounds = 0;
    while (!g.isOver && rounds < DUNGEON_FLOORS) {
      g.closePositioning(rounds * 100_000);
      for (const p of g.view("", 0).players) if (p.fight?.status === "fighting") g.submit(p.id, { value: -1 }, rounds * 100_000 + 10);
      g.closeCombat(rounds * 100_000 + 20);
      if (g.phase === "loot") g.closeLoot(rounds * 100_000 + 30);
      if (!g.isOver) g.advance(rounds * 100_000 + 40);
      rounds += 1;
    }
    expect(g.lossReason).toBe("boss-not-reached");
    // Au plus court, le boss est à 3 salles : deux manches ratées suffisent à le rendre inaccessible.
    expect(rounds).toBe(2);
  });

  it("atteint le boss par le plus court chemin, puis le bat ; les PV dépendent des sceaux", () => {
    const g = engine(2, 1, "chemin");
    let t = 0;
    while (g.phase !== "boss" && !g.isOver) {
      if (g.bossReached) {
        // Le boss est ouvert : on finit les manches d'exploration au plus simple.
        t = winRound(g, t, g.accessible().filter((r) => r.kind !== "mimic")[0]!.key);
      } else t = winRound(g, t);
    }
    expect(g.phase).toBe("boss");
    const v = g.view("p0", t);
    const ratio = Math.max(SEAL_FLOOR_RATIO, 1 - SEAL_WEAKEN * v.sealsBroken);
    expect(v.boss!.maxHp).toBe(Math.round(BOSS_HP_PER_PLAYER * 2 * ratio));
    let now = t;
    for (let hit = 0; hit < v.boss!.maxHp; hit++) {
      const id = hit % 2 ? "p1" : "p0";
      now += 100;
      expect(g.submit(id, solve(g.view(id, now)), now).correct).toBe(true);
    }
    expect(g.outcome).toBe("won");
  });

  it("un coffre se prend sans combat et donne un objet ; une mimique est un vrai combat", () => {
    for (let s = 0; s < 500; s++) {
      const g = engine(2, 1, `coffre${s}`);
      const chest = g.map.rooms.find((r) => r.kind === "chest" && r.floor === 2);
      if (!chest) continue;
      openRoom(g, chest.key);
      g.pick("p0", chest.key);
      g.pick("p1", chest.key);
      g.closePositioning(0);
      // Personne n'a de série : la manche se clôt aussitôt, avec le butin.
      expect(g.phase).toBe("loot");
      expect(g.loot).toHaveLength(1);
      expect(g.loot[0]).toMatchObject({ roomKey: chest.key, holderId: "p0", item: rollLoot(`coffre${s}`, chest.key, "chest") });
      return;
    }
    throw new Error("aucune carte avec un coffre au 2e étage");
  });

  it("le brouillard ne montre jamais une salle lointaine, ni une mimique avant qu'on y entre", () => {
    for (let s = 0; s < 50; s++) {
      const g = engine(3, 2, `brume${s}`);
      const v = g.view("p0", 0);
      for (const r of v.rooms) {
        if (r.visibility === "hidden") expect(r).toMatchObject({ kind: null, enemy: null });
        if (r.visibility === "type") expect(r.enemy).toBeNull();
        if (r.floor >= 3) expect(r.visibility).toBe("hidden");
      }
      expect(JSON.stringify(v)).not.toContain('"mimic"');
      // Une mimique se montre comme un coffre une fois approchée ; démasquée seulement quand on y entre.
      const mimic = g.map.rooms.find((r) => r.kind === "mimic");
      if (!mimic) continue;
      openRoom(g, mimic.key);
      expect(g.view("p0", 0).rooms.find((r) => r.key === mimic.key)).toMatchObject({ visibility: "known", kind: "chest", enemy: null });
      g.pick("p0", mimic.key);
      g.closePositioning(0);
      expect(g.view("p0", 0).rooms.find((r) => r.key === mimic.key)).toMatchObject({ kind: "mimic", enemy: "mimic" });
    }
  });

  it("n'envoie jamais la réponse d'un calcul en cours, et cache l'énoncé d'une momie après une seconde", () => {
    for (let s = 0; s < 400; s++) {
      const g = engine(2, 2, `momie${s}`);
      const mummy = g.map.rooms.find((r) => r.enemy === "mummy" && r.floor === 2);
      if (!mummy) continue;
      openRoom(g, mummy.key);
      g.pick("p0", mummy.key);
      g.closePositioning(0);
      const shown = g.view("p0", 999);
      expect(shown.question!.text).not.toBe("");
      expect(Object.keys(shown.question!)).not.toContain("answer");
      expect(g.view("p0", 1000).question).toMatchObject({ text: "", hidden: true });
      expect(g.submit("p0", solve(shown), 2000).correct).toBe(true);
      return;
    }
    throw new Error("aucune momie au 2e étage");
  });
});

describe("donjon : formes de combat", () => {
  /** Une carte où l'ennemi voulu est à l'étage donné, ouvert d'office. */
  const withEnemy = (enemy: string, floor = 2, n = 2) => {
    for (let s = 0; s < 2000; s++) {
      const g = engine(n, 1, `${enemy}${s}`);
      const room = g.map.rooms.find((r) => r.enemy === enemy && r.floor === floor && r.kind === "enemy");
      if (!room) continue;
      openRoom(g, room.key);
      return { g, room };
    }
    throw new Error(`pas de ${enemy} à l'étage ${floor}`);
  };

  it("hydre : une erreur ajoute deux calculs sans faire échouer ; le chrono global finit la série", () => {
    const { g, room } = withEnemy("hydra", 3);
    g.pick("p0", room.key);
    g.pick("p1", room.key);
    g.closePositioning(0);
    const before = g.view("p0", 0).question!.count!;
    const r = g.submit("p0", wrongOf(solve(g.view("p0", 0))), 100);
    expect(r).toMatchObject({ accepted: true, correct: false, done: false });
    expect(g.view("p0", 100).question!.count).toBe(before + 2);
    const deadline = g.view("p1", 0).question!.deadline!;
    expect(g.expire(deadline + 1)).toBe(true);
    expect(g.view("p0", deadline + 1).players.every((p) => p.fight?.status === "failed")).toBe(true);
  });

  it("horde : une série commune, chaque bonne réponse de n'importe qui retire un gobelin", () => {
    const { g, room } = withEnemy("goblins");
    g.pick("p0", room.key);
    g.pick("p1", room.key);
    g.closePositioning(0);
    const total = g.view("p0", 0).pools[0]!.total;
    let t = 0;
    for (let i = 0; i < total; i++) {
      const id = i % 2 ? "p1" : "p0";
      t += 50;
      const res = g.submit(id, solve(g.view(id, t)), t);
      expect(res.correct).toBe(true);
    }
    expect(g.view("p0", t).pools[0]!.remaining).toBe(0);
    expect(g.combatOver).toBe(true);
    expect(g.closeCombat(t)!.cleared).toEqual([room.key]);
  });

  it("horde : le temps écoulé fait échouer tous ceux qui l'affrontent", () => {
    const { g, room } = withEnemy("goblins");
    g.pick("p0", room.key);
    g.pick("p1", room.key);
    g.closePositioning(0);
    const end = g.view("p0", 0).pools[0]!.endsAt;
    g.expire(end + 1);
    expect(g.closeCombat(end + 1)!.cleared).toEqual([]);
  });

  it("spectre : la réponse est un opérateur", () => {
    const { g, room } = withEnemy("specter");
    g.pick("p0", room.key);
    g.closePositioning(0);
    const v = g.view("p0", 0);
    expect(v.question!.answerKind).toBe("op");
    const a = solve(v);
    expect("op" in a).toBe(true);
    expect(g.submit("p0", a, 100).correct).toBe(true);
    expect(g.submit("p0", { value: 1 }, 200).correct).toBe(false);
  });

  it("squelette : chaque calcul a moins de temps que le précédent", () => {
    const { g, room } = withEnemy("skeleton");
    g.pick("p0", room.key);
    g.closePositioning(0);
    const first = g.view("p0", 0).question!.timerMs!;
    g.submit("p0", solve(g.view("p0", 0)), 100);
    expect(g.view("p0", 100).question!.timerMs!).toBeLessThan(first);
  });
});

describe("donjon : butin et sac", () => {
  it("les tirages sont déterministes et ne donnent que des objets connus", () => {
    for (let i = 0; i < 200; i++) {
      for (const source of ["chest", "rare"] as const) {
        const item = rollLoot("g", `${i}`, source);
        expect(ITEM_IDS).toContain(item);
        expect(rollLoot("g", `${i}`, source)).toBe(item);
      }
    }
  });

  it("bouclier : le prochain échec ne coûte pas de vie ; plume de phénix : relève à 1 vie", () => {
    const g = engine();
    giveBag(g, "p0", "shield");
    giveBag(g, "p1", "phoenix");
    inside(g).players[1]!.lives = 1;
    const room = bestRoom(g);
    g.pick("p0", room.key);
    g.pick("p1", room.key);
    g.closePositioning(0);
    g.submit("p0", { value: -1 }, 10);
    g.submit("p1", { value: -1 }, 10);
    g.closeCombat(20);
    const v = g.view("", 20);
    expect(v.players[0]).toMatchObject({ lives: DUNGEON_START_LIVES, bag: [] });
    expect(v.players[1]).toMatchObject({ lives: 1, bag: [] });
  });

  it("sablier et seconde chance s'activent au positionnement, pour la série suivante", () => {
    const g = engine(2, 1, "buffs");
    const room = g.accessible().find((r) => (ENEMIES[r.enemy!].profile(1, 0).form ?? "solo") === "solo" && !ENEMIES[r.enemy!].profile(1, 0).timeStepMs)!;
    giveBag(g, "p0", "hourglass", "second-chance");
    expect(g.useItem("p0", "hourglass")).toEqual({ ok: true });
    expect(g.useItem("p0", "second-chance")).toEqual({ ok: true });
    expect(g.useItem("p0", "hourglass")).toEqual({ ok: false, reason: "no-item" });
    g.pick("p0", room.key);
    g.pick("p1", room.key);
    g.closePositioning(0);
    expect(g.view("p0", 0).question!.timerMs).toBe(Math.round(g.view("p1", 0).question!.timerMs! * HOURGLASS_FACTOR));
    // Première erreur pardonnée, la seconde non.
    expect(g.submit("p0", { value: -1 }, 10)).toMatchObject({ accepted: true, correct: false, done: false });
    expect(g.submit("p0", { value: -1 }, 20)).toMatchObject({ done: true });
  });

  it("clé : une salle accessible franchie sans combat ni points ; carte : plus de brouillard ; bannière : une vie pour tous", () => {
    const g = engine(2, 1, "objets");
    giveBag(g, "p0", "key", "map");
    giveBag(g, "p1", "banner");
    const room = bestRoom(g);
    expect(g.useItem("p0", "key", "4-0")).toEqual({ ok: false, reason: "no-room" });
    expect(g.useItem("p0", "key", room.key)).toEqual({ ok: true });
    expect(g.accessible().map((r) => r.key)).toEqual(expect.arrayContaining(room.links));
    expect(g.score).toBe(0);
    expect(g.useItem("p0", "map")).toEqual({ ok: true });
    expect(g.view("p0", 0).rooms.every((r) => r.visibility === "known")).toBe(true);
    expect(g.useItem("p1", "banner")).toEqual({ ok: true });
    expect(g.view("", 0).players.map((p) => p.lives)).toEqual([DUNGEON_START_LIVES + 1, DUNGEON_START_LIVES + 1]);
    // Les objets passifs ne s'utilisent pas.
    giveBag(g, "p1", "shield");
    expect(g.useItem("p1", "shield")).toEqual({ ok: false, reason: "passive" });
  });

  it("sac de deux places : donner, jeter, refuser quand il est plein", () => {
    const g = engine();
    giveBag(g, "p0", "shield", "map");
    giveBag(g, "p1", "key", "purse");
    expect(g.giveItem("p0", "p1", "shield")).toEqual({ ok: false, reason: "bag-full" });
    expect(g.dropItem("p1", "purse")).toEqual({ ok: true });
    expect(g.giveItem("p0", "p1", "shield")).toEqual({ ok: true });
    expect(g.view("", 0).players.map((p) => p.bag.length)).toEqual([1, BAG_SIZE]);
  });

  it("bombe : -3 PV au boss ; bourse : des points en fin d'expédition", () => {
    const g = engine(2, 1, "chemin");
    giveBag(g, "p1", "purse");
    let t = 0;
    while (g.phase !== "boss" && !g.isOver) t = g.bossReached ? winRound(g, t, g.accessible().filter((r) => r.kind !== "mimic")[0]!.key) : winRound(g, t);
    expect(g.phase).toBe("boss");
    giveBag(g, "p0", "bomb");
    const before = g.view("", t).boss!.hp;
    expect(g.useItem("p0", "bomb")).toEqual({ ok: true });
    expect(g.view("", t).boss!.hp).toBe(before - BOMB_DAMAGE);
    const score = g.score;
    g.expire(g.view("", t).boss!.endsAt + 1);
    expect(g.score).toBe(score + PURSE_POINTS);
  });

  it("le butin d'une salle va au plus rapide, qui le donne ; un cœur relève un allié à terre", () => {
    for (let s = 0; s < 500; s++) {
      const g = engine(2, 1, `soin${s}`);
      const chest = g.map.rooms.find((r) => r.kind === "chest" && r.floor === 2 && rollLoot(`soin${s}`, r.key, "chest") === "heart");
      if (!chest) continue;
      openRoom(g, chest.key);
      inside(g).players[1]!.lives = 0;
      g.pick("p0", chest.key);
      g.closePositioning(0);
      expect(g.giveLoot("p1", "p1")).toEqual({ ok: false, reason: "no-loot" });
      expect(g.giveLoot("p0", "p1")).toEqual({ ok: true });
      expect(g.lootDone).toBe(true);
      expect(g.view("", 0).players[1]).toMatchObject({ lives: 1, standing: true });
      expect(g.summary().players[1]).toMatchObject({ heartsReceived: 1 });
      expect(DUNGEON_MAX_LIVES).toBeGreaterThan(DUNGEON_START_LIVES);
      return;
    }
    throw new Error("aucun cœur au 2e étage");
  });
});

describe("donjon : départs et rejeu", () => {
  it("un départ rate la série en cours ; plus personne debout, c'est perdu", () => {
    const g = engine();
    g.closePositioning(0);
    g.leave("p0", 10);
    expect(g.view("p0", 10).players[0]!.fight?.status === "failed" || g.view("p0", 10).players[0]!.fight?.status === "won").toBe(true);
    g.leave("p1", 20);
    expect(g.lossReason).toBe("team-down");
  });

  it("une même graine rejoue la même expédition", () => {
    const run = () => {
      const g = engine(3, 2, "rejeu");
      let t = 0;
      for (let r = 0; r < 2; r++) t = winRound(g, t);
      return { view: g.view("p0", t), summary: g.summary() };
    };
    expect(run()).toEqual(run());
  });
});
