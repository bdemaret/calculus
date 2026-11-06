import { request } from "@playwright/test";
import { Client, type Room } from "colyseus.js";
import { BAG_SIZE, DUNGEON_MAX_LIVES, DUNGEON_ROOM, roomsTowardBoss, solveDungeonQuestion, wrongDungeonAnswer, type DungeonSettings, type DungeonSnapshot, type DungeonView } from "@calculus/game-core";
import { GAME_HTTP_URL, WEB_URL } from "../env";
import { newUser, signUp, type TestUser } from "./test";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const gameClient = () => new Client(GAME_HTTP_URL.replace("http", "ws"));

/** Ce que fait le bot face à un calcul : juste, faux, ou rien (le temps s'écoule). */
export type DungeonMove = "right" | "wrong" | "idle";

/** Ce que voit le bot pour décider : la vue de l'expédition et le calcul en cours. */
export type DungeonPolicy = (game: DungeonView, question: NonNullable<DungeonView["question"]>) => DungeonMove;

/**
 * Un coéquipier de donjon qui parle directement au serveur de jeu. Les donjons sont réservés aux comptes :
 * le bot s'inscrit (compte neuf), puis demande son jeton à `/api/game-token` avec sa session, comme le site.
 * Par défaut il va dans la salle la plus proche du boss, verrouille, répond juste et garde son butin.
 */
export class DungeonBot {
  snapshot: DungeonSnapshot | null = null;
  readonly snapshots: DungeonSnapshot[] = [];
  readonly acks: { type: string; message: unknown }[] = [];
  playerId: string | null = null;
  policy: DungeonPolicy = () => "right";
  /** Salle choisie au positionnement (par défaut la plus proche du boss), null pour ne rien choisir. */
  room: (game: DungeonView) => string | null = (game) => roomsTowardBoss(game)[0]?.key ?? null;
  private done = new Set<string>();

  private constructor(
    readonly user: TestUser,
    readonly colyseus: Room,
  ) {
    colyseus.onMessage("welcome", (m: { playerId: string }) => (this.playerId = m.playerId));
    colyseus.onMessage("snapshot", (s: DungeonSnapshot) => this.onSnapshot(s));
    for (const type of ["answer-ack", "answer-refused", "error"]) colyseus.onMessage(type, (message: unknown) => this.acks.push({ type, message }));
    colyseus.send("hello", {});
  }

  /** Un compte neuf et son jeton de jeu. */
  static async account(user: TestUser = newUser()): Promise<{ user: TestUser; token: string }> {
    const api = await request.newContext({ baseURL: WEB_URL });
    try {
      await signUp(api, user);
      const res = await api.post("/api/game-token", { data: {} });
      if (!res.ok()) throw new Error(`game-token ${res.status()}`);
      return { user, token: ((await res.json()) as { token: string }).token };
    } finally {
      await api.dispose();
    }
  }

  static async join(code: string): Promise<DungeonBot> {
    const { user, token } = await DungeonBot.account();
    return new DungeonBot(user, await gameClient().joinById(code, { token }));
  }

  static async create(settings: Partial<DungeonSettings> = {}): Promise<DungeonBot> {
    const { user, token } = await DungeonBot.account();
    return new DungeonBot(user, await gameClient().create(DUNGEON_ROOM, { token, settings }));
  }

  get code(): string {
    return this.colyseus.roomId;
  }

  send(type: string, message: unknown) {
    this.colyseus.send(type, message);
  }

  async leave() {
    await this.colyseus.leave(true).catch(() => {});
  }

  async waitFor(pred: (s: DungeonSnapshot) => boolean, timeoutMs = 30_000): Promise<DungeonSnapshot> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (this.snapshot && pred(this.snapshot)) return this.snapshot;
      await sleep(50);
    }
    throw new Error(`${this.user.name} : état attendu non reçu (phase ${this.snapshot?.phase})`);
  }

  private once(key: string): boolean {
    if (this.done.has(key)) return false;
    this.done.add(key);
    return true;
  }

  private onSnapshot(s: DungeonSnapshot) {
    this.snapshot = s;
    this.snapshots.push(s);
    const g = s.game;
    if (!g || !this.playerId) return;
    const me = g.players.find((p) => p.id === this.playerId);
    const round = `${s.gameNumber}:${g.round}`;
    if (g.phase === "positioning" && me?.standing && this.once(`pick:${round}`)) {
      const key = this.room(g);
      if (key !== null) {
        this.colyseus.send("pick", { room: key });
        this.colyseus.send("lock", {});
      }
    }
    if (g.phase === "loot") {
      const mine = g.loot.find((l) => l.holderId === this.playerId && l.givenTo === null && !l.lost);
      const fits = mine && (mine.item === "heart" ? (me?.lives ?? 0) < DUNGEON_MAX_LIVES : (me?.bag.length ?? 0) < BAG_SIZE);
      if (mine && fits && this.once(`loot:${round}`)) this.colyseus.send("give-loot", { to: this.playerId });
    }
    const q = g.question;
    // Le calcul se lit à la réception : une momie le cache ensuite (texte vide). Une tête d'hydre repoussée change le texte.
    if ((g.phase === "combat" || g.phase === "boss") && q?.text && this.once(`q:${round}:${g.phase}:${q.index}:${q.text}:${q.count}`)) {
      const move = this.policy(g, q);
      if (move === "idle") return;
      const right = solveDungeonQuestion(q);
      this.colyseus.send("answer", { index: q.index, ...(move === "right" ? right : wrongDungeonAnswer(right)) });
    }
  }
}
