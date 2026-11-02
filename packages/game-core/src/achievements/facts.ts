import type { GameSettings, RoundRecord, Standing } from "../types";
import type { GameFacts, RoundFacts } from "./types";

/** Réponses minimales d'une partie solo pour qu'elle compte (une partie solo se poste sans effort : voir `plans/gamification.md`). */
export const ACHIEVEMENT_MIN_ANSWERED = 3;

export interface FactsInput {
  solo: boolean;
  settings: GameSettings;
  /** Fin de la partie (ms epoch). */
  endedAt: number;
  rated: boolean;
  /** Comptes inscrits de la partie. */
  accounts: number;
  standings: readonly Standing[];
  history: readonly RoundRecord[];
}

/** La manche concernait-elle ce joueur ? */
function concerns(round: RoundRecord, playerId: string, eliminatedAt: number | null): boolean {
  if (eliminatedAt !== null && round.index > eliminatedAt) return false;
  if (round.personal) return playerId in round.personal;
  return round.activePlayerId === null || round.activePlayerId === playerId;
}

/** Plus grand retard du joueur sur le meilleur adversaire, manche après manche. */
function deficitOf(playerId: string, history: readonly RoundRecord[]): number {
  const scores = new Map<string, number>();
  let worst = 0;
  for (const round of history) {
    for (const id of round.scorers) scores.set(id, (scores.get(id) ?? 0) + 1);
    const mine = scores.get(playerId) ?? 0;
    for (const [id, score] of scores) if (id !== playerId) worst = Math.max(worst, score - mine);
  }
  return worst;
}

/** Bombes construites par le joueur et résultat de chacune (mêmes règles que `bombGame.resolveExtras`). */
function bombFacts(playerId: string, history: readonly RoundRecord[]): GameFacts["bomb"] {
  const facts = { built: 0, exploded: 0, usedFallback: false };
  for (const round of history) {
    const mine = round.bombs?.[playerId];
    if (!mine) continue;
    if (mine.fallback) {
      facts.usedFallback = true;
      continue;
    }
    facts.built += 1;
    for (const [defuserId, { authorId }] of Object.entries(round.personal ?? {})) {
      if (authorId !== playerId) continue;
      const answer = round.answers.find((a) => a.playerId === defuserId);
      if (answer && !answer.correct) facts.exploded += 1;
    }
  }
  return facts;
}

/** Résume une partie terminée pour un joueur. Le rattrapage y passe aussi l'historique reconstruit depuis la base. */
export function factsOf(input: FactsInput, playerId: string): GameFacts | null {
  const standing = input.standings.find((s) => s.player.id === playerId);
  if (!standing) return null;
  const { player, rank } = standing;
  const { settings, history } = input;

  const rounds: RoundFacts[] = [];
  for (const round of history) {
    if (!concerns(round, playerId, player.eliminatedAt)) continue;
    const question = round.personal?.[playerId]?.question ?? round.question;
    const answer = round.answers.find((a) => a.playerId === playerId);
    const given = !!answer && (answer.value !== null || answer.text !== null);
    const puzzle = question.puzzle;
    rounds.push({
      answered: given,
      correct: answer?.correct ?? false,
      closest: answer?.closest ?? false,
      timeMs: answer?.timeMs ?? round.timeLimitMs,
      timeLimitMs: round.timeLimitMs,
      expected: question.answer,
      tags: question.tags,
      difficulty: question.difficulty,
      expr: answer?.text ?? null,
      tiles: puzzle.game === "right-count" ? puzzle.tiles : null,
      spared: round.spared,
    });
  }

  const others = input.standings.filter((s) => s.player.id !== playerId);
  return {
    solo: input.solo,
    game: settings.game,
    mode: settings.mode,
    difficulty: settings.difficulty,
    turnStyle: settings.turnStyle,
    operations: settings.operations,
    rated: input.rated,
    players: input.standings.length,
    accounts: input.accounts,
    endedAt: input.endedAt,
    rank,
    won: input.rated && rank === 1,
    eligible: !input.solo || player.answered >= ACHIEVEMENT_MIN_ANSWERED,
    bestStreak: player.bestStreak,
    rounds,
    maxDeficit: deficitOf(playerId, history),
    bestOpponentScore: Math.max(0, ...others.map((s) => s.player.score)),
    firstOut: others.length > 0 && player.eliminatedAt === 0,
    bomb: bombFacts(playerId, history),
  };
}
