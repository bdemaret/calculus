"use client";
import type { Room } from "colyseus.js";
import { DUNGEON_ROOM, type DungeonServerMessages, type DungeonSettings, type DungeonSnapshot } from "@calculus/game-core";
import { JoinError, fetchToken, getClient, leaveLobby, toJoinError } from "./colyseus";

/*
 * Connexion à un donjon. Comme pour les lobbys (`colyseus.ts`), la salle est gardée ici pour survivre au
 * passage de la page de création à celle du donjon, avec la même reprise après une coupure. Mais elle ne
 * suit pas le joueur sur le reste du site : quitter les pages du donjon quitte le donjon (`releaseDungeon`).
 */

const RECONNECT_KEY = "calculus:reconnect-dungeon";
/** Code de fermeture d'un départ voulu (quitter, exclusion) : rien à reconnecter. */
const CONSENTED_CLOSE = 4000;
/** Le serveur garde la place 30 s : on retente jusque-là. */
const RECONNECT_WINDOW_MS = 28_000;
const RECONNECT_RETRY_MS = 1000;
/** Silence du serveur au-delà duquel la connexion est tenue pour coupée (réseau de téléphone qui décroche). */
const HEARTBEAT_MS = 4000;
const SILENCE_MS = 10_000;
/** Délai avant de quitter un donjon dont on a fermé la page : une page qui se remonte aussitôt le garde. */
const RELEASE_DELAY_MS = 1500;

export interface DungeonState {
  playerId: string | null;
  snapshot: DungeonSnapshot | null;
  /** Écart entre l'horloge du serveur et la nôtre, en ms (à retirer d'une heure serveur). */
  clockOffset: number;
  lastAck: DungeonServerMessages["answer-ack"] | null;
  /** Dernier refus d'une action (code et heure locale), pour l'annoncer brièvement. */
  lastError: { code: string; at: number } | null;
  reconnecting: boolean;
  left: boolean;
}

let current: Room | null = null;
let releaseTimer: ReturnType<typeof setTimeout> | null = null;
const currentListeners = new Set<() => void>();
const stores = new WeakMap<Room, { state: DungeonState; listeners: Set<() => void> }>();

function setCurrent(room: Room | null) {
  current = room;
  currentListeners.forEach((l) => l());
}

export function subscribeCurrentDungeon(listener: () => void): () => void {
  currentListeners.add(listener);
  return () => currentListeners.delete(listener);
}

export function readCurrentDungeon(): Room | null {
  return current;
}

export function subscribeDungeon(room: Room, listener: () => void): () => void {
  const store = stores.get(room);
  if (!store) return () => {};
  store.listeners.add(listener);
  return () => store.listeners.delete(listener);
}

export function readDungeon(room: Room): DungeonState | null {
  return stores.get(room)?.state ?? null;
}

function attach(room: Room, previous?: DungeonState) {
  const store = {
    state: { playerId: null, snapshot: null, clockOffset: 0, lastAck: null, lastError: null, reconnecting: false, left: false, ...previous } as DungeonState,
    listeners: new Set<() => void>(),
  };
  const update = (patch: Partial<DungeonState>) => {
    store.state = { ...store.state, ...patch };
    store.listeners.forEach((l) => l());
  };
  let lastHeard = Date.now();
  let lastBeat = lastHeard;
  let dropped = false;
  const drop = () => {
    if (dropped) return;
    dropped = true;
    clearInterval(heartbeat);
    update({ reconnecting: true });
    void room.leave(false);
    void recover(room, () => store.state, () => update({ reconnecting: false, left: true }));
  };
  const heartbeat = setInterval(() => {
    const now = Date.now();
    // Onglet en arrière-plan : le minuteur a pris du retard, ce silence ne prouve rien.
    if (now - lastBeat > 2 * HEARTBEAT_MS) lastHeard = now;
    lastBeat = now;
    if (now - lastHeard > SILENCE_MS) drop();
    else room.send("hello", {});
  }, HEARTBEAT_MS);
  room.onMessage("welcome", (m: { playerId: string }) => update({ playerId: m.playerId }));
  room.onMessage("snapshot", (snap: DungeonSnapshot) => {
    lastHeard = Date.now();
    const patch: Partial<DungeonState> = { snapshot: snap, clockOffset: snap.serverNow - Date.now() };
    if (store.state.snapshot && store.state.snapshot.gameNumber !== snap.gameNumber) patch.lastAck = null;
    update(patch);
  });
  room.onMessage("answer-ack", (ack: DungeonServerMessages["answer-ack"]) => update({ lastAck: ack }));
  room.onMessage("answer-refused", () => {});
  room.onMessage("error", (m: DungeonServerMessages["error"]) => update({ lastError: { code: m.code, at: Date.now() } }));
  room.onLeave((code) => {
    if (dropped) return;
    if (code !== CONSENTED_CLOSE) {
      drop();
      return;
    }
    clearInterval(heartbeat);
    update({ left: true });
    if (current === room) setCurrent(null);
  });
  stores.set(room, store);
  room.send("hello", {});
}

