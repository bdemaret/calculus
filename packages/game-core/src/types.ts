export type Operation = "add" | "sub" | "mul" | "div";
/** Étiquette utilisée pour les statistiques : une opération ou la présence de parenthèses. */
export type OpTag = Operation | "paren";

export type Difficulty = 1 | 2 | 3 | 4 | 5;
/** Le jeu : ce qu'on résout (voir `games/`). */
export type GameId = "standard";
/** Le mode : comment on gagne (voir `modes.ts`), commun à tous les jeux. */
export type GameModeId = "battle-royale" | "speed-race";
export type TurnStyle = "simultaneous" | "turns";

export interface GameSettings {
  game: GameId;
  difficulty: Difficulty;
  mode: GameModeId;
  operations: Operation[];
  parentheses: boolean;
  /** Nombre de manches (course de vitesse). En « chacun son tour », chaque joueur reçoit ce nombre de calculs. */
  rounds: number;
  /** Temps par calcul, en secondes. */
  timePerQuestion: number;
  turnStyle: TurnStyle;
}

/**
 * Données propres au jeu, envoyées au navigateur pendant la manche : elles ne contiennent
 * jamais la solution. Le calcul standard n'a besoin que de `Question.text`.
 */
export type Puzzle = { game: "standard" };

export interface Question {
  index: number;
  /** Énoncé lisible, ex. « (7 + 5) × 3 ». */
  text: string;
  /** Valeur attendue (le résultat du calcul standard). */
  answer: number;
  /** Solution de référence lisible, montrée en fin de manche. */
  solution: string;
  puzzle: Puzzle;
  tags: OpTag[];
  difficulty: Difficulty;
}

/** Forme de la réponse attendue par un jeu. */
export type AnswerKind = "number" | "expr" | "op";

/** Réponse d'un joueur : un nombre, une expression (« (7 + 5) × 3 ») ou un opérateur. */
export type PlayerAnswer = { value: number } | { expr: string } | { op: Operation };

export interface PlayerInfo {
  id: string;
  name: string;
}

export interface PlayerState extends PlayerInfo {
  score: number;
  alive: boolean;
  /** Manche (index) où le joueur a été éliminé. */
  eliminatedAt: number | null;
  connected: boolean;
  answered: number;
  correct: number;
  /** Somme des temps des bonnes réponses, en ms (sert à départager). */
  correctTimeMs: number;
  streak: number;
  bestStreak: number;
}

export interface AnswerRecord {
  playerId: string;
  /** Nombre saisi (null si le temps s'est écoulé ou si la réponse n'est pas un nombre). */
  value: number | null;
  /** Expression ou opérateur saisi, quand la réponse n'est pas un nombre. */
  text: string | null;
  correct: boolean;
  timeMs: number;
}

export interface RoundRecord {
  index: number;
  question: Question;
  /** Joueur dont c'est le tour (mode « chacun son tour »). */
  activePlayerId: string | null;
  startedAt: number;
  timeLimitMs: number;
  answers: AnswerRecord[];
  /** Joueurs éliminés à la fin de cette manche. */
  eliminated: string[];
  /** Joueurs ayant marqué un point. */
  scorers: string[];
  /** Vrai si tous les survivants ont échoué et que personne n'a été éliminé. */
  spared: boolean;
}

export interface Standing {
  rank: number;
  player: PlayerState;
}
