export const MAX_PLAYERS = 12;
export const MIN_ROUNDS = 5;
export const MAX_ROUNDS = 50;
/** Temps par calcul du calcul standard et du nombre manquant, en secondes (chaque jeu a ses bornes : `GameDefinition.timeRange`). */
export const MIN_TIME = 3;
export const MAX_TIME = 60;
/** La bombe : temps de construction, en secondes. */
export const MIN_BUILD_TIME = 15;
export const MAX_BUILD_TIME = 120;
export const DEFAULT_BUILD_TIME = 45;
/** Nombre maximal de manches en battle royale, pour garantir une fin. */
export const BATTLE_ROYALE_ROUND_CAP = 100;
/** Puissance : plus grand exposant permis (les exposants vont de 2 à `powerMax`). */
export const MIN_POWER = 2;
export const MAX_POWER = 10;
export const DEFAULT_POWER = 2;
