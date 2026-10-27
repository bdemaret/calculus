import { NextResponse } from "next/server";
import { getAvatarFor } from "@calculus/db";
import { getSession } from "@/lib/auth";

/** Photo de profil d'un joueur, servie à lui-même et à ses amis seulement. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) return NextResponse.json({ error: "not-found" }, { status: 404 });
  const avatar = await getAvatarFor(id, session.user.id);
  if (!avatar) return NextResponse.json({ error: "not-found" }, { status: 404 });
  return new NextResponse(Buffer.from(avatar.data), {
    headers: {
      "content-type": avatar.mime,
      "x-content-type-options": "nosniff",
      // L'adresse change à chaque nouvelle photo (`?v=`) : le navigateur peut la garder longtemps, sans cache partagé.
      "cache-control": "private, max-age=31536000, immutable",
      "last-modified": avatar.updatedAt.toUTCString(),
    },
  });
}
