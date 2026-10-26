import { GAMES, answerKindOf, assignBombs, bombValue, defuseQuestion, fallbackBomb, type BombError, type GameDefinition } from "./games";
import { OPERATION_SYMBOL } from "./generator";
import { MODES, type GameModeRules } from "./modes";
import { BATTLE_ROYALE_ROUND_CAP } from "./settings";
import type { GameSettings, PlayerAnswer, PlayerInfo, PlayerState, RoundRecord, Standing } from "./types";

export type SubmitRefusal = "no-round" | "unknown-player" | "not-allowed" | "already-answered" | "invalid-value";

/** Résultat de l'envoi d'une bombe (étape de construction). */
export interface BombSubmitResult {
  accepted: boolean;
  reason?: SubmitRefusal | BombError;
  /** La bombe telle qu'elle sera montrée, et sa valeur. */
  text?: string;
  value?: number;
  /** Tous les joueurs en lice ont envoyé leur bombe : on peut passer au désamorçage. */
  allBuilt: boolean;
}

export interface SubmitResult {
  accepted: boolean;
  reason?: SubmitRefusal;
  correct?: boolean;
  timeMs?: number;
  /** La manche peut se terminer (tout le monde a répondu, ou quelqu'un a trouvé en course de vitesse). */
  roundCanClose: boolean;
}

/**
 * Moteur de partie, sans aucune dépendance au réseau ni à l'affichage.
 * Le temps est toujours passé en paramètre (`now`, en ms) : le serveur utilise
 * sa propre horloge, ce qui empêche un joueur de tricher sur son temps.
 */
export class GameEngine {
  readonly settings: GameSettings;
  readonly seed: string;
  readonly players: PlayerState[];
  readonly rules: GameModeRules;
  /** Le jeu (ce qu'on résout) ; `rules` est le mode (comment on gagne). */
  readonly game: GameDefinition;
  readonly history: RoundRecord[] = [];
  readonly totalRounds: number;
  currentRound: RoundRecord | null = null;
  private turnCursor = 0;

  constructor(settings: GameSettings, players: PlayerInfo[], seed: string) {
    if (players.length === 0) throw new Error("Une partie demande au moins un joueur");
    this.settings = settings;
    this.seed = seed;
    this.rules = MODES[settings.mode];
    this.game = GAMES[settings.game];
    this.players = players.map((p) => ({
      id: p.id,
      name: p.name,
      score: 0,
      alive: true,
      eliminatedAt: null,
      connected: true,
      answered: 0,
      correct: 0,
      correctTimeMs: 0,
      streak: 0,
      bestStreak: 0,
    }));
    if (settings.mode === "battle-royale") this.totalRounds = BATTLE_ROYALE_ROUND_CAP;
    else this.totalRounds = settings.turnStyle === "turns" ? settings.rounds * players.length : settings.rounds;
  }

  get roundsPlayed(): number {
    return this.history.length;
  }

  get isOver(): boolean {
    return this.currentRound === null && this.rules.isGameOver(this);
  }

  player(id: string): PlayerState | undefined {
    return this.players.find((p) => p.id === id);
  }

  /** Joueurs qui peuvent encore jouer dans ce mode. */
  private eligible(): PlayerState[] {
    return this.players.filter((p) => p.connected && (!this.rules.eliminates || p.alive));
  }

  private nextActivePlayer(): string | null {
    const n = this.players.length;
    for (let i = 0; i < n; i++) {
      const p = this.players[(this.turnCursor + i) % n]!;
      if (p.connected && (!this.rules.eliminates || p.alive)) {
        this.turnCursor = (this.turnCursor + i + 1) % n;
        return p.id;
      }
    }
    return null;
  }

  /** Démarre la manche suivante. Renvoie null si la partie est terminée. */
  startRound(now: number): RoundRecord | null {
    if (this.currentRound) return this.currentRound;
    if (this.rules.isGameOver(this) || this.eligible().length === 0) return null;
    const index = this.history.length;
    let question = this.game.generate(this.seed, index, this.settings);
    const previous = this.history[index - 1];
    if (previous && previous.question.text === question.text) {
      question = this.game.generate(`${this.seed}:bis`, index, this.settings);
    }
    const bomb = this.settings.game === "bomb";
    this.currentRound = {
      index,
      question,
      activePlayerId: this.settings.turnStyle === "turns" ? this.nextActivePlayer() : null,
      startedAt: now,
      // La bombe commence par la construction, à durée fixe ; le désamorçage suit (`closeBuild`).
      timeLimitMs: bomb ? this.settings.buildTime * 1000 : this.questionTimeMs(index),
      answers: [],
      eliminated: [],
      scorers: [],
      spared: false,
      ...(bomb ? { stage: "build" as const, bombs: {} } : {}),
    };
    return this.currentRound;
  }

