import { Client, type Room } from "colyseus.js";
import { evaluateText, type GameSettings, type RoomSnapshot } from "@calculus/game-core";
import { GAME_HTTP_URL, WEB_URL } from "../env";

export type BotMove = "right" | "wrong" | "idle";

/** Ce que fait le bot à un calcul : répondre juste, faux, ou rien. Avec un délai et une saisie visible en option. */
export interface BotPlan {
  move: BotMove;
  delayMs?: number;
  /** En « chacun son tour » : envoie la saisie chiffre par chiffre avant de valider. */
  typeFirst?: boolean;
}

export type BotPolicy = (q: { index: number; text: string }, snap: RoomSnapshot) => BotMove | BotPlan;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Un faux joueur qui parle directement au serveur de jeu, comme le ferait le site :
 * jeton invité demandé à `/api/game-token`, puis connexion Colyseus.
 * Permet de remplir un lobby ou de jouer un adversaire au comportement prévisible.
 */
export class Bot {
  snapshot: RoomSnapshot | null = null;
  playerId: string | null = null;
  /** Tous les instantanés reçus, dans l'ordre. */
  readonly snapshots: RoomSnapshot[] = [];
  policy: BotPolicy = () => "idle";
  private answered = new Set<string>();

  private constructor(
    readonly name: string,
    readonly room: Room,
  ) {
    room.onMessage("welcome", (m: { playerId: string }) => (this.playerId = m.playerId));
    room.onMessage("snapshot", (s: RoomSnapshot) => this.onSnapshot(s));
    for (const type of ["answer-ack", "answer-refused", "typing", "error"]) room.onMessage(type, () => {});
    room.send("hello", {});
  }

  static async token(name: string): Promise<string> {
    const res = await fetch(`${WEB_URL}/api/game-token`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) throw new Error(`game-token ${res.status}`);
    return ((await res.json()) as { token: string }).token;
  }

  /** `token` : un jeton déjà obtenu (par exemple celui d'un compte connecté) ; sinon un jeton invité. */
  static async join(code: string, name: string, token?: string): Promise<Bot> {
    const room = await new Client(GAME_HTTP_URL.replace("http", "ws")).joinById(code, { token: token ?? (await Bot.token(name)) });
    return new Bot(name, room);
  }

  static async create(name: string, settings: Partial<GameSettings>): Promise<Bot> {
    const room = await new Client(GAME_HTTP_URL.replace("http", "ws")).create("game", { token: await Bot.token(name), settings });
    return new Bot(name, room);
  }

  get code(): string {
    return this.room.roomId;
  }

  play(policy: BotPolicy) {
    this.policy = policy;
  }

  ready(ready = true) {
    this.room.send("ready", { ready });
  }

  start() {
    this.room.send("start", {});
  }

  send(type: string, message: unknown) {
    this.room.send(type, message);
  }

  async leave() {
    await this.room.leave(true).catch(() => {});
  }

  /** Attend un instantané qui vérifie la condition. */
  async waitFor(pred: (s: RoomSnapshot) => boolean, timeoutMs = 20_000): Promise<RoomSnapshot> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (this.snapshot && pred(this.snapshot)) return this.snapshot;
      await sleep(50);
    }
    throw new Error(`${this.name} : état attendu non reçu (phase ${this.snapshot?.phase})`);
  }

  private onSnapshot(s: RoomSnapshot) {
    this.snapshot = s;
    this.snapshots.push(s);
    const q = s.question;
    if (s.phase !== "question" || !q) return;
    if (s.settings.turnStyle === "turns" && s.activePlayerId !== this.playerId) return;
    const key = `${s.gameNumber}:${q.index}`;
    if (this.answered.has(key)) return;
    this.answered.add(key);
    const raw = this.policy(q, s);
    const plan: BotPlan = typeof raw === "string" ? { move: raw } : raw;
    if (plan.move === "idle") return;
    void this.answer(q, plan);
  }

  private async answer(q: { index: number; text: string }, plan: BotPlan) {
    const right = evaluateText(q.text);
    const value = String(plan.move === "right" ? right : right + 1);
    if (plan.typeFirst) {
      for (let i = 1; i <= value.length; i++) {
        this.room.send("typing", { value: value.slice(0, i) });
        await sleep(150);
      }
    }
    if (plan.delayMs) await sleep(plan.delayMs);
    this.room.send("answer", { value: Number(value), questionIndex: q.index });
  }
}

/** Plusieurs bots à la suite dans le même lobby (en parallèle, le serveur reçoit tout d'un coup). */
export async function joinBots(code: string, names: string[]): Promise<Bot[]> {
  const bots: Bot[] = [];
  for (const n of names) bots.push(await Bot.join(code, n));
  return bots;
}
