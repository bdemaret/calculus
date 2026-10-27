import { generateQuestion } from "../generator";
import { ALL_OPERATIONS, LEVELS } from "../levels";
import { MAX_TIME, MIN_TIME } from "../limits";
import type { GameDefinition } from "./types";

/** Calcul mental standard : un calcul, on donne son résultat. */
export const standardGame: GameDefinition = {
  id: "standard",
  modes: ["battle-royale", "speed-race"],
  solo: true,
  minPlayers: 1,
  turns: true,
  operations: ALL_OPERATIONS,
  operationStats: true,
  timeRange: { min: MIN_TIME, max: MAX_TIME },
  defaults: (d) => ({ operations: [...LEVELS[d].defaultOperations], parentheses: LEVELS[d].defaultParentheses, timePerQuestion: LEVELS[d].defaultTime }),
  answerKind: () => "number",
  generate: (seed, index, settings) => generateQuestion(seed, index, settings),
  check: (question, answer) => "value" in answer && answer.value === question.answer,
};
