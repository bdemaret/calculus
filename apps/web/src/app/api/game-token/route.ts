import { NextResponse } from "next/server";
import { SignJWT } from "jose";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { cleanName } from "@/lib/names";

const body = z.object({ name: z.string().max(40).optional() });

/**
 * Remet un jeton signé qui permet d'entrer dans un lobby.
 * Connecté : le jeton porte l'id du compte. Invité : un id temporaire et le pseudo choisi.
 */
export async function POST(req: Request) {
  const secret = process.env.GAME_TOKEN_SECRET;
  if (!secret) return NextResponse.json({ error: "server-misconfigured" }, { status: 500 });
  const parsed = body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "bad-request" }, { status: 400 });

  const session = await getSession();
  const guestName = cleanName(parsed.data.name ?? "");
  if (!session && !guestName) return NextResponse.json({ error: "name-required" }, { status: 400 });

  const payload = session
    ? { name: cleanName(session.user.name) || "Joueur", guest: false }
    : { name: guestName, guest: true };
  const sub = session ? session.user.id : `guest_${randomUUID()}`;

  const token = await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(sub)
    .setIssuer("calculus-web")
    .setAudience("calculus-game")
    .setIssuedAt()
    .setExpirationTime("2h")
    .sign(new TextEncoder().encode(secret));

  return NextResponse.json({ token, playerId: sub, name: payload.name, guest: payload.guest });
}
