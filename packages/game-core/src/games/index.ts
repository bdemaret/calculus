import type { GameId } from "../types";
import { missingGame } from "./missing";
import { standardGame } from "./standard";
import type { GameDefinition } from "./types";

export * from "./types";
export { missingGame, standardGame };

export const GAMES: Record<GameId, GameDefinition> = {
  standard: standardGame,
  missing: missingGame,
};

/** Jeux dans l'ordre d'affichage ; le premier sert par défaut. */
export const GAME_IDS: GameId[] = ["standard", "missing"];
