"use client";
import { defaultSettings, sanitizeSettings } from "@calculus/game-core";
import type { FriendsData, GameInviteSummary } from "@calculus/db";
import { createLobby } from "./colyseus";
import { local } from "./storage";

const JSON_HEADERS = { "content-type": "application/json" };

/**
 * Crée un lobby privé avec les réglages en ligne habituels, pour y inviter des amis ou sa guilde.
 * Les réglages du dernier lobby sont repris, mais un nouveau lobby commence toujours en simultané.
 */
export async function createInviteLobby(): Promise<string> {
  const settings = sanitizeSettings({ ...local.get("online", defaultSettings(2, "battle-royale")), turnStyle: "simultaneous" });
  const room = await createLobby("", settings);
  return room.roomId;
}

/** Invite un ami dans le lobby `code`. Renvoie false si le serveur refuse. */
export async function inviteFriend(userId: string, code: string): Promise<boolean> {
  const res = await fetch("/api/invites", { method: "POST", headers: JSON_HEADERS, body: JSON.stringify({ userId, code }) }).catch(() => null);
  return !!res?.ok;
}

/** Amis du joueur connecté (null si déconnecté ou en cas d'erreur). */
export async function fetchFriends(): Promise<FriendsData | null> {
  const res = await fetch("/api/friends").catch(() => null);
  return res?.ok ? ((await res.json()) as FriendsData) : null;
}

/** Invitations reçues encore valables. */
export async function fetchInvites(): Promise<GameInviteSummary[]> {
  const res = await fetch("/api/invites").catch(() => null);
  if (!res?.ok) return [];
  return ((await res.json()) as { invites: GameInviteSummary[] }).invites;
}

/** Retire une invitation reçue (rejointe ou ignorée). */
export async function dismissInvite(id: string): Promise<void> {
  await fetch("/api/invites", { method: "DELETE", headers: JSON_HEADERS, body: JSON.stringify({ id }) }).catch(() => null);
}
