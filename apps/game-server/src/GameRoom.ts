import { randomBytes, randomInt } from "node:crypto";
import { Room, ServerError, type AuthContext, type Client, type Delayed } from "@colyseus/core";
import {
  CODE_ALPHABET,
  CODE_LENGTH,
  BASIC_OPERATIONS,
  GAMES,
  GameEngine,
  JOIN_ERRORS,
  MAX_EXPRESSION_LENGTH,
  MAX_STEPS_LENGTH,
  MAX_PLAYERS,
  PUBLIC_LOBBY_DURATION_MS,
  buildReport,
  sanitizeSettings,
  type GameReport,
  type AdminRoomSummary,
  type GameSettings,
  type LobbyPlayer,
  type BasicOperation,
  type PlayerAnswer,
  type RatingChange,
  type RoomPhase,
  type RoomSnapshot,
  type RoundRecord,
  type RoundResultPayload,
} from "@calculus/game-core";
import { z } from "zod";
import { verifyGameToken, type GameIdentity } from "./token";
import { MAX_GAME_ROOMS, checkMatchmake } from "./limits";
import { clearInvites, persistGame } from "./persist";
import { PUBLIC_LOBBY_KEY, publicLobbies } from "./publicLobbies";

/** Durées des transitions, en ms. */
const COUNTDOWN_MS = 3000;
/** La bombe : temps pour montrer qui désamorce la bombe de qui, avant le désamorçage. */
const ASSIGN_MS = 3000;
/** Petite marge laissée aux réponses envoyées à la dernière milliseconde. */
const LATENCY_GRACE_MS = 150;
/** Temps laissé à un joueur déconnecté pour revenir, en secondes. */
const RECONNECT_SECONDS = 30;
/**
 * Nombre maximal de messages par joueur et par seconde, tous types confondus.
 * Assez large pour la saisie visible chiffre par chiffre suivie de la réponse ;
 * deviner en rafale reste impossible (une seule réponse par calcul).
 */
const MAX_MESSAGES_PER_SECOND = 20;

const activeCodes = new Set<string>();
/** Salles ouvertes dans ce processus, lues par la route d'administration (`/admin/rooms`). */
export const liveRooms = new Set<GameRoom>();

/**
 * Code de salle tiré avec `node:crypto` : avec `Math.random`, les codes affichés permettraient
 * de retrouver l'état du générateur, donc de prédire les graines des parties.
 */
