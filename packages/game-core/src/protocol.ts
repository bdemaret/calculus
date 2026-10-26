/**
 * Messages échangés entre le navigateur et le serveur de jeu.
 * Partagés ici pour que les deux côtés parlent exactement la même langue.
 */
import type { RatingChange } from "./elo";
import type { GameReport } from "./report";
import type { GameSettings, PlayerAnswer, Puzzle } from "./types";

export type RoomPhase = "lobby" | "countdown" | "question" | "round-result" | "finished";

export interface LobbyPlayer {
  id: string;
  name: string;
  isHost: boolean;
  ready: boolean;
  connected: boolean;
  isGuest: boolean;
  score: number;
  alive: boolean;
  answeredThisRound: boolean;
}

/** Instantané complet de la salle, envoyé à chaque changement. */
export interface RoomSnapshot {
  code: string;
  phase: RoomPhase;
  hostId: string;
  settings: GameSettings;
  players: LobbyPlayer[];
  maxPlayers: number;
  roundIndex: number;
  totalRounds: number | null;
  /** Calcul en cours (jamais la réponse) : énoncé lisible et données propres au jeu. */
  question: { index: number; text: string; puzzle: Puzzle } | null;
  activePlayerId: string | null;
  /** Fin de la manche ou du compte à rebours, en heure serveur (ms). */
  deadline: number | null;
  /** Durée totale de la manche en cours, en ms. */
  timeLimitMs: number | null;
  serverNow: number;
  lastRound: RoundResultPayload | null;
  report: GameReport | null;
  /** Effet sur l'Elo des comptes, par id de joueur (jamais l'Elo caché d'un joueur en placement). Arrive peu après la fin, une fois la partie enregistrée. */
  ratings: Record<string, RatingChange> | null;
  gameNumber: number;
}

export interface RoundResultPayload {
  index: number;
  text: string;
  answer: number;
  /** Solution de référence lisible. */
  solution: string;
  answers: { playerId: string; value: number | null; text: string | null; correct: boolean; timeMs: number }[];
  eliminated: string[];
  scorers: string[];
  spared: boolean;
}

/* Navigateur → serveur */
export interface ClientMessages {
  /** Demande l'état complet de la salle. */
  hello: Record<string, never>;
  /** Une réponse, de la forme attendue par le jeu (`GameDefinition.answerKind`). */
  answer: { questionIndex: number } & PlayerAnswer;
  ready: { ready: boolean };
  settings: Partial<GameSettings>;
  start: Record<string, never>;
  "replay-same": Record<string, never>;
  "replay-new": Record<string, never>;
  kick: { playerId: string };
  /** Une saisie en cours, montrée aux autres en mode « chacun son tour ». */
  typing: { value: string };
}

/* Serveur → navigateur */
export interface ServerMessages {
  /** Envoyé une fois à l'arrivée : l'identifiant du joueur dans cette salle. */
  welcome: { playerId: string };
  snapshot: RoomSnapshot;
  "answer-ack": { correct: boolean; timeMs: number; questionIndex: number };
  "answer-refused": { reason: string };
  typing: { playerId: string; value: string };
  error: { code: RoomError };
}

/** Refus d'une action dans la salle, traduits côté site. */
export const ROOM_ERRORS = ["not-enough-players"] as const;
export type RoomError = (typeof ROOM_ERRORS)[number];

/** Contenu du jeton remis par le site pour entrer dans un lobby. */
export interface GameTokenPayload {
  /** Id du compte, ou id invité commençant par « guest_ ». */
  sub: string;
  name: string;
  guest: boolean;
}

/** Codes d'erreur renvoyés à la connexion, traduits côté site. */
export const JOIN_ERRORS = {
  badToken: 4401,
  inProgress: 4409,
  duplicate: 4410,
  full: 4413,
  notFound: 4404,
} as const;

export const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const CODE_LENGTH = 6;

export function normalizeCode(code: string): string {
  return code
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, CODE_LENGTH);
}
