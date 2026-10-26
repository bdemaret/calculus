import "server-only";
import { notFound } from "next/navigation";
import { SignJWT } from "jose";
import type { AdminRoomSummary } from "@calculus/game-core";
import { getSession } from "./auth";

/** E-mails des administrateurs (`ADMIN_EMAILS`, séparés par des virgules), en minuscules. */
function adminEmails(): Set<string> {
  return new Set(
    (process.env.ADMIN_EMAILS ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function isAdminEmail(email: string | null | undefined): boolean {
  return !!email && adminEmails().has(email.toLowerCase());
}

/** Session de l'utilisateur courant s'il est administrateur, sinon null. */
export async function getAdminSession() {
  const session = await getSession().catch(() => null);
  return session && isAdminEmail(session.user.email) ? session : null;
}

/** Adresse HTTP du serveur de jeu, déduite de son adresse WebSocket. */
function gameServerHttpUrl(): string | null {
  const ws = process.env.NEXT_PUBLIC_GAME_SERVER_URL;
  if (!ws) return null;
  return ws.replace(/^ws(s?):\/\//, "http$1://").replace(/\/$/, "");
}

/** Parties en cours sur le serveur de jeu (null si le serveur est injoignable ou mal configuré). */
export async function fetchLiveRooms(): Promise<{ rooms: AdminRoomSummary[]; serverNow: number } | null> {
  const base = gameServerHttpUrl();
  const secret = process.env.GAME_TOKEN_SECRET;
  if (!base || !secret) return null;
  // Jeton court, signé avec le secret partagé : le serveur de jeu n'a pas accès aux sessions du site.
  const token = await new SignJWT({ admin: true })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer("calculus-web")
    .setAudience("calculus-admin")
    .setIssuedAt()
    .setExpirationTime("1m")
    .sign(new TextEncoder().encode(secret));
  try {
    const res = await fetch(`${base}/admin/rooms`, {
      headers: { authorization: `Bearer ${token}` },
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    return (await res.json()) as { rooms: AdminRoomSummary[]; serverNow: number };
  } catch {
    return null;
  }
}

/** À appeler en tête de chaque page du panel : la page n'existe pas pour les autres (404). */
export async function requireAdmin() {
  const session = await getAdminSession();
  if (!session) notFound();
  return session;
}
