export type Operation = "add" | "sub" | "mul" | "div";
/** Étiquette utilisée pour les statistiques : une opération ou la présence de parenthèses. */
export type OpTag = Operation | "paren";

export type Difficulty = 1 | 2 | 3 | 4 | 5;
export type GameModeId = "battle-royale" | "speed-race";
export type TurnStyle = "simultaneous" | "turns";

export interface GameSettings {
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

export interface Question {
  index: number;
  /** Énoncé lisible, ex. « (7 + 5) × 3 ». */
  text: string;
  answer: number;
  tags: OpTag[];
  difficulty: Difficulty;
}

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
  value: number | null;
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