function remember(room: Room, previous?: DungeonState) {
  attach(room, previous);
  if (current && current !== room) void current.leave(true);
  setCurrent(room);
  try {
    sessionStorage.setItem(RECONNECT_KEY, JSON.stringify({ roomId: room.roomId, token: room.reconnectionToken }));
  } catch {}
}

async function recover(room: Room, lastState: () => DungeonState, giveUp: () => void) {
  const token = room.reconnectionToken;
  const deadline = Date.now() + RECONNECT_WINDOW_MS;
  while (current === room && Date.now() < deadline) {
    try {
      const back = await getClient().reconnect(token);
      if (current !== room) {
        void back.leave(true);
        return;
      }
      current = null;
      remember(back, { ...lastState(), reconnecting: false });
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, RECONNECT_RETRY_MS));
    }
  }
  giveUp();
  if (current === room) setCurrent(null);
}

/** Crée un donjon (compte connecté seulement : le serveur refuse un jeton d'invité). */
export async function createDungeon(settings: DungeonSettings): Promise<Room> {
  try {
    // On n'est jamais dans un lobby et un donjon à la fois.
    leaveLobby();
    const token = await fetchToken("");
    const room = await getClient().create(DUNGEON_ROOM, { token, settings });
    remember(room);
    return room;
  } catch (err) {
    throw toJoinError(err);
  }
}

let pending: { code: string; promise: Promise<Room> } | null = null;

/** Rejoint un donjon par son code : connexion existante, reprise d'une place gardée, sinon entrée normale. */
export function joinDungeon(code: string): Promise<Room> {
  keepDungeon();
  if (current && current.roomId === code) return Promise.resolve(current);
  if (pending && pending.code === code) return pending.promise;
  const promise = doJoin(code).finally(() => {
    if (pending?.promise === promise) pending = null;
  });
  pending = { code, promise };
  return promise;
}

async function doJoin(code: string): Promise<Room> {
  leaveLobby();
  try {
    const saved = JSON.parse(sessionStorage.getItem(RECONNECT_KEY) ?? "null") as { roomId: string; token: string } | null;
    if (saved && saved.roomId === code && saved.token) {
      const room = await getClient().reconnect(saved.token);
      remember(room);
      return room;
    }
  } catch {
    // La reprise a échoué : on entre comme un nouveau joueur.
  }
  try {
    const token = await fetchToken("");
    const room = await getClient().joinById(code, { token });
    remember(room);
    return room;
  } catch (err) {
    throw toJoinError(err);
  }
}

export function leaveDungeon() {
  if (releaseTimer) clearTimeout(releaseTimer);
  releaseTimer = null;
  try {
    sessionStorage.removeItem(RECONNECT_KEY);
  } catch {}
  const room = current;
  setCurrent(null);
  void room?.leave(true);
}

/** La page du donjon se démonte : on quitte, sauf si une page du donjon se remonte aussitôt (`keepDungeon`). */
export function releaseDungeon() {
  if (releaseTimer) clearTimeout(releaseTimer);
  releaseTimer = setTimeout(leaveDungeon, RELEASE_DELAY_MS);
}

export function keepDungeon() {
  if (releaseTimer) clearTimeout(releaseTimer);
  releaseTimer = null;
}

export { JoinError };
