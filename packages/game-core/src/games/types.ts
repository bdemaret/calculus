import type { AnswerKind, AnswerRecord, GameId, GameModeId, GameSettings, Operation, PlayerAnswer, Question } from "../types";

/**
 * Un jeu décrit ce qu'on résout ; le mode (`modes.ts`) décide comment on gagne.
 * Pour ajouter un jeu : créer un objet qui respecte cette interface et l'ajouter à GAMES.
 */
export interface GameDefinition {
  id: GameId;
  /** Modes jouables avec ce jeu ; le premier sert par défaut. */
  modes: GameModeId[];
  /** Jouable en solo (sinon en ligne uniquement). */
  solo: boolean;
  /** Joueurs nécessaires pour lancer une partie en ligne. */
  minPlayers: number;
  /** Forme de la réponse attendue. */
  answerKind: AnswerKind;
  /** Calcul numéro `index` : ne dépend que de la graine, de l'index et des réglages (déterministe). */
  generate(seed: string, index: number, settings: GameSettings): Question;
  /** La réponse est-elle juste ? Appelé seulement avec une réponse de la forme `answerKind`. */
  check(question: Question, answer: PlayerAnswer): boolean;
}

/**
 * Retrouve la réponse envoyée à partir de ce qui a été enregistré (null si le temps s'est écoulé),
 * pour rejouer une partie.
 */
export function answerOfRecord(record: Pick<AnswerRecord, "value" | "text">, kind: AnswerKind): PlayerAnswer | null {
  if (record.value !== null) return { value: record.value };
  if (record.text === null) return null;
  return kind === "op" ? { op: record.text as Operation } : { expr: record.text };
}

/** Forme d'une réponse, pour la comparer à `GameDefinition.answerKind`. */
export function answerKindOf(answer: PlayerAnswer): AnswerKind {
  if ("value" in answer) return "number";
  if ("expr" in answer) return "expr";
  return "op";
}
