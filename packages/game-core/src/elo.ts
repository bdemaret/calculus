/**
 * Classement Elo multijoueur.
 * Chaque partie est vue comme un ensemble de duels : chaque joueur est comparé à chacun des autres
 * selon leur rang final. Le gain est la somme (résultat − résultat attendu) de ces duels,
 * divisée par le nombre d'adversaires pour qu'une partie à 12 ne pèse pas plus qu'un duel.
 *
 * Placement : pendant ses `PLACEMENT_GAMES` premières parties dans un mode et une difficulté, un joueur
 * a un Elo caché qui bouge normalement, mais il ne compte pas comme adversaire pour les joueurs déjà
 * classés. Créer des comptes jetables pour les battre ne rapporte donc rien.
 */

/** Elo caché d'un joueur qui n'a encore jamais joué dans un mode et une difficulté. */
export const INITIAL_RATING = 1000;
/** Variation maximale d'une partie, en points d'Elo. */
export const ELO_K = 32;
/** Parties de placement avant que l'Elo soit affiché et compte pour les autres. */
export const PLACEMENT_GAMES = 5;
/** Écart d'Elo pour lequel le favori a 10 fois plus de chances de gagner (constante classique). */
const ELO_SCALE = 400;

export interface RatedEntry {
  id: string;
  rating: number;
  /** Rang final (1 = premier ; des ex aequo partagent le même rang). */
  rank: number;
  /** Encore en placement avant cette partie. */
  provisional: boolean;
}

/**
 * Variation d'Elo de chaque joueur, arrondie à l'entier.
 * Un joueur classé n'affronte que les autres joueurs classés ; un joueur en placement affronte tout le monde.
 * Sans adversaire retenu, la variation est nulle.
 */
export function computeRatingChanges(entries: RatedEntry[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const a of entries) {
    let sum = 0;
    let opponents = 0;
    for (const b of entries) {
      if (a === b || (!a.provisional && b.provisional)) continue;
      const expected = 1 / (1 + 10 ** ((b.rating - a.rating) / ELO_SCALE));
      const actual = a.rank < b.rank ? 1 : a.rank === b.rank ? 0.5 : 0;
      sum += actual - expected;
      opponents += 1;
    }
    out[a.id] = opponents ? Math.round((ELO_K * sum) / opponents) : 0;
  }
  return out;
}

/**
 * Effet d'une partie sur l'Elo d'un joueur, tel qu'on peut le montrer :
 * - `rated` : joueur classé, Elo avant / après ;
 * - `placement` : partie de placement n° `played` (sur `PLACEMENT_GAMES`), l'Elo reste caché ;
 * - `revealed` : dernière partie de placement, l'Elo est dévoilé.
 */
export type RatingChange =
  | { status: "rated"; before: number; after: number }
  | { status: "placement"; played: number }
  | { status: "revealed"; after: number };

/** Construit ce qu'on peut montrer d'une partie, à partir de l'Elo et du nombre de parties après celle-ci. */
export function describeRatingChange(before: number, after: number, gamesAfter: number): RatingChange {
  if (gamesAfter < PLACEMENT_GAMES) return { status: "placement", played: gamesAfter };
  if (gamesAfter === PLACEMENT_GAMES) return { status: "revealed", after };
  return { status: "rated", before, after };
}
