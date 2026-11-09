import { randomBytes } from "node:crypto";
import { Room, ServerError, type AuthContext, type Client, type Delayed } from "@colyseus/core";
import {
  BASIC_OPERATIONS,
  ITEM_IDS,
  DUNGEON_INTRO_MS,
  DUNGEON_MAX_PLAYERS,
  DUNGEON_MIN_PLAYERS,
  DungeonEngine,
  JOIN_ERRORS,
  sanitizeDungeonSettings,
  type AdminDungeonSummary,
  type BasicOperation,
  type ItemId,
  type DungeonMember,
  type DungeonRoomError,
  type DungeonRoomPhase,
  type DungeonSettings,
  type DungeonSnapshot,
  type DungeonSummary,
  type Unlock,
} from "@calculus/game-core";
import { z } from "zod";
import { verifyGameToken, type GameIdentity } from "./token";
import { MAX_GAME_ROOMS, checkMatchmake } from "./limits";
import { clearInvites, persistDungeon } from "./persist";
import { activeCodes, generateCode, liveDungeons } from "./codes";
import { liveRooms } from "./GameRoom";

/** Compte à rebours avant la première manche, en ms. */
const COUNTDOWN_MS = 3000;
/** Petite marge laissée aux réponses envoyées à la dernière milliseconde (comme `GameRoom`). */
const LATENCY_GRACE_MS = 150;
/** Temps laissé à un joueur déconnecté pour revenir, en secondes. */
const RECONNECT_SECONDS = 30;
/** Messages par joueur et par seconde, tous types confondus (une seule réponse par calcul de toute façon). */
const MAX_MESSAGES_PER_SECOND = 20;

interface Member {
  id: string;
  name: string;
  title: string | null;
  client: Client;
  connected: boolean;
  rateWindowStart: number;
  rateCount: number;
}

const settingsSchema = z.object({ difficulty: z.number().int().min(1).max(5) }).strict();
const kickSchema = z.object({ playerId: z.string().max(100) }).strict();
/** Clé d'une salle : « étage-rang ». */
const roomKeySchema = z.string().regex(/^[1-9]-\d{1,2}$/);
const pickSchema = z.object({ room: roomKeySchema }).strict();
const answerSchema = z.union([
  z.object({ index: z.number().int().min(0).max(1000), value: z.number().int().min(0).max(1_000_000) }).strict(),
  z.object({ index: z.number().int().min(0).max(1000), op: z.enum(BASIC_OPERATIONS as [BasicOperation, ...BasicOperation[]]) }).strict(),
]);
const lootSchema = z.object({ to: z.string().min(1).max(100) }).strict();
const itemSchema = z.enum(ITEM_IDS as [ItemId, ...ItemId[]]);
const useItemSchema = z.object({ item: itemSchema, target: roomKeySchema.optional() }).strict();
const giveItemSchema = z.object({ item: itemSchema, to: z.string().min(1).max(100) }).strict();
const dropItemSchema = z.object({ item: itemSchema }).strict();

/**
 * Une salle Donjons = un lobby privé de 2 à 4 comptes, qui reste ouvert d'une expédition à l'autre.
 * On n'y entre qu'avec le code (ou une invitation, qui le donne) ; les invités sont refusés dès le matchmaking.
 * Les règles sont dans `DungeonEngine` (game-core) ; la salle tient l'horloge et relaie les messages.
 */
export class DungeonRoom extends Room {
  maxClients = DUNGEON_MAX_PLAYERS;

  private code = "";
  private phase: DungeonRoomPhase = "lobby";
  private hostId = "";
  private settings: DungeonSettings = sanitizeDungeonSettings({});
  /** Membres, dans l'ordre d'arrivée (ordre des couloirs, et de transmission de l'hôte). */
  private members = new Map<string, Member>();
  private engine: DungeonEngine | null = null;
  private startedAt = 0;
  private countdownEndsAt: number | null = null;
  private summary: DungeonSummary | null = null;
  private runId: string | null = null;
  /** Succès débloqués par la dernière expédition, par id de joueur. */
  private unlocks: Record<string, Unlock[]> | null = null;
  private gameNumber = 0;
  private timer: Delayed | null = null;
  private createdAt = 0;

