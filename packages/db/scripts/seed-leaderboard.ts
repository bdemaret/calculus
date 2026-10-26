/**
 * Données de test pour le classement, à lancer sur la base locale uniquement.
 *
 *   pnpm --filter @calculus/db seed:leaderboard [--me <e-mail>]   (re)crée les joueurs et les parties
 *   pnpm --filter @calculus/db seed:leaderboard --clean           retire tout ce que le script a ajouté
 *
 * Simule des parties classées entre faux joueurs (comptes `seed-…`, parties au code `SEEDLB`)
 * avec le vrai calcul d'Elo de game-core : placement, ex æquo, victoires et Elo sont cohérents.
 * `--me` mêle un vrai compte aux parties pour voir « Ta place » : classé en battle royale Moyen,
 * hors du top 100 en battle royale Facile, en placement en course de vitesse Moyen.
 * Tirages pseudo-aléatoires à graine fixe : deux lancements donnent les mêmes données.
 */
import { GAME_MODES, INITIAL_RATING, PLACEMENT_GAMES, computeRatingChanges, type GameModeId } from "@calculus/game-core";
import { prisma } from "../src/index";

const SEED_CODE = "SEEDLB";
const SEED_PREFIX = "seed-";
const ROUNDS = 15;

/** Joueurs et parties simulés par mode et difficulté ; course de vitesse Légende reste vide (classement vide). */
const PLAN: Record<GameModeId, [players: number, games: number][]> = {
  "battle-royale": [
    [230, 2600],
    [160, 1600],
    [90, 900],
    [40, 400],
    [12, 80],
  ],
  "speed-race": [
    [180, 2000],
    [120, 1200],
    [60, 600],
    [20, 150],
    [0, 0],
  ],
};

/** Niveau du vrai compte (`--me`) et nombre de parties qu'il joue, par mode et difficulté (absent : aucune partie). */
const ME_PLAN: Partial<Record<string, { skill: number; games: number }>> = {
  "battle-royale:2": { skill: 1.2, games: 30 },
  "battle-royale:1": { skill: -1.5, games: 20 },
  "speed-race:2": { skill: 0.5, games: PLACEMENT_GAMES - 2 },
};

const NAMES = [
  "Gauss", "Euler", "Pascal", "Fermat", "Noether", "Lovelace", "Hypatie", "Turing", "Leibniz", "Galois",
  "Riemann", "Cantor", "Hilbert", "Ramanujan", "Germain", "Kovalevskaïa", "Descartes", "Laplace", "Fourier", "Poincaré",
  "Pythagore", "Thalès", "Euclide", "Archimède", "Fibonacci", "Napier", "Bernoulli", "Lagrange", "Cauchy", "Abel",
];
const SUFFIXES = ["", "42", "_pro", "Junior", "77", "Express", "Turbo", "2000", "_fr", "Rapide"];

/* Générateur pseudo-aléatoire à graine fixe (mulberry32). */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const random = rng(20261026);
const gauss = () => Math.sqrt(-2 * Math.log(1 - random())) * Math.cos(2 * Math.PI * random());
const pick = <T>(xs: T[]) => xs[Math.floor(random() * xs.length)]!;

/** Retire tout ce que le script a ajouté ; l'Elo d'un vrai compte n'est gardé que s'il vient de vraies parties classées. */
async function clean() {
  const games = await prisma.game.deleteMany({ where: { code: SEED_CODE } });
  const users = await prisma.user.deleteMany({ where: { id: { startsWith: SEED_PREFIX } } });
  let ratings = 0;
  for (const r of await prisma.rating.findMany({ select: { userId: true, mode: true, difficulty: true } })) {
    const real = await prisma.gamePlayer.count({
      where: { userId: r.userId, ratingGames: { not: null }, game: { mode: r.mode, difficulty: r.difficulty } },
    });
    if (real) continue;
    await prisma.rating.delete({ where: { userId_mode_difficulty: r } });
    ratings += 1;
  }
  console.log(`Nettoyé : ${games.count} parties, ${users.count} faux joueurs, ${ratings} Elo de vrais comptes.`);
}

interface SimPlayer {
  userId: string;
  name: string;
  skill: number;
  /** Poids de tirage : certains jouent beaucoup, d'autres presque jamais (restent en placement). */
  activity: number;
  /** Parties encore à jouer pour un vrai compte (quota fixe), undefined pour un faux joueur */
  quota?: number;
}

