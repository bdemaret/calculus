/**
 * Messages échangés entre le navigateur et le serveur de jeu.
 * Partagés ici pour que les deux côtés parlent exactement la même langue.
 */
import type { RatingChange } from "./elo";
import type { GameReport } from "./report";
import type { GameSettings, PlayerAnswer, Puzzle } from "./types";

/** `build` et `assign` : construction des bombes, puis qui reçoit quoi (la bombe seulement). */
export type RoomPhase = "lobby" | "countdown" | "build" | "assign" | "question" | "round-result" | "finished";

/** Qui a construit la bombe que désamorce qui. */
export interface BombPair {
  authorId: string;
  defuserId: string;
}

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
  /** Vide pour un lobby public, qui n'a pas de propriétaire. */
  hostId: string;
  /** Lobby public, créé automatiquement par le serveur. */
  isPublic: boolean;
  /** Lobby public en attente : lancement automatique, en heure serveur (ms). */
  autoStartAt: number | null;
  settings: GameSettings;
  players: LobbyPlayer[];
  maxPlayers: number;
  roundIndex: number;
  totalRounds: number | null;
  /**
   * Calcul en cours (jamais la réponse) : énoncé lisible et données propres au jeu. À la bombe, c'est le
   * tirage pendant la construction, puis la bombe que ce joueur doit désamorcer (chacun reçoit la sienne).
   */
  question: { index: number; text: string; puzzle: Puzzle } | null;
  /** La bombe : qui a déjà envoyé sa bombe, la sienne, et les paires une fois attribuées (sans les bombes). */
  bomb: { built: string[]; mine: string | null; pairs: BombPair[] | null } | null;
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
  /** Données du calcul, pour le réafficher pendant le résultat de la manche. */
  puzzle: Puzzle;
  answers: { playerId: string; value: number | null; text: string | null; correct: boolean; timeMs: number }[];
  /** La bombe : chaque bombe, son auteur, son désamorceur et sa valeur. */
  bombs?: (BombPair & { text: string; answer: number; fallback: boolean })[];
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
  /** La bombe : le calcul construit pendant la construction (une seule fois par manche). */
  bomb: { roundIndex: number; expr: string };
  /** Une saisie en cours (chiffres, ou un symbole d'opérateur), montrée aux autres en mode « chacun son tour ». */
  typing: { value: string };
}

/* Serveur → navigateur */
export interface ServerMessages {
  /** Envoyé une fois à l'arrivée : l'identifiant du joueur dans cette salle. */
  welcome: { playerId: string };
  snapshot: RoomSnapshot;
  "answer-ack": { correct: boolean; timeMs: number; questionIndex: number };
  "answer-refused": { reason: string };
  /** La bombe : bombe acceptée (telle qu'elle sera montrée, avec sa valeur) ou refusée (règle enfreinte). */
  "bomb-ack": { roundIndex: number; accepted: boolean; reason?: string; text?: string; value?: number };
  typing: { playerId: string; value: string };
  error: { code: RoomError };
  /** Salle de présence : nombre de visiteurs connectés au site. */
  online: { count: number };
}

/** Refus d'une action dans la salle, traduits côté site. */
export const ROOM_ERRORS = ["not-enough-players"] as const;
export type RoomError = (typeof ROOM_ERRORS)[number];

/** Nom de la salle de présence, rejointe par chaque onglet ouvert sur le site. */
export const PRESENCE_ROOM = "presence";

/** Contenu du jeton remis par le site pour entrer dans un lobby. */
export interface GameTokenPayload {
  /** Id du compte, ou id invité commençant par « guest_ ». */
  sub: string;
  name: string;
  guest: boolean;
}

/** Partie en cours vue par le panel administrateur (route `/admin/rooms` du serveur de jeu). */
export interface AdminRoomSummary {
  code: string;
  phase: RoomPhase;
  game: GameSettings["game"];
  mode: GameSettings["mode"];
  difficulty: GameSettings["difficulty"];
  /** Ouverture du lobby et début de la partie en cours (ms epoch, null au lobby). */
  createdAt: number;
  startedAt: number | null;
  gameNumber: number;
  roundIndex: number;
  totalRounds: number | null;
  /** Calcul affiché (jamais la réponse). */
  question: string | null;
  players: { id: string; name: string; isHost: boolean; isGuest: boolean; connected: boolean; score: number; alive: boolean }[];
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
