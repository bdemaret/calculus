import { NextResponse } from "next/server";
import { z } from "zod";
import { GUILD_NAME_MAX, createGuild, getMyGuild, getReceivedGuildInvites, leaveGuild, renameGuild } from "@calculus/db";
import { getSession } from "@/lib/auth";
import { badRequest, guildResponse, readBody, unauthorized } from "@/lib/guild-api";

const nameBody = z.object({ name: z.string().trim().min(1).max(GUILD_NAME_MAX * 2) });

/** Guilde du joueur connecté (null s'il n'en a pas) et invitations reçues. */
export async function GET() {
  const session = await getSession();
  if (!session) return unauthorized();
  const [guild, invites] = await Promise.all([getMyGuild(session.user.id, new Date()), getReceivedGuildInvites(session.user.id)]);
  return NextResponse.json({ guild, invites });
}

/** Fonde une guilde ({ name }) : le joueur en devient le chef. */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return unauthorized();
  const body = await readBody(req, nameBody);
  if (!body) return badRequest();
  return guildResponse(await createGuild(session.user.id, body.name));
}

/** Renomme la guilde ({ name }), chef seulement. */
export async function PATCH(req: Request) {
  const session = await getSession();
  if (!session) return unauthorized();
  const body = await readBody(req, nameBody);
  if (!body) return badRequest();
  return guildResponse(await renameGuild(session.user.id, body.name));
}

/** Quitte sa guilde. */
export async function DELETE() {
  const session = await getSession();
  if (!session) return unauthorized();
  await leaveGuild(session.user.id);
  return NextResponse.json({ ok: true });
}
