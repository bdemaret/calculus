/**
 * Messages échangés entre le navigateur et la salle Donjons (`DUNGEON_ROOM`).
 * La salle envoie un `DungeonSnapshot` complet, propre à chaque joueur, à chaque changement.
 */
import type { Unlock } from "../achievements/types";
import type { BasicOperation } from "../types";
import type { DungeonPhase, DungeonSummary, DungeonView } from "./engine";
import type { ItemId } from "./items";
import type { DungeonSettings } from "./map";

/** Nom de la salle Colyseus des donjons. */
export const DUNGEON_ROOM = "dungeon";

/** Phases de la salle : l'attente et le compte à rebours, puis celles du moteur. */
export type DungeonRoomPhase = "lobby" | "countdown" | DungeonPhase;

export interface DungeonMember {
  id: string;
  name: string;
  /** Titre porté (id, traduit par chaque joueur). */
  title: string | null;
  isHost: boolean;
  connected: boolean;
}

export interface DungeonSnapshot {
  code: string;
  phase: DungeonRoomPhase;
  hostId: string;
  settings: DungeonSettings;
  members: DungeonMember[];
  minPlayers: number;
  maxPlayers: number;
  /** Fin du compte à rebours ou de la phase en cours, en heure serveur (ms). */
  deadline: number | null;
  serverNow: number;
  /** L'expédition vue par ce joueur (jamais une réponse en cours), null au lobby. */
  game: DungeonView | null;
  /** Bilan, une fois l'expédition finie. */
  summary: DungeonSummary | null;
  /** Id de l'expédition enregistrée (page de bilan), arrive peu après la fin. */
  runId: string | null;
  /** Succès débloqués par l'expédition, par id de joueur (une fois enregistrée). */
  unlocks: Record<string, Unlock[]> | null;
  gameNumber: number;
}

/** Donjon en cours vu par le panel administrateur (route `/admin/rooms`, liste `dungeons`). Jamais un calcul. */
export interface AdminDungeonSummary {
  code: string;
  phase: DungeonRoomPhase;
  difficulty: DungeonSettings["difficulty"];
  /** Ouverture du donjon et début de l'expédition en cours (ms epoch, null au lobby). */
  createdAt: number;
  startedAt: number | null;
  gameNumber: number;
  /** Manche en cours (0 à 4), null au lobby et pendant le compte à rebours. */
  round: number | null;
  score: number;
  boss: { hp: number; maxHp: number } | null;
  players: { id: string; name: string; isHost: boolean; connected: boolean; lives: number | null }[];
}

/* Navigateur → serveur */
export interface DungeonClientMessages {
  hello: Record<string, never>;
  /** Hôte, au lobby. */
  settings: Partial<DungeonSettings>;
  start: Record<string, never>;
  kick: { playerId: string };
  /** Positionnement : choisir une salle accessible (sa clé « étage-rang »), puis verrouiller. */
  pick: { room: string };
  lock: Record<string, never>;
  /** Réponse au calcul numéro `index` de sa série (ou du boss) : un nombre, ou un opérateur (spectre). */
  answer: { index: number; value: number } | { index: number; op: BasicOperation };
  /** Butin : donner un objet trouvé (à soi ou à un allié) ; `item` dit lequel quand on en a plusieurs. */
  "give-loot": { to: string; item?: ItemId };
  /** Sac : utiliser (la clé vise une salle), passer à un allié, jeter. */
  "use-item": { item: ItemId; target?: string };
  "give-item": { item: ItemId; to: string };
  "drop-item": { item: ItemId };
  /** Hôte, en fin d'expédition : retour au lobby. */
  "back-to-lobby": Record<string, never>;
}

/* Serveur → navigateur */
export interface DungeonServerMessages {
  welcome: { playerId: string };
  snapshot: DungeonSnapshot;
  "answer-ack": { index: number; correct: boolean; done: boolean };
  "answer-refused": { reason: string };
  error: { code: DungeonRoomError };
}

/** Refus d'une action dans la salle, traduits côté site. */
export const DUNGEON_ROOM_ERRORS = ["not-enough-players", "refused"] as const;
export type DungeonRoomError = (typeof DUNGEON_ROOM_ERRORS)[number];
