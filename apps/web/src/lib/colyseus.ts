"use client";
import { Client, type Room } from "colyseus.js";
import { JOIN_ERRORS, PRESENCE_ROOM, type GameSettings, type PublicLobbyList, type RoomSnapshot, type ServerMessages } from "@calculus/game-core";

/**
 * Connexion au serveur de jeu. La salle en cours est gardée ici pour survivre
 * aux changements de page (création du lobby → page du lobby).
 */
let client: Client | null = null;
let current: Room | null = null;

const RECONNECT_KEY = "calculus:reconnect";

/**
 * Adresse du serveur de jeu. Si elle vise `localhost` alors que la page est ouverte depuis une autre
 * machine (téléphone sur le réseau local, ex. http://192.168.1.102:3000), `localhost` désignerait cet
 * appareil : on prend alors l'hôte de la page, en gardant le port du serveur de jeu.
 */
function gameServerUrl(): string {
  const url = new URL(process.env.NEXT_PUBLIC_GAME_SERVER_URL ?? "ws://localhost:2567");
  const local = ["localhost", "127.0.0.1", "[::1]"];
  if (typeof window !== "undefined" && local.includes(url.hostname) && !local.includes(window.location.hostname)) {
    url.hostname = window.location.hostname;
  }
  return url.toString().replace(/\/$/, "");
}

function getClient(): Client {
  client = client ?? new Client(gameServerUrl());
  return client;
}

/** Lobbys publics ouverts sur le serveur de jeu (route HTTP `/lobbies`, même adresse en http(s)). */
export async function fetchPublicLobbies(signal?: AbortSignal): Promise<PublicLobbyList> {
  const base = gameServerUrl().replace(/^ws/, "http").replace(/\/$/, "");
  const res = await fetch(`${base}/lobbies`, { cache: "no-store", signal });
  if (!res.ok) throw new Error(`lobbies ${res.status}`);
  return (await res.json()) as PublicLobbyList;
}

export type JoinErrorCode = "locked" | "bad-token" | "in-progress" | "duplicate" | "full" | "not-found" | "server-down" | "name-required" | "generic";

export class JoinError extends Error {
  constructor(public code: JoinErrorCode) {
    super(code);
  }
}

function toJoinError(err: unknown): JoinError {
  if (err instanceof JoinError) return err;
  const e = err as { code?: number; message?: string } | undefined;
  const msg = String(e?.message ?? "");
  switch (e?.code) {
    case JOIN_ERRORS.badToken:
      return new JoinError("bad-token");
    case JOIN_ERRORS.inProgress:
      return new JoinError("in-progress");
    case JOIN_ERRORS.duplicate:
      return new JoinError("duplicate");
    case JOIN_ERRORS.full:
      return new JoinError("full");
  }
  if (/locked/i.test(msg)) return new JoinError("locked");
  if (/not found|introuvable|invalid/i.test(msg)) return new JoinError("not-found");
  if (/full/i.test(msg)) return new JoinError("full");
  if (/ECONNREFUSED|Failed to fetch|NetworkError|offline|websocket/i.test(msg)) return new JoinError("server-down");
  return new JoinError("generic");
}

