import { createRng } from "../rng";

/*
 * Butin des donjons. Le cœur s'applique aussitôt (une vie) ; les autres objets vont dans le sac
 * d'un joueur (`BAG_SIZE` places) et servent plus tard. Leurs noms et effets sont dans les messages du site
 * (`dungeon.items.<id>`).
 */

export type ItemId = "heart" | "shield" | "hourglass" | "second-chance" | "key" | "bomb" | "phoenix" | "banner" | "purse" | "map";
export const ITEM_IDS: ItemId[] = ["heart", "shield", "hourglass", "second-chance", "key", "bomb", "phoenix", "banner", "purse", "map"];

/** Places du sac de chaque joueur. */
export const BAG_SIZE = 2;
/** Sablier : temps multiplié sur la prochaine série. */
export const HOURGLASS_FACTOR = 1.5;
/** Bombe : PV retirés au boss. */
export const BOMB_DAMAGE = 3;
/** Bourse d'or : points ajoutés au score en fin d'expédition, par bourse dans un sac. */
export const PURSE_POINTS = 250;

/**
 * Quand un objet s'utilise :
 * - `instant` : à la distribution du butin (le cœur) ;
 * - `positioning` : choisi au positionnement, pour la manche qui vient ;
 * - `boss` : pendant le combat contre le boss ;
 * - `passive` : agit tout seul depuis le sac (bouclier, plume de phénix, bourse).
 */
export type ItemUse = "instant" | "positioning" | "boss" | "passive";
export const ITEM_USE: Record<ItemId, ItemUse> = {
  heart: "instant",
  shield: "passive",
  hourglass: "positioning",
  "second-chance": "positioning",
  key: "positioning",
  bomb: "boss",
  phoenix: "passive",
  banner: "positioning",
  purse: "passive",
  map: "positioning",
};

/** Objets qui demandent une salle pour cible (la clé). */
export const ITEM_TARGETS_ROOM: ReadonlySet<ItemId> = new Set(["key"]);

/** D'où vient le butin : un coffre, ou un ennemi redoutable / une mimique / le dragon (plus rare). */
export type LootSource = "chest" | "rare";

/** Tables de tirage : objet → poids. */
const TABLES: Record<LootSource, [ItemId, number][]> = {
  chest: [
    ["heart", 3],
    ["shield", 2],
    ["hourglass", 2],
    ["second-chance", 2],
    ["purse", 2],
    ["key", 1],
    ["map", 1],
  ],
  rare: [
    ["phoenix", 2],
    ["bomb", 2],
    ["key", 2],
    ["banner", 1],
    ["shield", 1],
    ["heart", 1],
  ],
};

/** Objet trouvé dans une salle : déterministe (graine + salle), selon la source. */
export function rollLoot(seed: string, roomKey: string, source: LootSource): ItemId {
  const rng = createRng(`${seed}:dungeon:loot:${roomKey}`);
  const table = TABLES[source];
  const total = table.reduce((s, [, w]) => s + w, 0);
  let r = rng() * total;
  for (const [item, w] of table) {
    r -= w;
    if (r < 0) return item;
  }
  return table[0]![0];
}

export const isItemId = (v: unknown): v is ItemId => typeof v === "string" && (ITEM_IDS as string[]).includes(v);
