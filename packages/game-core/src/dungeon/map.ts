import { createRng, pick } from "../rng";
import { DIFFICULTIES } from "../levels";
import type { Difficulty } from "../types";
import { ENEMIES, FLOOR_POOLS, enemyHasHeart, enemyPoints, type EnemyId, type EnemyTier } from "./enemies";

/** Bornes et durées du donjon. */
export const DUNGEON_MIN_PLAYERS = 2;
export const DUNGEON_MAX_PLAYERS = 4;
/** Étages de la carte : 4 manches d'exploration (une salle d'étage en plus au mieux par manche), puis la manche du boss. */
export const DUNGEON_FLOORS = FLOOR_POOLS.length;
export const DUNGEON_ROUNDS = DUNGEON_FLOORS + 1;
export const DUNGEON_START_LIVES = 3;
export const DUNGEON_MAX_LIVES = 5;
/** Temps pour se positionner, distribuer le butin, voir le bilan d'une manche (ms), lus par le serveur. */
export const DUNGEON_POSITIONING_MS = 20_000;
export const DUNGEON_LOOT_MS = 10_000;
export const DUNGEON_RESULT_MS = 5_000;
/** Décompte avant chaque combat et avant le boss : les chronos ne partent qu'après, le calcul n'est pas encore envoyé. */
export const DUNGEON_INTRO_MS = 3_000;
/** PV du boss par joueur au départ ; chaque sceau brisé lui en retire une part (jusqu'au plancher). */
export const BOSS_HP_PER_PLAYER = 8;
export const SEAL_WEAKEN = 0.2;
export const SEAL_FLOOR_RATIO = 0.3;
/** Points d'un sceau brisé, en plus de ceux de son gardien. */
export const SEAL_POINTS = 150;
/**
 * Chrono du boss : temps par PV et par joueur, en part du temps par défaut du niveau (le temps maximal d'un calcul,
 * pas celui qu'on y met). À 0,4 : environ 4 s par calcul au niveau 2, donc il faut toute l'équipe ; un joueur seul
 * devrait répondre deux fois plus vite.
 */
export const BOSS_TIME_FACTOR = 0.4;
/** Points du boss vaincu, et de chaque vie restante à la victoire. */
export const BOSS_POINTS = 1000;
export const LIFE_POINTS = 50;

export interface DungeonSettings {
  difficulty: Difficulty;
}

/** Réglages venus de l'extérieur : seule la difficulté compte, Facile par défaut. Ne lève jamais d'erreur. */
export function sanitizeDungeonSettings(input: unknown): DungeonSettings {
  const raw = typeof input === "object" && input !== null ? (input as { difficulty?: unknown }).difficulty : undefined;
  return { difficulty: DIFFICULTIES.includes(raw as Difficulty) ? (raw as Difficulty) : 1 };
}

/** Type d'une salle. Une mimique se montre comme un coffre tant que personne n'y est entré. */
export type RoomKind = "enemy" | "seal" | "chest" | "mimic";

/** Une salle de la carte. */
export interface MapRoom {
  /** « étage-rang », ex. « 2-1 » (étages 1 à 4). */
  key: string;
  floor: number;
  index: number;
  /** Position horizontale (0 à 1) pour dessiner la carte. */
  x: number;
  kind: RoomKind;
  /** Ennemi affronté (gardien d'un sceau, mimique comprise), null pour un coffre. */
  enemy: EnemyId | null;
  tier: EnemyTier | 0;
  points: number;
  /** La salle rapporte un objet de butin (étape « loot »). */
  loot: boolean;
  /** Salles de l'étage suivant où mène cette salle. */
  links: string[];
  /** Réussir cette salle ouvre la salle du boss. */
  bossLink: boolean;
}

export interface DungeonMap {
  /** Salles par étage puis par rang. */
  rooms: MapRoom[];
}

const roomKey = (floor: number, index: number) => `${floor}-${index}`;