/** Demande au site un jeton pour entrer dans un lobby. */
async function fetchToken(name: string): Promise<string> {
  const res = await fetch("/api/game-token", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (res.status === 400) throw new JoinError("name-required");
  if (!res.ok) throw new JoinError("generic");
  const data = (await res.json()) as { token: string };
  return data.token;
}

/**
 * État reçu du serveur pour la salle en cours. Les écouteurs sont branchés dès la connexion,
 * pour ne perdre aucun message pendant le changement de page.
 */
export interface LobbyState {
  playerId: string | null;
  snapshot: RoomSnapshot | null;
  /** Écart entre l'horloge du serveur et la nôtre, en ms. */
  clockOffset: number;
  lastAck: { correct: boolean; timeMs: number; questionIndex: number } | null;
  typing: { playerId: string; value: string } | null;
  /** La bombe : réponse du serveur à la dernière bombe envoyée. */
  bombAck: ServerMessages["bomb-ack"] | null;
  left: boolean;
}

const stores = new WeakMap<Room, { state: LobbyState; listeners: Set<() => void> }>();

function attach(room: Room) {
  const store = {
    state: { playerId: null, snapshot: null, clockOffset: 0, lastAck: null, typing: null, bombAck: null, left: false } as LobbyState,
    listeners: new Set<() => void>(),
  };
  const update = (patch: Partial<LobbyState>) => {
    store.state = { ...store.state, ...patch };
    store.listeners.forEach((l) => l());
  };
  room.onMessage("welcome", (m: { playerId: string }) => update({ playerId: m.playerId }));
  room.onMessage("snapshot", (snap: RoomSnapshot) => {
    const patch: Partial<LobbyState> = { snapshot: snap, clockOffset: snap.serverNow - Date.now() };
    if (snap.phase !== "question") patch.typing = null;
    // Nouvelle partie : les accusés de la précédente ne valent plus (sinon leur son rejoue au remontage de l'écran de jeu).
    if (store.state.snapshot && store.state.snapshot.gameNumber !== snap.gameNumber) {
      patch.lastAck = null;
      patch.bombAck = null;
    }
    update(patch);
  });
  room.onMessage("answer-ack", (ack: LobbyState["lastAck"]) => update({ lastAck: ack }));
  room.onMessage("answer-refused", () => {});
  room.onMessage("bomb-ack", (ack: ServerMessages["bomb-ack"]) => update({ bombAck: ack }));
  room.onMessage("typing", (t: { playerId: string; value: string }) => update({ typing: t }));
  room.onMessage("error", () => {});
  room.onLeave(() => update({ left: true }));
  stores.set(room, store);
  // Redemande l'état complet, au cas où des messages seraient arrivés avant l'écoute.
  room.send("hello", {});
}

export function subscribeRoom(room: Room, listener: () => void): () => void {
  const store = stores.get(room);
  if (!store) return () => {};
  store.listeners.add(listener);
  return () => store.listeners.delete(listener);
}

export function readRoom(room: Room): LobbyState | null {
  return stores.get(room)?.state ?? null;
}

/* Lobby en cours, suivi hors de sa page (bandeau d'attente). */
const currentListeners = new Set<() => void>();

function setCurrent(room: Room | null) {
  current = room;
  currentListeners.forEach((l) => l());
}

export function subscribeCurrentLobby(listener: () => void): () => void {
  currentListeners.add(listener);
  return () => currentListeners.delete(listener);
}

/** Salle du lobby où l'on se trouve, même quand on navigue ailleurs sur le site. */
export function readCurrentLobby(): Room | null {
  return current;
}

function remember(room: Room) {
  attach(room);
  // On n'est jamais dans deux lobbys à la fois : l'ancien est quitté.
  if (current && current !== room) void current.leave(true);
  setCurrent(room);
  try {
    sessionStorage.setItem(RECONNECT_KEY, JSON.stringify({ roomId: room.roomId, token: room.reconnectionToken }));
  } catch {}
  room.onLeave(() => {
    if (current === room) setCurrent(null);
  });
}

export async function createLobby(name: string, settings: GameSettings): Promise<Room> {
  try {
    const token = await fetchToken(name);
    const room = await getClient().create("game", { token, settings });
    remember(room);
    return room;
  } catch (err) {
    throw toJoinError(err);
  }
}

let pending: { code: string; promise: Promise<Room> } | null = null;

/** Rejoint un lobby : réutilise la connexion existante, tente une reconnexion, sinon entre normalement. */
export function joinLobby(code: string, name: string): Promise<Room> {
  if (current && current.roomId === code) return Promise.resolve(current);
  // Évite deux connexions simultanées au même lobby (double rendu en développement).
  if (pending && pending.code === code) return pending.promise;
  const promise = doJoin(code, name).finally(() => {
    if (pending?.promise === promise) pending = null;
  });
  pending = { code, promise };
  return promise;
}

async function doJoin(code: string, name: string): Promise<Room> {
  try {
    const saved = JSON.parse(sessionStorage.getItem(RECONNECT_KEY) ?? "null") as { roomId: string; token: string } | null;
    if (saved && saved.roomId === code && saved.token) {
      const room = await getClient().reconnect(saved.token);
      remember(room);
      return room;
    }
  } catch {
    // La reconnexion a échoué : on entre comme un nouveau joueur.
  }
  try {
    const token = await fetchToken(name);
    const room = await getClient().joinById(code, { token });
    remember(room);
    return room;
  } catch (err) {
    throw toJoinError(err);
  }
}

export function leaveLobby() {
  try {
    sessionStorage.removeItem(RECONNECT_KEY);
  } catch {}
  const room = current;
  setCurrent(null);
  room?.leave(true);
}

/* Présence : nombre de visiteurs connectés au site. */

/** Délai avant de retenter la connexion à la salle de présence, en ms. */
const PRESENCE_RETRY_MS = 15000;

const presence = {
  count: null as number | null,
  listeners: new Set<() => void>(),
  room: null as Room | null,
  connecting: false,
  retry: null as ReturnType<typeof setTimeout> | null,
};

function setOnline(count: number | null) {
  presence.count = count;
  presence.listeners.forEach((l) => l());
}

async function connectPresence() {
  presence.retry = null;
  presence.connecting = true;
  let room: Room;
  try {
    room = await getClient().joinOrCreate(PRESENCE_ROOM);
  } catch {
    presence.connecting = false;
    schedulePresence();
    return;
  }
  presence.connecting = false;
  // Plus personne n'écoute depuis le début de la connexion : on repart aussitôt.
  if (presence.listeners.size === 0) {
    void room.leave(true);
    return;
  }
  presence.room = room;
  room.onMessage("online", (m: { count: number }) => setOnline(m.count));
  room.onLeave(() => {
    if (presence.room !== room) return;
    presence.room = null;
    setOnline(null);
    schedulePresence();
  });
}

function schedulePresence() {
  if (presence.listeners.size > 0 && !presence.retry) presence.retry = setTimeout(connectPresence, PRESENCE_RETRY_MS);
}

/** Écoute le nombre de visiteurs connectés ; la connexion est partagée et fermée sans écouteur. */
export function subscribeOnline(listener: () => void): () => void {
  presence.listeners.add(listener);
  if (!presence.room && !presence.connecting && !presence.retry) void connectPresence();
  return () => {
    presence.listeners.delete(listener);
    if (presence.listeners.size > 0) return;
    if (presence.retry) clearTimeout(presence.retry);
    presence.retry = null;
    presence.count = null;
    const room = presence.room;
    presence.room = null;
    void room?.leave(true);
  };
}

export function readOnline(): number | null {
  return presence.count;
}