function generateCode(): string {
  for (;;) {
    let code = "";
    for (let i = 0; i < CODE_LENGTH; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
    if (!activeCodes.has(code)) return code;
  }
}

interface Member {
  id: string;
  name: string;
  guest: boolean;
  client: Client;
  connected: boolean;
  ready: boolean;
  /** Fenêtre de limitation du nombre de messages. */
  rateWindowStart: number;
  rateCount: number;
}

/** Une réponse : un nombre, une expression ou un opérateur (la forme attendue par le jeu est vérifiée par le moteur). */
const answerSchema = z.union([
  z.object({ questionIndex: z.number().int().min(0), value: z.number().int().min(0).max(1_000_000) }).strict(),
  z.object({ questionIndex: z.number().int().min(0), expr: z.string().min(1).max(MAX_EXPRESSION_LENGTH) }).strict(),
  z.object({ questionIndex: z.number().int().min(0), op: z.enum(BASIC_OPERATIONS as [BasicOperation, ...BasicOperation[]]) }).strict(),
]);
const readySchema = z.object({ ready: z.boolean() });
/** Saisie visible : des chiffres, un opérateur (nombre manquant) ou des étapes séparées par « ; » (bon compte). */
const typingSchema = z.object({ value: z.string().max(MAX_STEPS_LENGTH).regex(/^[0-9+\-−×÷*x/:() ;]*$/) });
const kickSchema = z.object({ playerId: z.string().max(100) });
const bombSchema = z.object({ roundIndex: z.number().int().min(0), expr: z.string().min(1).max(MAX_EXPRESSION_LENGTH) });

/**
 * Une salle de jeu = un lobby. Elle reste ouverte d'une partie à l'autre,
 * ce qui permet de rejouer sans perdre les joueurs.
 *
 * Un lobby public (créé par `publicLobbies`, jamais par un navigateur) n'a pas d'hôte :
 * la partie se lance seule au bout de PUBLIC_LOBBY_DURATION_MS ou dès qu'il est plein,
 * et il disparaît si personne n'est venu.
 */
export class GameRoom extends Room {
  maxClients = MAX_PLAYERS;

  private code = "";
  private phase: RoomPhase = "lobby";
  private hostId = "";
  private settings: GameSettings = sanitizeSettings({});
  /** Membres, dans l'ordre d'arrivée (sert à transmettre l'hôte). */
  private members = new Map<string, Member>();
  private engine: GameEngine | null = null;
  private guestById = new Map<string, boolean>();
  private startedAt = 0;
  private deadline: number | null = null;
  private lastRound: RoundResultPayload | null = null;
  private report: GameReport | null = null;
  private ratings: Record<string, RatingChange> | null = null;
  private gameNumber = 0;
  private timer: Delayed | null = null;
  private createdAt = 0;
  private isPublic = false;
  /** Lobby public en attente : heure du lancement automatique (ms). */
  private autoStartAt: number | null = null;

  onCreate(options: { settings?: unknown; publicKey?: unknown }) {
    // Plafond global : les lobbys publics (créés par le serveur lui-même) passent toujours.
    if (options?.publicKey !== PUBLIC_LOBBY_KEY && liveRooms.size >= MAX_GAME_ROOMS) throw new ServerError(JOIN_ERRORS.busy, "busy");
    this.code = generateCode();
    activeCodes.add(this.code);
    this.roomId = this.code;
    // Salle privée : on n'y entre qu'avec son code (joinById), jamais par `join("game")` au hasard.
    void this.setPrivate(true);
    this.settings = sanitizeSettings(options?.settings ?? {});
    this.isPublic = options?.publicKey === PUBLIC_LOBBY_KEY;
    if (this.isPublic) {
      // Un lobby public se joue toujours en simultané, jamais « chacun son tour ».
      this.settings = sanitizeSettings({ ...this.settings, turnStyle: "simultaneous" });
      // Le lobby public attend ses joueurs même vide ; il sera supprimé à la fin de l'attente.
      this.autoDispose = false;
      this.autoStartAt = Date.now() + PUBLIC_LOBBY_DURATION_MS;
      this.timer = this.clock.setTimeout(() => this.autoStart(), PUBLIC_LOBBY_DURATION_MS);
      this.publishLobby();
    } else {
      this.autoDispose = true;
    }
    this.createdAt = Date.now();
    liveRooms.add(this);

    this.on("settings", (m, msg) => {
      if (m.id !== this.hostId || this.phase !== "lobby") return;
      if (typeof msg !== "object" || msg === null) return;
      this.settings = sanitizeSettings({ ...this.settings, ...msg });
      // Les réglages ont changé : chacun doit confirmer qu'il est prêt.
      for (const member of this.members.values()) member.ready = false;
      this.broadcastSnapshot();
    });

    this.on("ready", (m, msg) => {
      const parsed = readySchema.safeParse(msg);
      if (!parsed.success || this.phase !== "lobby") return;
      m.ready = parsed.data.ready;
      this.broadcastSnapshot();
    });

    this.on("start", (m) => {
      if (m.id !== this.hostId || this.phase !== "lobby") return;
      this.startGame(m);
    });

    this.on("replay-same", (m) => {
      if (m.id !== this.hostId || this.phase !== "finished") return;
      this.startGame(m);
    });

    this.on("replay-new", (m) => {
      if (m.id !== this.hostId || this.phase !== "finished") return;
      this.backToLobby();
    });

    this.on("kick", (m, msg) => {
      const parsed = kickSchema.safeParse(msg);
      if (!parsed.success || m.id !== this.hostId || this.phase !== "lobby") return;
      const target = this.members.get(parsed.data.playerId);
      if (target && target.id !== this.hostId) target.client.leave(4000);
    });

    this.on("answer", (m, msg, client) => this.handleAnswer(m, client, msg));

    this.on("bomb", (m, msg, client) => this.handleBomb(m, client, msg));

    this.on("hello", (m, _msg, client) => {
      client.send("welcome", { playerId: m.id });
      client.send("snapshot", this.snapshot(m.id));
    });

    this.on("typing", (m, msg, client) => {
      const parsed = typingSchema.safeParse(msg);
      const round = this.engine?.currentRound;
      if (!parsed.success || !round || this.phase !== "question" || round.activePlayerId !== m.id) return;
      this.broadcast("typing", { playerId: m.id, value: parsed.data.value }, { except: client });
    });

    // Type inconnu : ignoré en silence (sinon Colyseus le logue à chaque fois, logs inondables).
    this.onMessage("*", () => {});
  }

  /**
   * Vérifie le jeton remis par le site. Statique : Colyseus l'appelle pendant le matchmaking,
   * avant de créer la salle ou de réserver une place, donc sans jeton on ne crée rien.
   */
  static async onAuth(_token: string, options: { token?: unknown }, context: AuthContext): Promise<GameIdentity> {
    checkMatchmake(context);
    const identity = await verifyGameToken(options?.token);
    if (!identity) throw new ServerError(JOIN_ERRORS.badToken, "bad-token");
    return identity;
  }

  onJoin(client: Client, _options: unknown, auth: GameIdentity) {
    // Vérifications propres à la salle (l'authentification statique n'y a pas accès).
    if (this.phase !== "lobby") throw new ServerError(JOIN_ERRORS.inProgress, "in-progress");
    if (this.members.has(auth.id)) throw new ServerError(JOIN_ERRORS.duplicate, "duplicate");
    if (this.members.size >= MAX_PLAYERS) throw new ServerError(JOIN_ERRORS.full, "full");
    this.members.set(auth.id, {
      id: auth.id,
      name: auth.name,
      guest: auth.guest,
      client,
      connected: true,
      ready: false,
      rateWindowStart: 0,
      rateCount: 0,
    });
    if (!this.hostId && !this.isPublic) this.hostId = auth.id;
    client.send("welcome", { playerId: auth.id });
    if (this.isPublic && this.members.size >= MAX_PLAYERS) {
      // Lobby public plein : on lance sans attendre (startGame diffuse l'état).
      this.startGame();
      return;
    }
    this.publishLobby();
    this.broadcastSnapshot();
  }

  async onLeave(client: Client, consented: boolean) {
    const m = this.memberOf(client);
    if (!m) return;
    if (consented) {
      this.removeMember(m.id);
      return;
    }
    m.connected = false;
    this.broadcastSnapshot();
    try {
      const back = await this.allowReconnection(client, RECONNECT_SECONDS);
      m.client = back;
      m.connected = true;
      back.send("welcome", { playerId: m.id });
      this.broadcastSnapshot();
    } catch {
      this.removeMember(m.id);
    }
  }

  onDispose() {
    this.timer?.clear();
    activeCodes.delete(this.code);
    if (this.isPublic) publicLobbies.release(this.code);
    liveRooms.delete(this);
    clearInvites(this.code);
  }

  /** Résumé pour le panel administrateur : jamais la réponse du calcul en cours. */
  adminSummary(): AdminRoomSummary {
    // Vu par personne : à la bombe, aucune bombe n'y figure (chacun ne reçoit que la sienne).
    const snap = this.snapshot("");
    return {
      code: this.code,
      phase: this.phase,
      game: this.settings.game,
      mode: this.settings.mode,
      difficulty: this.settings.difficulty,
      createdAt: this.createdAt,
      startedAt: this.phase === "lobby" ? null : this.startedAt,
      gameNumber: this.gameNumber,
      roundIndex: snap.roundIndex,
      totalRounds: snap.totalRounds,
      question: snap.question?.text ?? null,
      players: snap.players.map((p) => ({
        id: p.id,
        name: p.name,
        isHost: p.isHost,
        isGuest: p.isGuest,
        connected: p.connected,
        score: p.score,
        alive: p.alive,
      })),
    };
  }

  /* ---------------------------------------------------------------- */

  private memberOf(client: Client): Member | undefined {
    for (const m of this.members.values()) if (m.client.sessionId === client.sessionId) return m;
    return undefined;
  }

  /** Déclare un message : l'expéditeur doit être membre de la salle et respecter le rate limit. */
  private on(type: string, handler: (m: Member, msg: unknown, client: Client) => void) {
    this.onMessage(type, (client, msg: unknown) => {
      const m = this.memberOf(client);
      if (!m || !this.allowMessage(m, Date.now())) return;
      handler(m, msg, client);
    });
  }

  /** Limite le nombre de messages pour empêcher de « deviner » en rafale. */
  private allowMessage(m: Member, now: number): boolean {
    if (now - m.rateWindowStart > 1000) {
      m.rateWindowStart = now;
      m.rateCount = 0;
    }
    m.rateCount += 1;
    return m.rateCount <= MAX_MESSAGES_PER_SECOND;
  }

  private removeMember(id: string) {
    this.members.delete(id);
    if (this.engine && this.phase !== "lobby" && this.phase !== "finished") {
      this.engine.setConnected(id, false);
      const round = this.engine.currentRound;
      if (this.phase === "build") {
        // La bombe : partie finie (la manche est annulée), ou tous ceux qui restent ont envoyé leur bombe.
        if (this.engine.rules.isGameOver(this.engine)) {
          this.engine.closeRound();
          this.finish();
          return;
        }
        if (this.engine.bombPlayers.every((p) => round?.bombs?.[p.id])) {
          this.endBuild();
          return;
        }
      }
      if (this.phase === "question" && round && this.engine.rules.shouldCloseEarly(this.engine, round)) {
        this.closeRound();
        return;
      }
      if (this.engine.rules.isGameOver(this.engine) && (this.phase === "question" || this.phase === "assign")) {
        this.closeRound();
        return;
      }
    }
    if (id === this.hostId) {
      // L'hôte part : la main passe au joueur arrivé le plus tôt.
      const next = this.members.values().next();
      this.hostId = next.done ? "" : next.value.id;
    }
    this.publishLobby();
    this.broadcastSnapshot();
  }

  /** Met à jour la fiche du lobby public sur l'accueil, tant qu'il attend ses joueurs. */
  private publishLobby() {
    if (!this.isPublic || this.autoStartAt === null) return;
    publicLobbies.update({
      code: this.code,
      settings: this.settings,
      players: this.members.size,
      maxPlayers: MAX_PLAYERS,
      startsAt: this.autoStartAt,
    });
  }

  /** Fin de l'attente d'un lobby public : on lance avec ceux qui sont là, ou on supprime le lobby. */
  private autoStart() {
    const anyone = [...this.members.values()].some((m) => m.connected);
    if (anyone) {
      this.startGame();
      return;
    }
    this.autoStartAt = null;
    publicLobbies.release(this.code);
    void this.disconnect();
  }

  /** `host` : l'hôte qui a demandé le lancement (absent pour un lobby public qui se lance seul). */
  private startGame(host?: Member) {
    // Ceux qui ont quitté pendant la partie précédente ne sont pas repris.
    const present = [...this.members.values()].filter((m) => m.connected).length;
    if (present < GAMES[this.settings.game].minPlayers) {
      host?.client.send("error", { code: "not-enough-players" });
      return;
    }
    this.timer?.clear();
    for (const [id, m] of this.members) if (!m.connected) this.members.delete(id);
    if (this.members.size === 0) return;
    if (this.isPublic && this.autoStartAt !== null) {
      // Le lobby public quitte l'accueil (un autre le remplace) et se ferme une fois vide, comme un lobby privé.
      this.autoStartAt = null;
      publicLobbies.release(this.code);
      this.autoDispose = true;
    }
    const players = [...this.members.values()].map((m) => ({ id: m.id, name: m.name }));
    this.guestById = new Map([...this.members.values()].map((m) => [m.id, m.guest]));
    // Graine imprévisible (`node:crypto`) : qui la devine connaît tous les calculs de la partie.
    this.engine = new GameEngine(this.settings, players, randomBytes(16).toString("base64url"));
    this.gameNumber += 1;
    this.report = null;
    this.ratings = null;
    this.lastRound = null;
    this.startedAt = Date.now();
    this.phase = "countdown";
    this.deadline = this.startedAt + COUNTDOWN_MS;
    void this.lock();
    // Partie lancée : les invitations encore en attente vers ce lobby n'ont plus lieu d'être.
    clearInvites(this.code);
    this.broadcastSnapshot();
    this.timer = this.clock.setTimeout(() => this.nextRound(), COUNTDOWN_MS);
  }

  private nextRound() {
    const engine = this.engine;
    if (!engine) return;
    const now = Date.now();
    const round = engine.startRound(now);
    if (!round) {
      this.finish();
      return;
    }
    if (round.stage === "build") {
      this.phase = "build";
      this.deadline = round.startedAt + round.timeLimitMs;
      this.broadcastSnapshot();
      this.timer = this.clock.setTimeout(() => this.endBuild(), round.timeLimitMs + LATENCY_GRACE_MS);
      return;
    }
    this.phase = "question";
    this.deadline = round.startedAt + round.timeLimitMs;
    this.broadcastSnapshot();
    this.timer = this.clock.setTimeout(() => this.closeRound(), round.timeLimitMs + LATENCY_GRACE_MS);
  }

  /** La bombe : une bombe envoyée pendant la construction. */
  private handleBomb(m: Member, client: Client, msg: unknown) {
    const engine = this.engine;
    const round = engine?.currentRound;
    const parsed = bombSchema.safeParse(msg);
    if (!engine || !round || this.phase !== "build" || !parsed.success || parsed.data.roundIndex !== round.index) {
      client.send("bomb-ack", { roundIndex: round?.index ?? -1, accepted: false, reason: "invalid" });
      return;
    }
    const res = engine.submitBomb(m.id, parsed.data.expr);
    client.send("bomb-ack", { roundIndex: round.index, accepted: res.accepted, reason: res.reason, text: res.text, value: res.value });
    if (res.accepted && res.allBuilt) this.endBuild();
    else if (res.accepted) this.broadcastSnapshot();
  }

  /** La bombe : fin de la construction, on montre qui reçoit quoi, puis le désamorçage commence. */
  private endBuild() {
    const engine = this.engine;
    if (!engine || this.phase !== "build") return;
    this.timer?.clear();
    const solveAt = Date.now() + ASSIGN_MS;
    if (!engine.closeBuild(solveAt)) return;
    this.phase = "assign";
    this.deadline = solveAt;
    this.broadcastSnapshot();
    this.timer = this.clock.setTimeout(() => this.startSolve(), ASSIGN_MS);
  }

  private startSolve() {
    const round = this.engine?.currentRound;
    if (!round || this.phase !== "assign") return;
    this.phase = "question";
    this.deadline = round.startedAt + round.timeLimitMs;
    this.broadcastSnapshot();
    this.timer = this.clock.setTimeout(() => this.closeRound(), round.timeLimitMs + LATENCY_GRACE_MS);
  }

  private handleAnswer(m: Member, client: Client, msg: unknown) {
    const now = Date.now();
    const engine = this.engine;
    if (!engine || this.phase !== "question") return;
    const parsed = answerSchema.safeParse(msg);
    const round = engine.currentRound;
    if (!parsed.success || !round || parsed.data.questionIndex !== round.index) {
      client.send("answer-refused", { reason: "invalid" });
      return;
    }
    // Le temps est mesuré ici, par le serveur, à la réception.
    const { questionIndex: _questionIndex, ...answer } = parsed.data;
    const res = engine.submit(m.id, answer as PlayerAnswer, Math.min(now, round.startedAt + round.timeLimitMs));
    if (!res.accepted) {
      client.send("answer-refused", { reason: res.reason ?? "refused" });
      return;
    }
    client.send("answer-ack", { correct: res.correct ?? false, timeMs: res.timeMs ?? 0, questionIndex: round.index });
    if (res.roundCanClose) this.closeRound();
    else this.broadcastSnapshot();
  }

  private closeRound() {
    const engine = this.engine;
    if (!engine || (this.phase !== "question" && this.phase !== "assign")) return;
    this.timer?.clear();
    const rec = engine.closeRound();
    if (!rec) return;
    this.lastRound = {
      index: rec.index,
      text: rec.question.text,
      answer: rec.question.answer,
      solution: rec.question.solution,
      puzzle: rec.question.puzzle,
      answers: rec.answers,
      ...(rec.personal
        ? {
            bombs: Object.entries(rec.personal).map(([defuserId, p]) => ({
              authorId: p.authorId,
              defuserId,
              text: p.question.text,
              answer: p.question.answer,
              fallback: rec.bombs?.[p.authorId]?.fallback ?? false,
            })),
          }
        : {}),
      eliminated: rec.eliminated,
      scorers: rec.scorers,
      spared: rec.spared,
    };
    // Pause propre au mode (`resultMs`) : la réponse et les points sont diffusés, plus aucune réponse n'est acceptée.
    this.phase = "round-result";
    this.deadline = Date.now() + engine.rules.resultMs;
    this.broadcastSnapshot();
    this.timer = this.clock.setTimeout(() => (engine.isOver ? this.finish() : this.nextRound()), engine.rules.resultMs);
  }

  private finish() {
    const engine = this.engine;
    if (!engine) return;
    this.timer?.clear();
    this.phase = "finished";
    this.deadline = null;
    this.report = buildReport(engine.standings(), engine.history);
    this.broadcastSnapshot();
    const hostIsGuest = this.guestById.get(this.hostId) ?? true;
    const gameNumber = this.gameNumber;
    void persistGame({
      code: this.code,
      engine,
      startedAt: new Date(this.startedAt),
      hostUserId: hostIsGuest ? null : this.hostId,
      guestById: this.guestById,
    }).then((ratings) => {
      // Ignoré si une autre partie a déjà commencé ou si la salle est revenue au lobby entre-temps.
      if (!ratings || Object.keys(ratings).length === 0 || this.phase !== "finished" || this.gameNumber !== gameNumber) return;
      this.ratings = ratings;
      this.broadcastSnapshot();
    });
  }

  private backToLobby() {
    this.timer?.clear();
    for (const [id, m] of this.members) if (!m.connected) this.members.delete(id);
    for (const m of this.members.values()) m.ready = false;
    this.engine = null;
    this.report = null;
    this.ratings = null;
    this.lastRound = null;
    this.deadline = null;
    this.phase = "lobby";
    void this.unlock();
    this.broadcastSnapshot();
  }

  /** Instantané de la salle vu par un joueur (à la bombe, chacun ne reçoit que sa propre bombe). */
  private snapshot(forId: string): RoomSnapshot {
    const engine = this.engine;
    const inGame = engine && this.phase !== "lobby";
    const round = engine?.currentRound ?? null;
    const building = this.phase === "build";
    let players: LobbyPlayer[];
    if (inGame && engine) {
      players = engine.standings().map(({ player }) => {
        const m = this.members.get(player.id);
        return {
          id: player.id,
          name: player.name,
          isHost: player.id === this.hostId,
          ready: m?.ready ?? false,
          connected: !!m?.connected,
          isGuest: this.guestById.get(player.id) ?? true,
          score: player.score,
          alive: player.alive,
          answeredThisRound: building ? !!round?.bombs?.[player.id] : !!round?.answers.some((a) => a.playerId === player.id),
        };
      });
    } else {
      players = [...this.members.values()].map((m) => ({
        id: m.id,
        name: m.name,
        isHost: m.id === this.hostId,
        ready: m.ready,
        connected: m.connected,
        isGuest: m.guest,
        score: 0,
        alive: true,
        answeredThisRound: false,
      }));
    }
    return {
      code: this.code,
      phase: this.phase,
      hostId: this.hostId,
      isPublic: this.isPublic,
      autoStartAt: this.autoStartAt,
      settings: this.settings,
      players,
      maxPlayers: MAX_PLAYERS,
      roundIndex: round ? round.index : (engine?.roundsPlayed ?? 0),
      totalRounds: engine && this.settings.mode === "speed-race" ? engine.totalRounds : null,
      question: round && (this.phase === "question" || building) ? this.questionFor(round, forId) : null,
      bomb:
        round?.bombs && engine
          ? {
              built: Object.keys(round.bombs).filter((id) => !round.bombs![id]!.fallback),
              mine: round.bombs[forId]?.expr ?? null,
              pairs: round.personal ? Object.entries(round.personal).map(([defuserId, p]) => ({ authorId: p.authorId, defuserId })) : null,
            }
          : null,
      activePlayerId: round?.activePlayerId ?? null,
      deadline: this.deadline,
      timeLimitMs: round && (this.phase === "question" || building) ? round.timeLimitMs : null,
      serverNow: Date.now(),
      lastRound: this.phase === "round-result" || this.phase === "finished" ? this.lastRound : null,
      report: this.report,
      ratings: this.ratings,
      gameNumber: this.gameNumber,
    };
  }

  /** Le calcul montré à ce joueur : le tirage pendant la construction, sa bombe au désamorçage (aucune s'il n'en a pas). */
  private questionFor(round: RoundRecord, forId: string): RoomSnapshot["question"] {
    if (this.phase !== "question" || !round.personal) return { index: round.index, text: round.question.text, puzzle: round.question.puzzle };
    const mine = round.personal[forId]?.question;
    return mine ? { index: round.index, text: mine.text, puzzle: mine.puzzle } : null;
  }

  /** Chaque membre reçoit son propre instantané (identique pour tous, sauf à la bombe). */
  private broadcastSnapshot() {
    for (const m of this.members.values()) if (m.connected) m.client.send("snapshot", this.snapshot(m.id));
  }
}