  onCreate(options: { settings?: unknown }) {
    if (liveRooms.size + liveDungeons.size >= MAX_GAME_ROOMS) throw new ServerError(JOIN_ERRORS.busy, "busy");
    this.code = generateCode();
    activeCodes.add(this.code);
    this.roomId = this.code;
    // Toujours privée : on n'y entre qu'avec son code (joinById).
    void this.setPrivate(true);
    this.autoDispose = true;
    this.settings = sanitizeDungeonSettings(options?.settings ?? {});
    this.createdAt = Date.now();
    liveDungeons.add(this);

    this.on("hello", (m, _msg, client) => {
      client.send("welcome", { playerId: m.id });
      client.send("snapshot", this.snapshot(m.id));
    });

    this.on("settings", (m, msg) => {
      const parsed = settingsSchema.safeParse(msg);
      if (!parsed.success || m.id !== this.hostId || this.phase !== "lobby") return;
      this.settings = sanitizeDungeonSettings(parsed.data);
      this.broadcastSnapshot();
    });

    this.on("start", (m) => {
      if (m.id !== this.hostId || this.phase !== "lobby") return;
      this.startGame(m);
    });

    this.on("back-to-lobby", (m) => {
      if (m.id !== this.hostId || this.phase !== "finished") return;
      this.backToLobby();
    });

    this.on("kick", (m, msg) => {
      const parsed = kickSchema.safeParse(msg);
      if (!parsed.success || m.id !== this.hostId || this.phase !== "lobby") return;
      const target = this.members.get(parsed.data.playerId);
      if (target && target.id !== this.hostId) target.client.leave(4000);
    });

    this.on("pick", (m, msg, client) => {
      const parsed = pickSchema.safeParse(msg);
      if (!parsed.success || !this.engine) return this.refuse(client);
      if (!this.engine.pick(m.id, parsed.data.room).ok) return this.refuse(client);
      this.broadcastSnapshot();
    });

    this.on("lock", (m, _msg, client) => {
      const engine = this.engine;
      if (!engine || !engine.lock(m.id).ok) return this.refuse(client);
      if (engine.allLocked) this.step(() => engine.closePositioning(Date.now()));
      else this.broadcastSnapshot();
    });

    this.on("answer", (m, msg, client) => this.handleAnswer(m, client, msg));

    this.on("give-loot", (m, msg, client) => {
      const parsed = lootSchema.safeParse(msg);
      const engine = this.engine;
      if (!parsed.success || !engine || !engine.giveLoot(m.id, parsed.data.to).ok) return this.refuse(client);
      if (engine.lootDone) this.step(() => engine.closeLoot(Date.now()));
      else this.broadcastSnapshot();
    });

    // Sac : chaque action est vérifiée par le moteur (phase, objet présent, cible). Une bombe peut finir l'expédition.
    this.on("use-item", (m, msg, client) => {
      const parsed = useItemSchema.safeParse(msg);
      const engine = this.engine;
      if (!parsed.success || !engine) return this.refuse(client);
      let ok = false;
      this.step(() => {
        ok = engine.useItem(m.id, parsed.data.item, parsed.data.target).ok;
      });
      if (!ok) this.refuse(client);
    });

    this.on("give-item", (m, msg, client) => {
      const parsed = giveItemSchema.safeParse(msg);
      const engine = this.engine;
      if (!parsed.success || !engine || !engine.giveItem(m.id, parsed.data.to, parsed.data.item).ok) return this.refuse(client);
      this.broadcastSnapshot();
    });

    this.on("drop-item", (m, msg, client) => {
      const parsed = dropItemSchema.safeParse(msg);
      const engine = this.engine;
      if (!parsed.success || !engine || !engine.dropItem(m.id, parsed.data.item).ok) return this.refuse(client);
      this.broadcastSnapshot();
    });

    // Type inconnu : ignoré en silence (sinon Colyseus le logue à chaque fois, logs inondables).
    this.onMessage("*", () => {});
  }

  /**
   * Vérifie le jeton pendant le matchmaking (avant toute création) : comptes seulement,
   * un invité n'entre jamais dans un donjon.
   */
  static async onAuth(_token: string, options: { token?: unknown }, context: AuthContext): Promise<GameIdentity> {
    checkMatchmake(context);
    const identity = await verifyGameToken(options?.token);
    if (!identity) throw new ServerError(JOIN_ERRORS.badToken, "bad-token");
    if (identity.guest || identity.id.startsWith("guest_")) throw new ServerError(JOIN_ERRORS.accountRequired, "account-required");
    return identity;
  }

