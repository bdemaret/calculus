import { LEVELS, type LevelConfig } from "../levels";
import type { Difficulty, Operation } from "../types";

/** Les ennemis des étages. Leurs noms et descriptions sont dans les messages du site (`dungeon.enemies.<id>`). */
export type EnemyId =
  | "elf"
  | "troll"
  | "knight"
  | "mummy"
  | "witch"
  | "specter"
  | "cyclops"
  | "skeleton"
  | "hydra"
  | "goblins"
  | "dragon"
  | "mimic";
export const ENEMY_IDS: EnemyId[] = ["elf", "troll", "knight", "mummy", "witch", "specter", "cyclops", "skeleton", "hydra", "goblins", "dragon", "mimic"];

/**
 * Forme du combat :
 * - `solo` : une série par joueur, à réussir en entier ; la première erreur fait échouer ;
 * - `shared` : une série commune à la salle (horde) : chaque bonne réponse de n'importe qui la réduit, chrono global ;
 * - `regrow` : une erreur ne fait pas échouer mais ajoute `regrow` calculs (hydre), chrono global de la série.
 */
export type FightForm = "solo" | "shared" | "regrow";

/** Forme des calculs : un calcul ordinaire, un nombre caché, un opérateur caché. */
export type EnemyQuestionKind = "standard" | "missing-number" | "missing-operator";

/** Rang d'un ennemi : 1 facile, 3 redoutable. Il fixe les points et le butin. */
export type EnemyTier = 1 | 2 | 3;

/** Ce qu'un ennemi pose à un joueur : une série de `count` calculs, à réussir tous. */
export interface EnemyProfile {
  /** Bornes des calculs, indépendantes de la difficulté de la partie (le troll pose des nombres à 3 chiffres même en Facile). */
  level: LevelConfig;
  operations: Operation[];
  parentheses: boolean;
  /** Nombre de calculs de la série. */
  count: number;
  /** Temps pour chaque calcul (ms). */
  timeMs: number;
  /** Durée d'affichage de l'énoncé (ms), null s'il reste visible. */
  visibleMs: number | null;
  /** Forme des calculs (ordinaire par défaut). */
  question?: EnemyQuestionKind;
  /** Forme du combat (`solo` par défaut). */
  form?: FightForm;
  /** Temps dégressif : chaque calcul a `timeStepMs` de moins que le précédent, sans descendre sous `minTimeMs`. */
  timeStepMs?: number;
  minTimeMs?: number;
  /** Temps des derniers calculs de la série (flèches finales du squelette), en ms ; ils comptent dans `count`. */
  finalTimesMs?: number[];
  /** Un des termes tiré dans ces bornes, les autres dans celles de `level` (troll de Légende : un nombre à 4 chiffres). */
  bigTerm?: { min: number; max: number };
  /** Chrono global de la série (`shared`, `regrow`), en ms ; il remplace le temps par calcul. */
  totalMs?: number;
  /** `regrow` : calculs ajoutés à chaque erreur. */
  regrow?: number;
}

/** Temps du calcul numéro `index` d'une série (temps dégressif compris). */
export function enemyTimeMs(p: EnemyProfile, index: number): number {
  const finals = p.finalTimesMs ?? [];
  const fromEnd = index - (p.count - finals.length);
  if (fromEnd >= 0 && fromEnd < finals.length) return finals[fromEnd]!;
  if (!p.timeStepMs) return p.timeMs;
  return Math.max(p.minTimeMs ?? 1000, p.timeMs - index * p.timeStepMs);
}

export interface EnemyDefinition {
  id: EnemyId;
  tier: EnemyTier;
  /** Profil selon la difficulté de la partie et l'étage (0 à 3) : plus on monte, plus la série est longue. */
  profile(difficulty: Difficulty, floor: number): EnemyProfile;
}

/** Copie d'un niveau avec quelques bornes changées. */
const levelFrom = (difficulty: Difficulty, over: Partial<LevelConfig>): LevelConfig => ({ ...LEVELS[difficulty], ...over, level: difficulty });

/** Elfe : des calculs très simples, mais très peu de temps. */
const elf: EnemyDefinition = {
  id: "elf",
  tier: 1,
  profile: (difficulty, floor) => ({
    level: levelFrom(difficulty, { addMin: 1, addMax: difficulty >= 4 ? 20 : 10, mulMax: difficulty >= 3 ? 9 : 5, divMax: 5, terms: [2], maxResult: 200 }),
    operations: difficulty >= 3 ? ["add", "sub", "mul"] : difficulty === 2 ? ["add", "sub"] : ["add"],
    parentheses: false,
    count: 6 + floor,
    timeMs: Math.max(2000, 3200 - (difficulty - 1) * 300),
    visibleMs: null,
  }),
};

