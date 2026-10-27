import { NextResponse } from "next/server";
import { z } from "zod";
import { acceptGuildInvite, cancelGuildInvite, declineGuildInvite, inviteToGuild } from "@calculus/db";
import { getSession } from "@/lib/auth";
import { badRequest, guildResponse, readBody, unauthorized } from "@/lib/guild-api";

/** Par pseudo ou e-mail (champ de la page), ou par id (ami proposé). */
const inviteBody = z.union([z.object({ handle: z.string().trim().min(1).max(254) }), z.object({ userId: z.string().min(1).max(64) })]);
const idBody = z.object({ id: z.string().min(1).max(64) });

const INVITE_STATUS: Record<string, number> = { "not-found": 404, "not-member": 403, "too-many": 429 };

/** Invite un joueur dans sa guilde : n'importe quel membre peut le faire. */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return unauthorized();
  const body = await readBody(req, inviteBody);
  if (!body) return badRequest();
  const result = await inviteToGuild(session.user.id, body);
  if (!("name" in result)) return NextResponse.json({ error: result.status }, { status: INVITE_STATUS[result.status] ?? 409 });
  return NextResponse.json(result);
}

/** Accepte une invitation reçue ({ id }). */
export async function PATCH(req: Request) {
  const session = await getSession();
  if (!session) return unauthorized();
  const body = await readBody(req, idBody);
  if (!body) return badRequest();
  return guildResponse(await acceptGuildInvite(session.user.id, body.id, new Date()));
}

/** Refuse une invitation reçue, ou annule une invitation envoyée par sa guilde ({ id }). */
export async function DELETE(req: Request) {
  const session = await getSession();
  if (!session) return unauthorized();
  const body = await readBody(req, idBody);
  if (!body) return badRequest();
  await Promise.all([declineGuildInvite(session.user.id, body.id), cancelGuildInvite(session.user.id, body.id)]);
  return NextResponse.json({ ok: true });
}
