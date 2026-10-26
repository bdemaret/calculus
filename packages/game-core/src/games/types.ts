import { SYMBOL_OPERATION, type OpSymbol } from "../generator";
import type { AnswerKind, AnswerRecord, Difficulty, GameId, GameModeId, GameSettings, Operation, PlayerAnswer, Question } from "../types";

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
  /** Les tags des calculs sont des opérations : statistiques par opération au rapport et au tableau de bord. */
  operationStats: boolean;
  /** Temps par calcul permis, en secondes. */
  timeRange: { min: number; max: number };
  /** Réglages par défaut d'un niveau. */
  defaults(difficulty: Difficulty): { operations: Operation[]; parentheses: boolean; timePerQuestion: number };
  /** Forme de la réponse attendue pour ce calcul (elle peut changer d'un calcul à l'autre). */
  answerKind(question: Question): AnswerKind;
  /** Calcul numéro `index` : ne dépend que de la graine, de l'index et des réglages (déterministe). */
  generate(seed: string, index: number, settings: GameSettings): Question;
  /**
   * La réponse est-elle recevable (bien formée, plaques permises…) ? Une réponse irrecevable est refusée
   * sans consommer l'essai ; absent : toute réponse de la bonne forme l'est.
   */
  isValid?(question: Question, answer: PlayerAnswer): boolean;
  /** La réponse est-elle juste ? Appelé seulement avec une réponse de la forme `answerKind(question)`. */
  check(question: Question, answer: PlayerAnswer): boolean;
}

/**
 * Retrouve la réponse envoyée à partir de ce qui a été enregistré (null si le temps s'est écoulé),
 * pour rejouer une partie.
 */
export function answerOfRecord(record: Pick<AnswerRecord, "value" | "text">, kind: AnswerKind): PlayerAnswer | null {
  if (record.value !== null) return { value: record.value };
  if (record.text === null) return null;
  if (kind !== "op") return { expr: record.text };
  const op = SYMBOL_OPERATION[record.text as OpSymbol];
  return op ? { op } : null;
}

/** Forme d'une réponse, pour la comparer à `GameDefinition.answerKind`. */
export function answerKindOf(answer: PlayerAnswer): AnswerKind {
  if ("value" in answer) return "number";
  if ("expr" in answer) return "expr";
  return "op";
}
