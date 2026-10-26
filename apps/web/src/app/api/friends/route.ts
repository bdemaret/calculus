import { NextResponse } from "next/server";
import { z } from "zod";
import { acceptFriendRequest, getFriends, removeFriendship, sendFriendRequest } from "@calculus/db";
import { getSession } from "@/lib/auth";

const requestBody = z.object({ handle: z.string().trim().min(1).max(254) });
const otherBody = z.object({ userId: z.string().min(1).max(64) });

async function readBody<T>(req: Request, schema: z.ZodType<T>): Promise<T | null> {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  return parsed.success ? parsed.data : null;
}

/** Amis du joueur connecté, avec les demandes reçues et envoyées. */
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json(await getFriends(session.user.id));
}

/** Envoie une demande d'ami à partir d'un pseudo ou d'un e-mail. */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await readBody(req, requestBody);
  if (!body) return NextResponse.json({ error: "bad-request" }, { status: 400 });
  const result = await sendFriendRequest(session.user.id, body.handle);
  if (!("name" in result)) {
    const status = result.status === "not-found" ? 404 : result.status === "too-many" ? 429 : 400;
    return NextResponse.json({ error: result.status }, { status });
  }
  return NextResponse.json(result);
}

/** Accepte la demande d'ami envoyée par `userId`. */
export async function PATCH(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await readBody(req, otherBody);
  if (!body) return NextResponse.json({ error: "bad-request" }, { status: 400 });
  const ok = await acceptFriendRequest(session.user.id, body.userId);
  return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "not-found" }, { status: 404 });
}

/** Retire un ami, refuse une demande reçue ou annule une demande envoyée. */
export async function DELETE(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await readBody(req, otherBody);
  if (!body) return NextResponse.json({ error: "bad-request" }, { status: 400 });
  await removeFriendship(session.user.id, body.userId);
  return NextResponse.json({ ok: true });
}
