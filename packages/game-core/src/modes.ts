import { BATTLE_ROYALE_ROUND_CAP } from "./settings";
import type { AnswerRecord, GameModeId, PlayerState, RoundRecord } from "./types";
import type { GameEngine } from "./engine";

/**
 * Un mode de jeu répond à quelques questions simples.
 * Pour ajouter un mode : créer un objet qui respecte cette interface et l'ajouter à MODES.
 */
export interface GameModeRules {
  id: GameModeId;
  /** Le mode élimine-t-il des joueurs ? */
  eliminates: boolean;
  /** Ce joueur peut-il répondre à la manche en cours ? */
  canAnswer(engine: GameEngine, player: PlayerState): boolean;
  /** Après une réponse : la manche peut-elle se terminer tout de suite ? */
  shouldCloseEarly(engine: GameEngine, round: RoundRecord): boolean;
  /** Applique les points et éliminations à la fin de la manche. */
  resolveRound(engine: GameEngine, round: RoundRecord): void;
  /** La partie est-elle terminée ? */
  isGameOver(engine: GameEngine): boolean;
  /** Tri du classement (négatif si a est devant b). */
  compare(a: PlayerState, b: PlayerState): number;
  /** Coefficient appliqué au temps de la manche (le battle royale accélère). */
  timeFactor(roundIndex: number): number;
  /** En ligne, pause après chaque manche (ms) : bonne réponse et points affichés, aucune réponse acceptée. */
  resultMs: number;
}

/** Course de vitesse : le point se joue souvent en une seconde, les autres ont besoin de voir qui l'a pris et la réponse. */
export const SPEED_RACE_RESULT_MS = 4000;

const answered = (round: RoundRecord, id: string) => round.answers.some((a) => a.playerId === id);
const answerOf = (round: RoundRecord, id: string) => round.answers.find((a) => a.playerId === id);
/** La réponse l'emporte : juste, ou la plus proche quand personne n'a trouvé (le bon compte). */
const wins = (a: AnswerRecord | undefined) => !!a && (a.correct || !!a.closest);
const byTime = (a: PlayerState, b: PlayerState) => a.correctTimeMs - b.correctTimeMs;

export const battleRoyale: GameModeRules = {
  id: "battle-royale",
  eliminates: true,
  canAnswer(engine, player) {
    if (!player.alive || !player.connected) return false;
    const round = engine.currentRound;
    if (!round) return false;
    if (engine.settings.turnStyle === "turns") return round.activePlayerId === player.id;
    return true;
  },
  shouldCloseEarly(engine, round) {
    if (engine.settings.turnStyle === "turns") return round.answers.length > 0;
    return engine.players.filter((p) => p.alive && p.connected).every((p) => answered(round, p.id));
  },
  resolveRound(engine, round) {
    const concerned =
      engine.settings.turnStyle === "turns"
        ? engine.players.filter((p) => p.id === round.activePlayerId)
        : engine.players.filter((p) => p.alive);
    const failed = concerned.filter((p) => !wins(answerOf(round, p.id)));
    for (const p of concerned) if (wins(answerOf(round, p.id))) p.score += 1;

    const multiplayer = engine.players.length > 1;
    const everyoneFailed = failed.length === concerned.length && failed.length > 1;
    if (multiplayer && engine.settings.turnStyle === "simultaneous" && everyoneFailed) {
      // Tous les survivants se trompent : personne n'est éliminé, sinon il n'y aurait pas de gagnant.
      round.spared = true;
      return;
    }
    for (const p of failed) {
      p.alive = false;
      p.eliminatedAt = round.index;
      round.eliminated.push(p.id);
    }
  },
  isGameOver(engine) {
    const alive = engine.players.filter((p) => p.alive && p.connected).length;
    if (engine.roundsPlayed >= BATTLE_ROYALE_ROUND_CAP) return true;
    return engine.players.length > 1 ? alive <= 1 : alive === 0;
  },
  compare(a, b) {
    if (a.alive !== b.alive) return a.alive ? -1 : 1;
    if (!a.alive && !b.alive && a.eliminatedAt !== b.eliminatedAt) return (b.eliminatedAt ?? 0) - (a.eliminatedAt ?? 0);
    if (a.score !== b.score) return b.score - a.score;
    return byTime(a, b);
  },
  timeFactor(roundIndex) {
    // Le temps diminue de 3 % par manche, sans descendre sous 40 %.
    return Math.max(0.4, Math.pow(0.97, roundIndex));
  },
  resultMs: 2200,
};

export const speedRace: GameModeRules = {
  id: "speed-race",
  eliminates: false,
  canAnswer(engine, player) {
    if (!player.connected) return false;
    const round = engine.currentRound;
    if (!round) return false;
    if (engine.settings.turnStyle === "turns") return round.activePlayerId === player.id;
    return true;
  },
  shouldCloseEarly(engine, round) {
    if (engine.settings.turnStyle === "turns") return round.answers.length > 0;
    if (round.answers.some((a) => a.correct)) return true;
    return engine.players.filter((p) => p.connected).every((p) => answered(round, p.id));
  },
  resolveRound(engine, round) {
    // Les réponses sont enregistrées dans l'ordre d'arrivée : la première juste gagne le point,
    // sinon la première des plus proches (le bon compte).
    const winner = round.answers.find((a) => a.correct) ?? round.answers.find((a) => a.closest);
    if (!winner) return;
    const p = engine.players.find((x) => x.id === winner.playerId);
    if (p) {
      p.score += 1;
      round.scorers.push(p.id);
    }
  },
  isGameOver(engine) {
    if (engine.players.every((p) => !p.connected)) return true;
    return engine.roundsPlayed >= engine.totalRounds;
  },
  compare(a, b) {
    if (a.score !== b.score) return b.score - a.score;
    return byTime(a, b);
  },
  timeFactor() {
    return 1;
  },
  resultMs: SPEED_RACE_RESULT_MS,
};

export const MODES: Record<GameModeId, GameModeRules> = {
  "battle-royale": battleRoyale,
  "speed-race": speedRace,
};