/** Troll : de gros calculs simples (additions et soustractions à 3 chiffres, dont un à 4 chiffres en Légende), avec du temps. */
const troll: EnemyDefinition = {
  id: "troll",
  tier: 2,
  profile: (difficulty, floor) => ({
    level: levelFrom(difficulty, { addMin: 100, addMax: 999, terms: difficulty >= 4 ? [3] : [2], maxResult: difficulty >= 5 ? 15_000 : 3000 }),
    operations: ["add", "sub"],
    parentheses: false,
    count: 3 + Math.floor(floor / 2),
    timeMs: (difficulty >= 4 ? 25 : 20) * 1000,
    visibleMs: null,
    ...(difficulty >= 5 ? { bigTerm: { min: 1000, max: 9999 } } : {}),
  }),
};

/** Chevalier : des calculs du niveau de la partie, au temps habituel. */
const knight: EnemyDefinition = {
  id: "knight",
  tier: 2,
  profile: (difficulty, floor) => ({
    level: LEVELS[difficulty],
    operations: LEVELS[difficulty].defaultOperations,
    parentheses: LEVELS[difficulty].defaultParentheses,
    count: 4 + floor,
    timeMs: LEVELS[difficulty].defaultTime * 1000,
    visibleMs: null,
  }),
};

/** Momie : l'énoncé ne reste visible qu'une seconde, il faut le retenir. Un niveau en dessous de la partie. */
const mummy: EnemyDefinition = {
  id: "mummy",
  tier: 3,
  profile: (difficulty, floor) => {
    const base = Math.max(1, difficulty - 1) as Difficulty;
    return {
      level: LEVELS[base],
      // Sans puissance ni racine : à retenir en une seconde, « √729 » serait du hasard.
      operations: LEVELS[base].defaultOperations.filter((op) => op !== "pow" && op !== "sqrt"),
      parentheses: false,
      count: 3 + Math.floor(floor / 2),
      timeMs: (LEVELS[base].defaultTime + 5) * 1000,
      visibleMs: 1000,
    };
  },
};

/** Opérations de base du niveau, sans puissance ni racine. */
const basicOf = (difficulty: Difficulty) => LEVELS[difficulty].defaultOperations.filter((op) => op !== "pow" && op !== "sqrt");

/** Sorcière : un nombre caché dans l'égalité (« 23 + ? = 41 »). */
const witch: EnemyDefinition = {
  id: "witch",
  tier: 2,
  profile: (difficulty, floor) => ({
    level: LEVELS[difficulty],
    operations: basicOf(difficulty),
    parentheses: false,
    count: 4 + Math.floor(floor / 2),
    timeMs: (LEVELS[difficulty].defaultTime + 3) * 1000,
    visibleMs: null,
    question: "missing-number",
  }),
};

/** Temps du spectre par calcul : trouver un signe va vite, même sur de grands nombres. */
const SPECTER_TIME_MS: Record<Difficulty, number> = { 1: 12_000, 2: 12_000, 3: 12_000, 4: 11_000, 5: 10_000 };

/** Spectre : un opérateur caché (« 12 ? 4 = 3 »), au moins l'addition et la soustraction. */
const specter: EnemyDefinition = {
  id: "specter",
  tier: 2,
  profile: (difficulty, floor) => ({
    level: LEVELS[difficulty],
    operations: difficulty >= 2 ? basicOf(difficulty) : ["add", "sub", "mul"],
    parentheses: false,
    count: 4 + Math.floor(floor / 2),
    timeMs: SPECTER_TIME_MS[difficulty],
    visibleMs: null,
    question: "missing-operator",
  }),
};

/** Cyclope : un seul calcul énorme (plusieurs termes, des parenthèses), beaucoup de temps, tout ou rien. */
const cyclops: EnemyDefinition = {
  id: "cyclops",
  tier: 2,
  profile: (difficulty) => {
    const base = LEVELS[difficulty];
    return {
      level: { ...base, terms: difficulty >= 3 ? [4] : [3], maxResult: Math.max(base.maxResult, 1000), level: difficulty },
      operations: basicOf(difficulty).length >= 3 ? basicOf(difficulty) : ["add", "sub", "mul"],
      parentheses: true,
      count: 1,
      timeMs: (difficulty >= 4 ? 60 : 45) * 1000,
      visibleMs: null,
    };
  },
};

/** Flèches finales du squelette selon la difficulté : une à 2 s en Expert, puis une à 1,7 s en Légende. */
const SKELETON_FINALS_MS: Record<Difficulty, number[]> = { 1: [], 2: [], 3: [], 4: [2000], 5: [2000, 1700] };

