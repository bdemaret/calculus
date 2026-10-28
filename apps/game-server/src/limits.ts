import type { IncomingHttpHeaders, IncomingMessage } from "node:http";
import { ServerError } from "@colyseus/core";
import { JOIN_ERRORS } from "@calculus/game-core";
import { allowedOrigins } from "./env";

/*
 * Limites contre le déni de service : une seule instance garde toutes les salles en mémoire,
 * un script ne doit pas pouvoir l'épuiser. Les plafonds par adresse laissent passer une classe
 * entière derrière la même box (une trentaine d'élèves, chacun avec un onglet ou deux).
 */

/** WebSockets ouverts en même temps depuis une même adresse IP. */
export const MAX_CONNECTIONS_PER_IP = 150;
/** Demandes de matchmaking (créer, rejoindre une salle) par adresse IP et par minute. */
export const MAX_MATCHMAKE_PER_MINUTE = 120;
/** Salles de jeu ouvertes en même temps sur le serveur (hors lobbys publics). */
export const MAX_GAME_ROOMS = 2000;
/** Visiteurs comptés en même temps par les salles de présence. */
export const MAX_PRESENCE_CLIENTS = 20_000;

const MINUTE_MS = 60_000;

const origins = allowedOrigins();

/**
 * Adresse du client, lue comme Colyseus le fait : `x-real-ip`, puis `x-forwarded-for` (posés par
 * le proxy de l'hébergeur), puis la socket. Le premier élément de `x-forwarded-for` peut être
 * falsifié quand l'hébergeur ne le réécrit pas : la limite devient contournable, sans bloquer personne.
 */
export function clientIp(headers: IncomingHttpHeaders, fallback: string | undefined): string {
  const real = headers["x-real-ip"];
  if (typeof real === "string" && real) return real.trim();
  const forwarded = headers["x-forwarded-for"];
  const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(",")[0]?.trim();
  return first || fallback || "unknown";
}

/** Vrai si l'origine du navigateur est celle du site (toujours vrai hors production). */
export function originAllowed(origin: string | string[] | undefined): boolean {
  if (!origins) return true;
  return typeof origin === "string" && origins.has(origin);
}

/* ---------- Connexions WebSocket simultanées par IP ---------- */

const openConnections = new Map<string, number>();

/**
 * `verifyClient` du transport WebSocket : refuse une origine étrangère ou une IP déjà au plafond,
 * et décompte la connexion à sa fermeture.
 */
export function verifyWebSocket(info: { origin: string; req: IncomingMessage }): boolean {
  if (!originAllowed(info.origin)) return false;
  const ip = clientIp(info.req.headers, info.req.socket.remoteAddress);
  const count = openConnections.get(ip) ?? 0;
  if (count >= MAX_CONNECTIONS_PER_IP) return false;
  openConnections.set(ip, count + 1);
  info.req.socket.once("close", () => {
    const left = (openConnections.get(ip) ?? 1) - 1;
    if (left <= 0) openConnections.delete(ip);
    else openConnections.set(ip, left);
  });
  return true;
}

/* ---------- Matchmaking par IP (fenêtre d'une minute) ---------- */

const matchmakeWindows = new Map<string, { start: number; count: number }>();

// Les fenêtres terminées sont oubliées : la table ne grossit pas avec les adresses de passage.
setInterval(() => {
  const now = Date.now();
  for (const [ip, w] of matchmakeWindows) if (now - w.start > MINUTE_MS) matchmakeWindows.delete(ip);
}, MINUTE_MS).unref();

function allowMatchmake(ip: string, now: number): boolean {
  const w = matchmakeWindows.get(ip);
  if (!w || now - w.start > MINUTE_MS) {
    matchmakeWindows.set(ip, { start: now, count: 1 });
    return true;
  }
  w.count += 1;
  return w.count <= MAX_MATCHMAKE_PER_MINUTE;
}

/**
 * À appeler dans le `onAuth` statique de chaque salle (matchmaking, avant toute création) :
 * refuse une origine étrangère et une IP qui enchaîne les demandes.
 */
export function checkMatchmake(context: { headers: IncomingHttpHeaders; ip: string | string[] }): void {
  if (!originAllowed(context.headers.origin)) throw new ServerError(JOIN_ERRORS.badToken, "bad-origin");
  const fallback = Array.isArray(context.ip) ? context.ip[0] : context.ip;
  if (!allowMatchmake(clientIp(context.headers, fallback), Date.now())) throw new ServerError(JOIN_ERRORS.busy, "busy");
}
