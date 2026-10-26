import { GAME_IDS, GAMES } from "./games";
import { ALL_OPERATIONS } from "./levels";
import { MAX_ROUNDS, MIN_ROUNDS } from "./limits";
import type { Difficulty, GameId, GameModeId, GameSettings, MissingKind, Operation, TurnStyle } from "./types";

export * from "./limits";

export const GAME_MODES: GameModeId[] = ["battle-royale", "speed-race"];
export const TURN_STYLES: TurnStyle[] = ["simultaneous", "turns"];
export const MISSING_KINDS: MissingKind[] = ["number", "operator", "mixed"];

export function defaultSettings(difficulty: Difficulty = 2, mode: GameModeId = "speed-race", game: GameId = "standard"): GameSettings {
  return {
    game,
    difficulty,
    mode,
    // Opérations, parenthèses et temps dépendent du jeu et du niveau.
    ...GAMES[game].defaults(difficulty),
    rounds: 15,
    turnStyle: "simultaneous",
    // Aux premiers niveaux, on ne cache qu'un nombre ; ensuite, un nombre ou un opérateur.
    missingKind: difficulty <= 2 ? "number" : "mixed",
  };
}

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, Math.round(n)));

/**
 * Nettoie des paramètres venus de l'extérieur (formulaire, message réseau).
 * Ne lève jamais d'erreur : toute valeur invalide est remplacée par une valeur sûre.
 */
export function sanitizeSettings(input: unknown): GameSettings {
  const raw = (typeof input === "object" && input !== null ? input : {}) as Record<string, unknown>;
  const difficulty = ([1, 2, 3, 4, 5].includes(Number(raw.difficulty)) ? Number(raw.difficulty) : 2) as Difficulty;
  const game = GAME_IDS.includes(raw.game as GameId) ? (raw.game as GameId) : GAME_IDS[0]!;
  const base = defaultSettings(difficulty, undefined, game);
  const time = GAMES[game].timeRange;
  // Un mode que ce jeu ne propose pas est remplacé par son mode par défaut.
  const allowed = GAMES[game].modes;
  const wanted = GAME_MODES.includes(raw.mode as GameModeId) ? (raw.mode as GameModeId) : base.mode;
  const mode = allowed.includes(wanted) ? wanted : allowed[0]!;
  const missingKind = MISSING_KINDS.includes(raw.missingKind as MissingKind) ? (raw.missingKind as MissingKind) : base.missingKind;
  const turnStyle = TURN_STYLES.includes(raw.turnStyle as TurnStyle) ? (raw.turnStyle as TurnStyle) : base.turnStyle;
  const ops = Array.isArray(raw.operations)
    ? [...new Set(raw.operations.filter((o): o is Operation => ALL_OPERATIONS.includes(o as Operation)))]
    : base.operations;
  return {
    game,
    difficulty,
    mode,
    turnStyle,
    missingKind,
    operations: ops.length > 0 ? ops : base.operations,
    parentheses: typeof raw.parentheses === "boolean" ? raw.parentheses : base.parentheses,
    rounds: typeof raw.rounds === "number" && Number.isFinite(raw.rounds) ? clamp(raw.rounds, MIN_ROUNDS, MAX_ROUNDS) : base.rounds,
    timePerQuestion:
      typeof raw.timePerQuestion === "number" && Number.isFinite(raw.timePerQuestion)
        ? clamp(raw.timePerQuestion, time.min, time.max)
        : base.timePerQuestion,
  };
}
