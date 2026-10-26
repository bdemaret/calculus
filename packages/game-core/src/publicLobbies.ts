/**
 * Lobbys publics : créés automatiquement par le serveur, sans propriétaire,
 * affichés sur la page d'accueil. La partie se lance seule au bout de
 * PUBLIC_LOBBY_DURATION_MS, ou dès que le lobby est plein.
 */
import { GAMES, GAME_IDS } from "./games";
import { DIFFICULTIES } from "./levels";
import { pick, type Rng } from "./rng";
import { MIN_ROUNDS, TURN_STYLES, defaultSettings, sanitizeSettings } from "./settings";
import type { GameSettings } from "./types";

/** Nombre de lobbys publics ouverts en même temps. */
export const PUBLIC_LOBBY_COUNT = 2;
/** Durée d'attente d'un lobby public avant le lancement automatique, en ms. */
export const PUBLIC_LOBBY_DURATION_MS = 2 * 60 * 1000;
/** Nombre de manches possibles en course de vitesse simultanée. */
const SPEED_RACE_ROUNDS = [10, 15, 20] as const;
/** En « chacun son tour », chaque joueur reçoit ce nombre de calculs : on reste au plus court. */
const TURNS_ROUNDS = MIN_ROUNDS;
/** Nombre d'essais pour obtenir un lobby différent de ceux déjà ouverts. */
const MAX_TRIES = 20;

/** Ce que le site affiche d'un lobby public (renvoyé par `GET /lobbies` du serveur de jeu). */
export interface PublicLobbyInfo {
  code: string;
  settings: GameSettings;
  players: number;
  maxPlayers: number;
  /** Lancement automatique, en heure serveur (ms). */
  startsAt: number;
}

export interface PublicLobbyList {
  serverNow: number;
  lobbies: PublicLobbyInfo[];
}

/** Deux lobbys « se ressemblent » s'ils ont le même jeu, la même façon de jouer et le même niveau. */
function sameKind(a: GameSettings, b: GameSettings): boolean {
  return a.game === b.game && a.mode === b.mode && a.turnStyle === b.turnStyle && a.difficulty === b.difficulty;
}

/**
 * Tire au hasard les réglages d'un lobby public : jeu, façon de jouer et niveau varient,
 * et on évite de proposer deux fois le même lobby que ceux déjà ouverts.
 * Les opérations, parenthèses et temps sont ceux par défaut du jeu et du niveau.
 */
export function randomPublicSettings(rng: Rng, avoid: readonly GameSettings[] = []): GameSettings {
  let settings = drawSettings(rng);
  for (let i = 1; i < MAX_TRIES && avoid.some((other) => sameKind(other, settings)); i++) settings = drawSettings(rng);
  return settings;
}

/**
 * Jeux proposés en lobby public : ceux qui se jouent à un seul joueur, puisqu'un lobby public
 * peut se lancer avec une seule personne (la bombe en demande deux).
 */
const PUBLIC_GAMES = GAME_IDS.filter((g) => GAMES[g].minPlayers <= 1);

function drawSettings(rng: Rng): GameSettings {
  const game = pick(rng, PUBLIC_GAMES);
  const difficulty = pick(rng, DIFFICULTIES);
  const mode = pick(rng, GAMES[game].modes);
  const turnStyle = GAMES[game].turns ? pick(rng, TURN_STYLES) : "simultaneous";
  // Opérations, parenthèses et temps : ceux du jeu et du niveau.
  return sanitizeSettings({
    ...defaultSettings(difficulty, mode, game),
    turnStyle,
    rounds: turnStyle === "turns" ? TURNS_ROUNDS : pick(rng, SPEED_RACE_ROUNDS),
  });
}
