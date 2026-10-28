/**
 * Générateur pseudo-aléatoire déterministe.
 * Une même graine produit toujours la même suite de nombres : tous les joueurs
 * d'un lobby reçoivent donc les mêmes calculs, dans le même ordre.
 */
export type Rng = () => number;

/** Transforme une chaîne (la graine) en entier 32 bits. */
export function hashSeed(seed: string): number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^= h >>> 16) >>> 0;
}

/** Mulberry32 : rapide, suffisant pour un jeu. */
export function createRng(seed: string): Rng {
  let a = hashSeed(seed);
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Entier entre min et max inclus. */
export function randInt(rng: Rng, min: number, max: number): number {
  if (max < min) [min, max] = [max, min];
  return min + Math.floor(rng() * (max - min + 1));
}

export function pick<T>(rng: Rng, items: readonly T[]): T {
  if (items.length === 0) throw new Error("pick() sur une liste vide");
  return items[Math.floor(rng() * items.length)] as T;
}

/**
 * Graine aléatoire lisible, pour une partie solo (navigateur). Prévisible (`Math.random`) :
 * le serveur de jeu tire les siennes avec `node:crypto`.
 */
export function randomSeed(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}