async function seed(meEmail: string | undefined) {
  await clean();
  const me = meEmail ? await prisma.user.findUnique({ where: { email: meEmail }, select: { id: true, name: true } }) : null;
  if (meEmail && !me) throw new Error(`Aucun compte avec l'e-mail ${meEmail}`);

  const total = Math.max(...Object.values(PLAN).flat().map(([n]) => n));
  const fakes = Array.from({ length: total }, (_, i) => ({
    id: `${SEED_PREFIX}${String(i + 1).padStart(3, "0")}`,
    name: `${NAMES[i % NAMES.length]}${SUFFIXES[Math.floor(i / NAMES.length) % SUFFIXES.length]}`,
    skill: gauss(),
  }));
  await prisma.user.createMany({
    data: fakes.map((f) => ({ id: f.id, name: f.name, email: `${f.id}@calculus.test`, emailVerified: true })),
  });

  const games: { id: string; mode: string; difficulty: number; endedAt: Date }[] = [];
  const players: {
    gameId: string;
    userId: string;
    name: string;
    rank: number;
    skill: number;
    before: number;
    delta: number;
    games: number;
  }[] = [];
  const ratings: { userId: string; mode: string; difficulty: number; rating: number; games: number }[] = [];
  const now = Date.now();

  for (const mode of GAME_MODES) {
    for (const [d, [count, gameCount]] of PLAN[mode].entries()) {
      const difficulty = d + 1;
      const pool: SimPlayer[] = fakes.slice(0, count).map((f) => ({
        userId: f.id,
        name: f.name,
        skill: f.skill + gauss() * 0.3,
        activity: Math.exp(gauss()),
      }));
      const mine = me ? ME_PLAN[`${mode}:${difficulty}`] : undefined;
      if (me && mine) pool.push({ userId: me.id, name: me.name, skill: mine.skill, activity: 0, quota: mine.games });
      if (!gameCount) continue;
      /** Le vrai compte joue une partie sur `meEvery`, jusqu'à son quota. */
      const meEvery = mine ? Math.floor(gameCount / mine.games) : 0;
      const state = new Map(pool.map((p) => [p.userId, { rating: INITIAL_RATING, games: 0 }]));
      const weight = pool.reduce((s, p) => s + p.activity, 0);
      const draw = () => {
        let x = random() * weight;
        for (const p of pool) if ((x -= p.activity) <= 0) return p;
        return pool[pool.length - 1]!;
      };

      for (let g = 0; g < gameCount; g++) {
        // 2 à 8 joueurs ; le vrai compte est ajouté régulièrement jusqu'à son quota.
        const size = 2 + Math.floor(random() * 7);
        const table = new Map<string, SimPlayer>();
        const meP = pool.find((p) => p.quota);
        if (meP && g % meEvery === 0) {
          table.set(meP.userId, meP);
          meP.quota! -= 1;
        }
        for (let tries = 0; table.size < size && tries < 50; tries++) {
          const p = draw();
          table.set(p.userId, p);
        }
        if (table.size < 2) continue;

        // Classement de la partie : niveau + part de chance.
        const seated = [...table.values()].map((p) => ({ p, perf: p.skill + gauss() * 0.8 })).sort((a, b) => b.perf - a.perf);
        const entries = seated.map(({ p }, i) => {
          const s = state.get(p.userId)!;
          return { id: p.userId, rating: s.rating, rank: i + 1, provisional: s.games < PLACEMENT_GAMES, games: s.games };
        });
        const deltas = computeRatingChanges(entries);
        const gameId = `${SEED_PREFIX}${mode}-${difficulty}-${g}`;
        games.push({ id: gameId, mode, difficulty, endedAt: new Date(now - (gameCount - g) * 20 * 60_000) });
        for (const e of entries) {
          const s = state.get(e.id)!;
          const delta = deltas[e.id] ?? 0;
          players.push({ gameId, userId: e.id, name: table.get(e.id)!.name, rank: e.rank, skill: table.get(e.id)!.skill, before: s.rating, delta, games: s.games + 1 });
          s.rating += delta;
          s.games += 1;
        }
      }
      for (const [userId, s] of state) if (s.games) ratings.push({ userId, mode, difficulty, rating: s.rating, games: s.games });
    }
  }

  for (let i = 0; i < games.length; i += 1000) {
    await prisma.game.createMany({
      data: games.slice(i, i + 1000).map((g) => ({
        id: g.id,
        code: SEED_CODE,
        settings: { mode: g.mode, difficulty: g.difficulty, rounds: ROUNDS },
        mode: g.mode,
        difficulty: g.difficulty,
        turnStyle: "simultaneous",
        seed: g.id,
        rounds: ROUNDS,
        startedAt: new Date(g.endedAt.getTime() - 3 * 60_000),
        endedAt: g.endedAt,
      })),
    });
  }
  for (let i = 0; i < players.length; i += 2000) {
    await prisma.gamePlayer.createMany({
      data: players.slice(i, i + 2000).map((p) => {
        const correct = Math.max(0, Math.min(ROUNDS, Math.round(ROUNDS * (0.7 + p.skill * 0.1) + gauss())));
        return {
          gameId: p.gameId,
          userId: p.userId,
          playerKey: p.userId,
          displayName: p.name,
          rank: p.rank,
          score: correct,
          alive: p.rank === 1,
          answered: ROUNDS,
          correct,
          correctTimeMs: correct * Math.round(2500 - p.skill * 400),
          bestStreak: Math.min(correct, 3 + Math.floor(random() * 6)),
          ratingBefore: p.before,
          ratingDelta: p.delta,
          ratingGames: p.games,
        };
      }),
    });
  }
  await prisma.rating.createMany({ data: ratings });

  const ranked = ratings.filter((r) => r.games >= PLACEMENT_GAMES).length;
  console.log(`Créé : ${fakes.length} faux joueurs, ${games.length} parties, ${ratings.length} Elo (${ranked} classés).`);
  if (me) console.log(`Compte « ${me.name} » ajouté aux parties de : ${Object.keys(ME_PLAN).join(", ")}.`);
}

const args = process.argv.slice(2);
const meIndex = args.indexOf("--me");
(args.includes("--clean") ? clean() : seed(meIndex >= 0 ? args[meIndex + 1] : undefined))
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