/** Mélange de Fisher-Yates avec le générateur de la graine (un tri à comparateur aléatoire dépendrait du moteur JS). */
function shuffle<T>(rng: () => number, items: readonly T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/** Salles par étage selon l'équipe (2 à 4 joueurs) : il y en a toujours plus qu'on ne peut en faire. */
export function floorWidth(playerCount: number): number {
  return Math.min(6, Math.max(4, playerCount + 2));
}

/**
 * Carte d'une expédition, déterministe (graine + nombre de joueurs) :
 * - 4 étages ; l'étage 1 est ouvert dès le départ, chaque salle mène à 1 à 3 salles de l'étage suivant ;
 * - aux étages 2 et 3, une salle en cul-de-sac (un coffre, parfois une mimique) ;
 * - au 4e étage, 1 ou 2 portes du boss, les autres salles sont des coffres ;
 * - un Dragon au 3e étage mène directement au boss (raccourci) ;
 * - des sceaux sur les branches qui mènent au boss ; toutes les salles sont accessibles depuis l'entrée.
 */
export function buildDungeon(seed: string, playerCount: number): DungeonMap {
  const rng = createRng(`${seed}:dungeon:map`);
  const width = floorWidth(playerCount);
  const floors: MapRoom[][] = [];
  for (let floor = 1; floor <= DUNGEON_FLOORS; floor++) {
    // L'entrée et le dernier étage un peu plus étroits, les étages du milieu plus larges.
    const count = floor === 1 || floor === DUNGEON_FLOORS ? width - 1 : width - (rng() < 0.5 ? 1 : 0);
    floors.push(
      Array.from({ length: count }, (_, index) => ({
        key: roomKey(floor, index),
        floor,
        index,
        x: (index + 0.5) / count,
        kind: "enemy" as RoomKind,
        enemy: null,
        tier: 0 as const,
        points: 0,
        loot: false,
        links: [],
        bossLink: false,
      })),
    );
  }
  const at = (floor: number) => floors[floor - 1] ?? [];

  // Culs-de-sac des étages 2 et 3 : des salles de butin qui ne mènent nulle part.
  const deadEnds = new Set<string>();
  for (const floor of [2, 3]) {
    const rooms = at(floor);
    if (rooms.length >= 3) deadEnds.add(pick(rng, rooms).key);
  }

  // Passages : chaque salle (sauf cul-de-sac) mène aux salles les plus proches de l'étage suivant.
  for (let floor = 1; floor < DUNGEON_FLOORS; floor++) {
    const next = at(floor + 1);
    const sources = at(floor).filter((r) => !deadEnds.has(r.key));
    for (const room of sources) {
      const near = [...next].sort((a, b) => Math.abs(a.x - room.x) - Math.abs(b.x - room.x)).slice(0, 3);
      const k = 1 + Math.floor(rng() * Math.min(3, near.length));
      room.links = near.slice(0, k).map((r) => r.key);
    }
    // Toute salle doit avoir une entrée : sinon, la plus proche y mène aussi.
    for (const target of next) {
      if (sources.some((r) => r.links.includes(target.key))) continue;
      const nearest = [...sources].sort((a, b) => Math.abs(a.x - target.x) - Math.abs(b.x - target.x))[0];
      nearest?.links.push(target.key);
    }
    for (const room of sources) room.links.sort((a, b) => Number(a.split("-")[1]) - Number(b.split("-")[1]));
  }

  // Portes du boss au 4e étage, et le Dragon du raccourci au 3e (jamais un cul-de-sac).
  const top = at(DUNGEON_FLOORS);
  const gateCount = playerCount <= 2 ? 1 : 2;
  const gates = shuffle(rng, top).slice(0, gateCount);
  for (const g of gates) g.bossLink = true;
  const dragonRoom = pick(rng, at(DUNGEON_FLOORS - 1).filter((r) => !deadEnds.has(r.key)));
  dragonRoom.bossLink = true;

  const byKey = new Map(floors.flat().map((r) => [r.key, r]));
  const reachesBoss = (room: MapRoom): boolean => room.bossLink || room.links.some((k) => reachesBoss(byKey.get(k)!));

  // Types : coffres (et mimiques) au bout des branches de butin, sceaux sur les branches du boss.
  for (const room of floors.flat()) {
    if (room.floor === 1 || room === dragonRoom || room.bossLink) continue;
    const loot = deadEnds.has(room.key) || (room.floor === DUNGEON_FLOORS && !room.bossLink);
    if (loot) room.kind = rng() < 0.25 ? "mimic" : "chest";
  }
  const sealCandidates = floors.flat().filter((r) => r.kind === "enemy" && r !== dragonRoom && (r.floor === 2 || r.floor === 3) && reachesBoss(r));
  const seals = shuffle(rng, sealCandidates).slice(0, Math.min(2, sealCandidates.length));
  for (const s of seals) s.kind = "seal";

  // Ennemis : le Dragon au raccourci, une mimique dans les faux coffres, les autres tirés dans le lot de l'étage.
  for (const room of floors.flat()) {
    if (room.kind === "chest") {
      room.loot = true;
      continue;
    }
    const enemy: EnemyId = room === dragonRoom ? "dragon" : room.kind === "mimic" ? "mimic" : pick(rng, FLOOR_POOLS[room.floor - 1] ?? FLOOR_POOLS[0]!);
    const tier = ENEMIES[enemy].tier;
    room.enemy = enemy;
    room.tier = tier;
    room.points = enemyPoints(tier, room.floor - 1) + (room.kind === "seal" ? SEAL_POINTS : 0);
    room.loot = enemyHasHeart(tier);
  }
  return { rooms: floors.flat() };
}

/**
 * Nombre de salles à réussir encore, au mieux, pour ouvrir le boss depuis `room` (elle comprise) ;
 * Infinity si aucun chemin n'y mène.
 */
export function stepsToBoss(map: DungeonMap, room: MapRoom, memo = new Map<string, number>()): number {
  const known = memo.get(room.key);
  if (known !== undefined) return known;
  let best = room.bossLink ? 1 : Infinity;
  for (const k of room.links) {
    const next = map.rooms.find((r) => r.key === k);
    if (next) best = Math.min(best, 1 + stepsToBoss(map, next, memo));
  }
  memo.set(room.key, best);
  return best;
}
