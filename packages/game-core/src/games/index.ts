import type { GameId } from "../types";
import { bombGame } from "./bomb";
import { missingGame } from "./missing";
import { rightCountGame } from "./right-count";
import { standardGame } from "./standard";
import type { GameDefinition } from "./types";

export * from "./types";
export { bombGame, missingGame, rightCountGame, standardGame };
export { BOMB_LEVELS, assignBombs, bombValue, defuseQuestion, fallbackBomb, type BombError, type BombLevel, type BombPuzzle } from "./bomb";
export { RIGHT_COUNT_LEVELS, evaluateRightCount, usesAllTiles, type RightCountLevel } from "./right-count";

export const GAMES: Record<GameId, GameDefinition> = {
  standard: standardGame,
  missing: missingGame,
  "right-count": rightCountGame,
  bomb: bombGame,
};

/** Jeux dans l'ordre d'affichage ; le premier sert par défaut. */
export const GAME_IDS: GameId[] = ["standard", "right-count", "missing", "bomb"];
