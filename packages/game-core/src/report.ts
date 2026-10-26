import type { OpTag, PlayerState, RoundRecord, Standing } from "./types";

export interface OpStat {
  tag: OpTag;
  attempts: number;
  correct: number;
}

export interface PlayerReport {
  playerId: string;
  name: string;
  rank: number;
  score: number;
  alive: boolean;
  eliminatedAt: number | null;
  answered: number;
  correct: number;
  /** Précision, entre 0 et 1. */
  accuracy: number;
  /** Temps moyen des bonnes réponses, en ms (null si aucune). */
  avgCorrectMs: number | null;
  fastestMs: number | null;
  bestStreak: number;
  byOperation: OpStat[];
  /** Temps de réponse par manche (null si pas de bonne réponse), pour le graphique de progression. */
  timeline: { round: number; timeMs: number | null; correct: boolean }[];
}

/** Une manche telle qu'on la revoit après la partie : le calcul, la réponse et ce que chacun a répondu. */
export interface RoundReview {
  /** Numéro de manche, à partir de 1. */
  round: number;
  text: string;
  answer: number;
  /** Solution de référence lisible. */
  solution: string;
  /** Joueur dont c'était le tour (mode « chacun son tour »), sinon null. */
  activePlayerId: string | null;
  /**
   * Réponses dans l'ordre d'arrivée ; value et text valent null quand le temps s'est écoulé.
   * `closest` : le bon compte, personne n'a trouvé et cette proposition, la plus proche, l'emporte.
   */
  answers: { playerId: string; value: number | null; text: string | null; correct: boolean; timeMs: number; closest?: boolean }[];
  /** Joueurs ayant marqué le point sur cette manche. */
  scorers: string[];
  /** Vrai si tous les survivants se sont trompés et que personne n'est sorti. */
  spared: boolean;
  /** La bombe : qui a construit quoi, pour qui, et sa valeur (`text` est alors le tirage). */
  bombs?: { authorId: string; defuserId: string; text: string; answer: number; fallback: boolean }[];
}

export interface GameReport {
  rounds: number;
  /** Le détail de chaque manche, pour revoir les calculs. */
  review: RoundReview[];
  players: PlayerReport[];
  /** Le calcul le plus raté de la partie. */
  hardest: { text: string; answer: number; solution: string; misses: number } | null;
  fastest: { playerId: string; name: string; text: string; timeMs: number } | null;
}

/** Le calcul d'un joueur dans une manche (le sien à la bombe). */
const questionOf = (r: RoundRecord, playerId: string) => r.personal?.[playerId]?.question ?? r.question;

export function buildReport(standings: Standing[], history: RoundRecord[]): GameReport {
  const players: PlayerReport[] = standings.map(({ rank, player }) => playerReport(rank, player, history));

  let hardest: GameReport["hardest"] = null;
  let fastest: GameReport["fastest"] = null;
  const nameOf = (id: string) => standings.find((s) => s.player.id === id)?.player.name ?? "?";
  for (const r of history) {
    // À la bombe, chaque joueur a son propre calcul : le plus raté se cherche calcul par calcul.
    for (const q of r.personal ? Object.entries(r.personal).map(([id, p]) => ({ q: p.question, ids: [id] })) : [{ q: r.question, ids: null }]) {
      const misses = r.answers.filter((a) => !a.correct && (!q.ids || q.ids.includes(a.playerId))).length;
      if (misses > 0 && (!hardest || misses > hardest.misses)) {
        hardest = { text: q.q.text, answer: q.q.answer, solution: q.q.solution, misses };
      }
    }
    for (const a of r.answers) {
      if (a.correct && (!fastest || a.timeMs < fastest.timeMs)) {
        fastest = { playerId: a.playerId, name: nameOf(a.playerId), text: questionOf(r, a.playerId).text, timeMs: a.timeMs };
      }
    }
  }
  const review: RoundReview[] = history.map((r) => ({
    round: r.index + 1,
    text: r.question.text,
    answer: r.question.answer,
    solution: r.question.solution,
    activePlayerId: r.activePlayerId,
    answers: r.answers.map((a) => ({ playerId: a.playerId, value: a.value, text: a.text, correct: a.correct, timeMs: a.timeMs, ...(a.closest ? { closest: true } : {}) })),
    scorers: [...r.scorers],
    spared: r.spared,
    ...(r.personal
      ? {
          bombs: Object.entries(r.personal).map(([defuserId, p]) => ({
            authorId: p.authorId,
            defuserId,
            text: p.question.text,
            answer: p.question.answer,
            fallback: r.bombs?.[p.authorId]?.fallback ?? false,
          })),
        }
      : {}),
  }));
  return { rounds: history.length, review, players, hardest, fastest };
}

function playerReport(rank: number, player: PlayerState, history: RoundRecord[]): PlayerReport {
  const ops = new Map<OpTag, OpStat>();
  const timeline: PlayerReport["timeline"] = [];
  let fastestMs: number | null = null;
  for (const r of history) {
    const a = r.answers.find((x) => x.playerId === player.id);
    if (!a) continue;
    timeline.push({ round: r.index + 1, timeMs: a.correct ? a.timeMs : null, correct: a.correct });
    if (a.correct && (fastestMs === null || a.timeMs < fastestMs)) fastestMs = a.timeMs;
    for (const tag of questionOf(r, player.id).tags) {
      const s = ops.get(tag) ?? { tag, attempts: 0, correct: 0 };
      s.attempts += 1;
      if (a.correct) s.correct += 1;
      ops.set(tag, s);
    }
  }
  return {
    playerId: player.id,
    name: player.name,
    rank,
    score: player.score,
    alive: player.alive,
    eliminatedAt: player.eliminatedAt,
    answered: player.answered,
    correct: player.correct,
    accuracy: player.answered > 0 ? player.correct / player.answered : 0,
    avgCorrectMs: player.correct > 0 ? Math.round(player.correctTimeMs / player.correct) : null,
    fastestMs,
    bestStreak: player.bestStreak,
    byOperation: [...ops.values()],
    timeline,
  };
}
