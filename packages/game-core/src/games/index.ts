import type { GameId } from "../types";
import { standardGame } from "./standard";
import type { GameDefinition } from "./types";

export * from "./types";
export { standardGame };

export const GAMES: Record<GameId, GameDefinition> = {
  standard: standardGame,
};

/** Jeux dans l'ordre d'affichage ; le premier sert par défaut. */
export const GAME_IDS: GameId[] = ["standard"];