  onJoin(client: Client, _options: unknown, auth: GameIdentity) {
    if (this.phase !== "lobby") throw new ServerError(JOIN_ERRORS.inProgress, "in-progress");
    if (this.members.has(auth.id)) throw new ServerError(JOIN_ERRORS.duplicate, "duplicate");
    if (this.members.size >= DUNGEON_MAX_PLAYERS) throw new ServerError(JOIN_ERRORS.full, "full");
    this.members.set(auth.id, { id: auth.id, name: auth.name, title: auth.title, client, connected: true, rateWindowStart: 0, rateCount: 0 });
    if (!this.hostId) this.hostId = auth.id;
    client.send("welcome", { playerId: auth.id });
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
      // Entre-temps, le lancement d'une partie ou le retour au lobby a retiré ce membre absent (et le même compte
      // a pu revenir) : cette ancienne place n'existe plus, on ferme la connexion reprise.
      if (this.members.get(m.id) !== m) {
        back.leave(4000);
        return;
      }
      m.client = back;
      m.connected = true;
      back.send("welcome", { playerId: m.id });
      this.broadcastSnapshot();
    } catch {
      // Seulement si c'est toujours lui : un joueur revenu sous le même compte ne doit pas être retiré à sa place.
      if (this.members.get(m.id) === m) this.removeMember(m.id);
    }
  }

  onDispose() {
    this.timer?.clear();
    activeCodes.delete(this.code);
    liveDungeons.delete(this);
    clearInvites(this.code);
  }

  /** Résumé pour le panel administrateur : vu par personne (aucun calcul, aucune réponse). */
  adminSummary(): AdminDungeonSummary {
    const snap = this.snapshot("");
    const game = snap.game;
    return {
      code: this.code,
      phase: this.phase,
      difficulty: this.settings.difficulty,
      createdAt: this.createdAt,
      startedAt: this.phase === "lobby" ? null : this.startedAt,
      gameNumber: this.gameNumber,
      round: game ? game.round : null,
      score: game?.score ?? this.summary?.score ?? 0,
      boss: game?.boss ? { hp: game.boss.hp, maxHp: game.boss.maxHp } : null,
      players: snap.members.map((m) => ({
        id: m.id,
        name: m.name,
        isHost: m.isHost,
        connected: m.connected,
        lives: game?.players.find((p) => p.id === m.id)?.lives ?? null,
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

  private allowMessage(m: Member, now: number): boolean {
    if (now - m.rateWindowStart > 1000) {
      m.rateWindowStart = now;
      m.rateCount = 0;
    }
    m.rateCount += 1;
    return m.rateCount <= MAX_MESSAGES_PER_SECOND;
  }

  private refuse(client: Client, code: DungeonRoomError = "refused") {
    client.send("error", { code });
  }

  private removeMember(id: string) {
    this.members.delete(id);
    const engine = this.engine;
    // Pendant le compte à rebours, le moteur n'a pas commencé : on le retire simplement de l'expédition.
    if (engine && this.phase === "countdown") engine.leave(id, Date.now());
    if (engine && this.phase !== "lobby" && this.phase !== "countdown" && this.phase !== "finished") {
      // Départ définitif : sa série en cours est ratée ; le moteur dit si la manche (ou l'expédition) peut se clore.
      this.step(() => {
        engine.leave(id, Date.now());
        this.advanceIfReady(engine);
      });
    }
    if (id === this.hostId) {
      const next = this.members.values().next();
      this.hostId = next.done ? "" : next.value.id;
    }
    this.broadcastSnapshot();
  }

  private startGame(host: Member) {
    const present = [...this.members.values()].filter((m) => m.connected);
    if (present.length < DUNGEON_MIN_PLAYERS) {
      this.refuse(host.client, "not-enough-players");
      return;
    }
    this.timer?.clear();
    for (const [id, m] of this.members) if (!m.connected) this.members.delete(id);
    const players = [...this.members.values()].map((m) => ({ id: m.id, name: m.name }));
    // Graine imprévisible (`node:crypto`) : qui la devine connaît toutes les séries de l'expédition.
    this.engine = new DungeonEngine(this.settings, players, randomBytes(16).toString("base64url"), { graceMs: LATENCY_GRACE_MS, introMs: DUNGEON_INTRO_MS });
    this.gameNumber += 1;
    this.summary = null;
    this.runId = null;
    this.unlocks = null;
    this.startedAt = Date.now();
    this.phase = "countdown";
    this.countdownEndsAt = this.startedAt + COUNTDOWN_MS;
    void this.lock();
    clearInvites(this.code);
    this.broadcastSnapshot();
    this.timer = this.clock.setTimeout(() => {
      const engine = this.engine;
      if (!engine || this.phase !== "countdown") return;
      this.countdownEndsAt = null;
      this.step(() => engine.start(Date.now()));
    }, COUNTDOWN_MS);
  }

  private handleAnswer(m: Member, client: Client, msg: unknown) {
    // Le temps est mesuré ici, par le serveur, à la réception.
    const now = Date.now();
    const engine = this.engine;
    const parsed = answerSchema.safeParse(msg);
    if (!engine || !parsed.success || engine.questionIndex(m.id) !== parsed.data.index) {
      client.send("answer-refused", { reason: "invalid" });
      return;
    }
    const { index: _index, ...answer } = parsed.data;
    const res = engine.submit(m.id, answer, now);
    if (!res.accepted) {
      client.send("answer-refused", { reason: "refused" });
      return;
    }
    client.send("answer-ack", { index: parsed.data.index, correct: res.correct, done: res.done });
    this.step(() => this.advanceIfReady(engine));
  }

  /** Clôt ce qui peut l'être sans attendre l'échéance : combat fini, tous verrouillés, butin donné. */
  private advanceIfReady(engine: DungeonEngine) {
    const now = Date.now();
    if (engine.phase === "positioning" && engine.allLocked) engine.closePositioning(now);
    if (engine.phase === "combat" && engine.combatOver) engine.closeCombat(now);
    if (engine.phase === "loot" && engine.lootDone) engine.closeLoot(now);
  }

  /** Échéance atteinte : applique ce que le moteur attend à cet instant. */
  private onDeadline() {
    const engine = this.engine;
    if (!engine) return;
    this.step(() => {
      const now = Date.now();
      switch (engine.phase) {
        case "positioning":
          engine.closePositioning(now);
          break;
        case "combat":
          engine.expire(now);
          if (engine.combatOver) engine.closeCombat(now);
          break;
        case "loot":
          engine.closeLoot(now);
          break;
        case "round-result":
          engine.advance(now);
          break;
        case "boss":
          engine.expire(now);
          break;
        case "finished":
          break;
      }
    });
  }

  /**
   * Applique un changement au moteur, puis recale la salle : phase, fin d'expédition, prochaine échéance, snapshots.
   * Toute modification du moteur passe par ici.
   */
  private step(change: () => void) {
    const engine = this.engine;
    if (!engine) return;
    change();
    this.timer?.clear();
    this.timer = null;
    if (engine.isOver) {
      if (this.phase !== "finished") this.finish(engine);
      return;
    }
    this.phase = engine.phase;
    const deadline = engine.nextDeadline();
    // Le moteur compte « dépassé » strictement après l'échéance : on se réveille juste après.
    if (deadline !== null) this.timer = this.clock.setTimeout(() => this.onDeadline(), Math.max(0, deadline - Date.now() + 1));
    this.broadcastSnapshot();
  }

  private finish(engine: DungeonEngine) {
    this.phase = "finished";
    this.summary = engine.summary();
    this.broadcastSnapshot();
    const gameNumber = this.gameNumber;
    void persistDungeon({ code: this.code, engine, startedAt: new Date(this.startedAt) }).then((saved) => {
      // Ignoré si la salle est revenue au lobby ou a relancé entre-temps.
      if (!saved || this.phase !== "finished" || this.gameNumber !== gameNumber) return;
      this.runId = saved.id;
      this.unlocks = saved.unlocks;
      this.broadcastSnapshot();
    });
  }

  private backToLobby() {
    this.timer?.clear();
    for (const [id, m] of this.members) if (!m.connected) this.members.delete(id);
    this.engine = null;
    this.summary = null;
    this.runId = null;
    this.unlocks = null;
    this.countdownEndsAt = null;
    this.phase = "lobby";
    void this.unlock();
    this.broadcastSnapshot();
  }

  /** Instantané vu par un joueur : son propre calcul seulement, jamais une réponse en cours. */
  private snapshot(forId: string): DungeonSnapshot {
    const now = Date.now();
    const members: DungeonMember[] = [...this.members.values()].map((m) => ({
      id: m.id,
      name: m.name,
      title: m.title,
      isHost: m.id === this.hostId,
      connected: m.connected,
    }));
    const game = this.engine && this.phase !== "lobby" && this.phase !== "countdown" ? this.engine.view(forId, now) : null;
    return {
      code: this.code,
      phase: this.phase,
      hostId: this.hostId,
      settings: this.settings,
      members,
      minPlayers: DUNGEON_MIN_PLAYERS,
      maxPlayers: DUNGEON_MAX_PLAYERS,
      deadline: this.phase === "countdown" ? this.countdownEndsAt : (game?.phaseEndsAt ?? null),
      serverNow: now,
      game,
      summary: this.summary,
      runId: this.runId,
      unlocks: this.unlocks,
      gameNumber: this.gameNumber,
    };
  }

  private broadcastSnapshot() {
    for (const m of this.members.values()) if (m.connected) m.client.send("snapshot", this.snapshot(m.id));
  }
}
