import { NextResponse } from "next/server";
import { z } from "zod";
import { CODE_LENGTH, normalizeCode } from "@calculus/game-core";
import { sendGuildLobbyInvites } from "@calculus/db";
import { getSession } from "@/lib/auth";
import { badRequest, guildResponse, readBody, unauthorized } from "@/lib/guild-api";

const lobbyBody = z.object({
  code: z
    .string()
    .length(CODE_LENGTH)
    .refine((c) => normalizeCode(c) === c),
});

/** Lobby de guilde : invite tous les autres membres dans le lobby `code`. */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return unauthorized();
  const body = await readBody(req, lobbyBody);
  if (!body) return badRequest();
  const invited = await sendGuildLobbyInvites(session.user.id, body.code, new Date());
  return invited === null ? guildResponse("not-member") : NextResponse.json({ invited });
}
