import { generateQuestion } from "../generator";
import type { GameDefinition } from "./types";

/** Calcul mental standard : un calcul, on donne son résultat. */
export const standardGame: GameDefinition = {
  id: "standard",
  modes: ["battle-royale", "speed-race"],
  solo: true,
  minPlayers: 1,
  answerKind: "number",
  generate: (seed, index, settings) => generateQuestion(seed, index, settings),
  check: (question, answer) => "value" in answer && answer.value === question.answer,
};