  private questionTimeMs(index: number): number {
    return Math.round(this.settings.timePerQuestion * 1000 * this.rules.timeFactor(index));
  }

  /** La bombe : joueurs qui construisent et désamorcent (en vie et connectés). */
  get bombPlayers(): PlayerState[] {
    return this.players.filter((p) => p.alive && p.connected);
  }

  /** La bombe : enregistre la bombe d'un joueur pendant la construction. Une seule par joueur et par manche. */
  submitBomb(playerId: string, expr: string): BombSubmitResult {
    const round = this.currentRound;
    const allBuilt = () => this.bombPlayers.every((p) => round?.bombs?.[p.id]);
    if (!round || round.stage !== "build" || !round.bombs) return { accepted: false, reason: "no-round", allBuilt: false };
    const p = this.player(playerId);
    if (!p) return { accepted: false, reason: "unknown-player", allBuilt: false };
    if (!p.alive || !p.connected) return { accepted: false, reason: "not-allowed", allBuilt: allBuilt() };
    if (round.bombs[playerId]) return { accepted: false, reason: "already-answered", allBuilt: allBuilt() };
    if (round.question.puzzle.game !== "bomb") return { accepted: false, reason: "no-round", allBuilt: false };
    const checked = bombValue(round.question.puzzle, expr);
    if ("error" in checked) return { accepted: false, reason: checked.error, allBuilt: allBuilt() };
    round.bombs[playerId] = { expr: checked.text, fallback: false };
    return { accepted: true, text: checked.text, value: checked.value, allBuilt: allBuilt() };
  }

  /**
   * La bombe : fin de la construction. Les joueurs sans bombe en reçoivent une de secours, chaque bombe
   * part chez un autre joueur, et le désamorçage commence à `solveAt` (le temps de montrer qui reçoit quoi).
   */
  closeBuild(solveAt: number): RoundRecord | null {
    const round = this.currentRound;
    if (!round || round.stage !== "build" || !round.bombs || round.question.puzzle.game !== "bomb") return null;
    const puzzle = round.question.puzzle;
    const players = this.bombPlayers.map((p) => p.id);
    for (const id of players) {
      if (!round.bombs[id]) round.bombs[id] = { expr: fallbackBomb(puzzle, `${this.seed}:${round.index}:${id}`).expr, fallback: true };
    }
    const personal: NonNullable<RoundRecord["personal"]> = {};
    for (const [authorId, defuserId] of Object.entries(assignBombs(players, `${this.seed}:${round.index}`))) {
      const checked = bombValue(puzzle, round.bombs[authorId]!.expr);
      // Une bombe enregistrée est toujours valide ; une bombe de secours au pire hors règles reste calculable.
      const value = "value" in checked ? checked.value : Number(round.bombs[authorId]!.expr);
      personal[defuserId] = { question: defuseQuestion(round.index, round.question.difficulty, round.bombs[authorId]!.expr, value), authorId };
    }
    round.personal = personal;
    round.stage = "solve";
    round.startedAt = solveAt;
    round.timeLimitMs = this.questionTimeMs(round.index);
    return round;
  }

  /** Le calcul que ce joueur doit résoudre dans la manche (le sien à la bombe). */
  questionFor(round: RoundRecord, playerId: string) {
    return round.personal?.[playerId]?.question ?? round.question;
  }

  /** Temps restant de la manche en cours, en ms. */
  remainingMs(now: number): number {
    const r = this.currentRound;
    if (!r) return 0;
    return Math.max(0, r.startedAt + r.timeLimitMs - now);
  }

  isExpired(now: number): boolean {
    return this.currentRound !== null && this.remainingMs(now) <= 0;
  }

  canAnswer(playerId: string): boolean {
    const p = this.player(playerId);
    const r = this.currentRound;
    if (!p || !r) return false;
    if (r.answers.some((a) => a.playerId === playerId)) return false;
    if (r.stage === "build" || (r.personal && !r.personal[playerId])) return false;
    return this.rules.canAnswer(this, p);
  }

