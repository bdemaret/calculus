import { NextResponse } from "next/server";
import { z } from "zod";
import { CODE_LENGTH, normalizeCode } from "@calculus/game-core";
import { dismissGameInvite, getGameInvites, sendGameInvite } from "@calculus/db";
import { getSession } from "@/lib/auth";

const inviteBody = z.object({
  userId: z.string().min(1).max(64),
  code: z
    .string()
    .length(CODE_LENGTH)
    .refine((c) => normalizeCode(c) === c),
});
const dismissBody = z.object({ id: z.string().min(1).max(64) });

/** Invitations à une partie reçues par le joueur connecté (interrogé régulièrement par le site). */
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({ invites: await getGameInvites(session.user.id, new Date()) });
}

/** Invite un ami dans le lobby `code`. */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = inviteBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad-request" }, { status: 400 });
  const ok = await sendGameInvite(session.user.id, parsed.data.userId, parsed.data.code, new Date());
  return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "not-friends" }, { status: 403 });
}

/** Retire une invitation reçue (rejointe ou ignorée). */
export async function DELETE(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = dismissBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad-request" }, { status: 400 });
  await dismissGameInvite(session.user.id, parsed.data.id);
  return NextResponse.json({ ok: true });
}
