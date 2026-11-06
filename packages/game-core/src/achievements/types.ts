import type { Difficulty, GameId, GameModeId, Operation, OpTag, TurnStyle } from "../types";

export type AchievementCategory = "journey" | "mode" | "game" | "fun" | "social" | "dungeon";
export type AchievementTier = "bronze" | "silver" | "gold" | "platinum";
export type TitleRarity = "common" | "rare" | "epic" | "legendary";

/** Compteurs cumulés d'un joueur, par clé (`games`, `wins:bomb`…). */
export type Counters = Readonly<Record<string, number>>;

/** Une manche du point de vue d'un joueur (seulement celles où il devait répondre). */
export interface RoundFacts {
  /** Le joueur a proposé une réponse (faux si le temps s'est écoulé). */
  answered: boolean;
  correct: boolean;
  closest: boolean;
  timeMs: number;
  timeLimitMs: number;
  /** Valeur attendue du calcul de ce joueur. */
  expected: number;
  tags: readonly OpTag[];
  difficulty: Difficulty;
  /** Expression saisie, plaques du tirage (le bon compte). */
  expr: string | null;
  tiles: readonly number[] | null;
  /** Le joueur a survécu à une manche ratée par tous (battle royale). */
  spared: boolean;
}

/** Ce qu'une partie terminée a apporté à un joueur : seule entrée des règles de succès. */
export interface GameFacts {
  solo: boolean;
  game: GameId;
  mode: GameModeId;
  difficulty: Difficulty;
  turnStyle: TurnStyle;
  operations: readonly Operation[];
  /** Partie classée (en ligne, au moins deux comptes). */
  rated: boolean;
  /** Joueurs de la partie, et comptes inscrits parmi eux. */
  players: number;
  accounts: number;
  /** Fin de la partie (ms epoch). */
  endedAt: number;
  rank: number;
  /** 1re place d'une partie classée : une victoire contre des invités ne compte pas. */
  won: boolean;
  /** Assez joué pour compter : toujours en ligne, `ACHIEVEMENT_MIN_ANSWERED` réponses en solo. */
  eligible: boolean;
  bestStreak: number;
  rounds: readonly RoundFacts[];
  /** Plus grand retard sur le meilleur adversaire pendant la partie, en points. */
  maxDeficit: number;
  /** Meilleur score parmi les adversaires. */
  bestOpponentScore: number;
  /** Éliminé dès la première manche d'une partie à plusieurs. */
  firstOut: boolean;
  bomb: {
    /** Bombes du joueur (hors bombes de secours) et celles qui ont explosé. */
    built: number;
    exploded: number;
    /** Une bombe de secours lui a été donnée pendant la partie. */
    usedFallback: boolean;
  };
}

/** Ce qu'une expédition terminée a apporté à un joueur : seule entrée des exploits de donjon. */
export interface DungeonFacts {
  won: boolean;
  difficulty: Difficulty;
  /** Joueurs de l'expédition (départs compris). */
  players: number;
  /** Ennemis vaincus par l'équipe. */
  enemiesDefeated: number;
  /** Le joueur est parti avant la fin : il garde ses cœurs donnés, rien d'autre. */
  gone: boolean;
  lives: number;
  correct: number;
  answered: number;
  heartsGiven: number;
}

/** Ce qu'il faut pour un succès cumulatif : un compteur à atteindre, ou plusieurs compteurs à entamer. */
export type AchievementTarget = { counter: string; value: number } | { every: readonly string[] };

export interface AchievementDefinition {
  id: string;
  category: AchievementCategory;
  tier: AchievementTier;
  /** Caché tant qu'il n'est pas obtenu. */
  secret?: boolean;
  /** Réservé aux parties en ligne, chronométrées par le serveur : obligatoire pour un titre de prestige. */
  online?: boolean;
  /** Succès cumulatif. */
  target?: AchievementTarget;
  /** Exploit d'une partie. */
  check?: (facts: GameFacts) => boolean;
  /** Exploit d'une expédition (donjons). */
  dungeonCheck?: (facts: DungeonFacts) => boolean;
  /** Titre offert. */
  title?: string;
}

export interface TitleDefinition {
  id: string;
  rarity: TitleRarity;
}

/** Succès qui vient d'être obtenu, avec le titre qu'il offre. */
export interface Unlock {
  achievementId: string;
  titleId: string | null;
}