/** Squelette archer : des calculs simples, et le temps fond à chaque flèche (5,5 s, puis de moins en moins, et les flèches finales). */
const skeleton: EnemyDefinition = {
  id: "skeleton",
  tier: 1,
  profile: (difficulty, floor) => ({
    level: levelFrom(difficulty, { addMin: 2, addMax: difficulty >= 3 ? 30 : 15, mulMax: 9, divMax: 9, terms: [2], maxResult: 300 }),
    operations: difficulty >= 2 ? ["add", "sub", "mul"] : ["add", "sub"],
    parentheses: false,
    count: 6 + floor + SKELETON_FINALS_MS[difficulty].length,
    timeMs: 5500,
    timeStepMs: 500,
    minTimeMs: 2500,
    finalTimesMs: SKELETON_FINALS_MS[difficulty],
    visibleMs: null,
  }),
};

/** Hydre : chaque erreur fait repousser deux têtes (deux calculs de plus), contre un chrono global. */
const hydra: EnemyDefinition = {
  id: "hydra",
  tier: 3,
  profile: (difficulty, floor) => {
    const count = 3 + Math.floor(floor / 2);
    const per = LEVELS[difficulty].defaultTime * 1000;
    return {
      level: LEVELS[difficulty],
      operations: basicOf(difficulty),
      parentheses: LEVELS[difficulty].defaultParentheses,
      count,
      timeMs: per,
      visibleMs: null,
      form: "regrow",
      regrow: 2,
      totalMs: Math.round((count + 3) * per * 0.9),
    };
  },
};

/**
 * Taille de la horde selon la difficulté (avant le bonus d'étage) : les calculs restent petits,
 * c'est le nombre qui monte. En Légende, une trentaine en 40 s : hors de portée d'un joueur seul.
 */
const GOBLIN_COUNT: Record<Difficulty, number> = { 1: 10, 2: 12, 3: 16, 4: 22, 5: 30 };

/** Horde de gobelins : beaucoup de petits calculs, une série commune à tous ceux qui l'affrontent. */
const goblins: EnemyDefinition = {
  id: "goblins",
  tier: 2,
  profile: (difficulty, floor) => ({
    level: levelFrom(difficulty, { addMin: 1, addMax: difficulty >= 3 ? 30 : 12, mulMax: 9, divMax: 9, terms: [2], maxResult: 300 }),
    operations: difficulty >= 2 ? ["add", "sub", "mul"] : ["add", "sub"],
    parentheses: false,
    count: GOBLIN_COUNT[difficulty] + 2 * Math.floor(floor / 2),
    timeMs: 6000,
    visibleMs: null,
    form: "shared",
    totalMs: 40_000,
  }),
};

/** Dragon (élite) : puissances et racines, au niveau de la partie. Il garde le raccourci vers le boss. */
const dragon: EnemyDefinition = {
  id: "dragon",
  tier: 3,
  profile: (difficulty, floor) => ({
    level: LEVELS[difficulty],
    operations: ["add", "sub", "mul", "pow", "sqrt"],
    parentheses: false,
    count: 3 + Math.floor(floor / 2),
    timeMs: (LEVELS[difficulty].defaultTime + 5) * 1000,
    visibleMs: null,
  }),
};

/** Mimique : se fait passer pour un coffre ; des calculs du niveau, une série un peu longue. */
const mimic: EnemyDefinition = {
  id: "mimic",
  tier: 3,
  profile: (difficulty, floor) => ({
    level: LEVELS[difficulty],
    operations: LEVELS[difficulty].defaultOperations,
    parentheses: LEVELS[difficulty].defaultParentheses,
    count: 5 + Math.floor(floor / 2),
    timeMs: LEVELS[difficulty].defaultTime * 1000,
    visibleMs: null,
  }),
};

export const ENEMIES: Record<EnemyId, EnemyDefinition> = { elf, troll, knight, mummy, witch, specter, cyclops, skeleton, hydra, goblins, dragon, mimic };

/** Ennemis ordinaires possibles à chaque étage (0 à 3) : les plus redoutables apparaissent en haut. Le dragon et la mimique sont placés à part. */
export const FLOOR_POOLS: readonly (readonly EnemyId[])[] = [
  ["elf", "troll", "knight", "witch", "skeleton"],
  ["elf", "troll", "knight", "mummy", "witch", "specter", "skeleton", "goblins"],
  ["troll", "knight", "mummy", "specter", "cyclops", "hydra", "goblins"],
  ["knight", "mummy", "cyclops", "hydra", "specter"],
];

/** Points d'un ennemi vaincu, selon son rang et son étage. */
export const enemyPoints = (tier: EnemyTier, floor: number): number => tier * 100 + floor * 50;

/** Un ennemi de rang 3 (momie, hydre, dragon, mimique) rapporte un objet de butin. */
export const enemyHasHeart = (tier: EnemyTier): boolean => tier >= 3;

/** Le boss final : des calculs du niveau de la partie, sans limite par calcul (seul le chrono global compte). */
export function bossProfile(difficulty: Difficulty): Pick<EnemyProfile, "level" | "operations" | "parentheses"> {
  return { level: LEVELS[difficulty], operations: LEVELS[difficulty].defaultOperations, parentheses: LEVELS[difficulty].defaultParentheses };
}
