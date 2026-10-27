import { z } from "zod";
import { kickGuildMember, transferGuildLeadership } from "@calculus/db";
import { getSession } from "@/lib/auth";
import { badRequest, guildResponse, readBody, unauthorized } from "@/lib/guild-api";

const memberBody = z.object({ userId: z.string().min(1).max(64) });

/** Nomme `userId` chef de la guilde à sa place (chef seulement). */
export async function PATCH(req: Request) {
  const session = await getSession();
  if (!session) return unauthorized();
  const body = await readBody(req, memberBody);
  if (!body) return badRequest();
  return guildResponse(await transferGuildLeadership(session.user.id, body.userId));
}

/** Exclut `userId` de la guilde (chef seulement). */
export async function DELETE(req: Request) {
  const session = await getSession();
  if (!session) return unauthorized();
  const body = await readBody(req, memberBody);
  if (!body) return badRequest();
  return guildResponse(await kickGuildMember(session.user.id, body.userId));
}