  /**
   * Enregistre une réponse. Une seule réponse par joueur et par manche.
   * Un nombre seul vaut `{ value }` (la forme attendue par le calcul standard).
   */
  submit(playerId: string, input: PlayerAnswer | number, now: number): SubmitResult {
    const answer: PlayerAnswer = typeof input === "number" ? { value: input } : input;
    const round = this.currentRound;
    if (!round) return { accepted: false, reason: "no-round", roundCanClose: false };
    const p = this.player(playerId);
    if (!p) return { accepted: false, reason: "unknown-player", roundCanClose: false };
    if (round.answers.some((a) => a.playerId === playerId)) {
      return { accepted: false, reason: "already-answered", roundCanClose: false };
    }
    if (!this.rules.canAnswer(this, p)) return { accepted: false, reason: "not-allowed", roundCanClose: false };
    // La bombe : on ne répond qu'au désamorçage, et seulement si l'on a reçu une bombe.
    if (round.stage === "build" || (round.personal && !round.personal[playerId])) {
      return { accepted: false, reason: "not-allowed", roundCanClose: false };
    }
    const question = this.questionFor(round, playerId);
    if (answerKindOf(answer) !== this.game.answerKind(question) || ("value" in answer && !Number.isFinite(answer.value))) {
      return { accepted: false, reason: "invalid-value", roundCanClose: false };
    }

    if (this.game.isValid && !this.game.isValid(question, answer)) {
      return { accepted: false, reason: "invalid-value", roundCanClose: false };
    }

    const timeMs = Math.min(round.timeLimitMs, Math.max(0, now - round.startedAt));
    const correct = this.game.check(question, answer);
    const value = "value" in answer ? answer.value : null;
    // Un opérateur est gardé sous son symbole affiché (« ÷ »), comme dans les énoncés.
    const text = "expr" in answer ? answer.expr : "op" in answer ? OPERATION_SYMBOL[answer.op] : null;
    round.answers.push({ playerId, value, text, correct, timeMs });
    p.answered += 1;
    if (correct) {
      p.correct += 1;
      p.correctTimeMs += timeMs;
      p.streak += 1;
      p.bestStreak = Math.max(p.bestStreak, p.streak);
    } else {
      p.streak = 0;
    }
    return { accepted: true, correct, timeMs, roundCanClose: this.rules.shouldCloseEarly(this, round) };
  }

  /** Clôt la manche : temps écoulés, points, éliminations. */
  closeRound(): RoundRecord | null {
    const round = this.currentRound;
    if (!round) return null;
    if (round.stage === "build") {
      // Partie finie pendant la construction (départs) : la manche est annulée, sans effet.
      this.currentRound = null;
      return null;
    }
    // Les joueurs concernés qui n'ont pas répondu comptent comme une erreur
    // (sauf en course de vitesse simultanée, où un autre a pu trouver avant eux).
    const missedCounts = this.rules.eliminates || this.settings.turnStyle === "turns";
    if (missedCounts) {
      const concerned =
        this.settings.turnStyle === "turns"
          ? this.players.filter((p) => p.id === round.activePlayerId)
          : this.players.filter((p) => p.alive && p.connected);
      for (const p of concerned) {
        if (!round.answers.some((a) => a.playerId === p.id)) {
          round.answers.push({ playerId: p.id, value: null, text: null, correct: false, timeMs: round.timeLimitMs });
          p.answered += 1;
          p.streak = 0;
        }
      }
    }
    this.rules.resolveRound(this, round);
    this.game.resolveExtras?.(this, round);
    this.history.push(round);
    this.currentRound = null;
    return round;
  }

  /** Un joueur se déconnecte (ou revient). En battle royale, partir vaut élimination. */
  setConnected(playerId: string, connected: boolean): void {
    const p = this.player(playerId);
    if (!p) return;
    p.connected = connected;
    if (!connected && this.rules.eliminates && p.alive) {
      p.alive = false;
      p.eliminatedAt = this.currentRound?.index ?? this.history.length;
    }
  }

  standings(): Standing[] {
    const sorted = [...this.players].sort((a, b) => this.rules.compare(a, b));
    const out: Standing[] = [];
    sorted.forEach((player, i) => {
      const prev = out[i - 1];
      const tied = prev && this.rules.compare(prev.player, player) === 0;
      out.push({ rank: tied ? prev.rank : i + 1, player });
    });
    return out;
  }

  winners(): PlayerState[] {
    return this.standings()
      .filter((s) => s.rank === 1)
      .map((s) => s.player);
  }
}
