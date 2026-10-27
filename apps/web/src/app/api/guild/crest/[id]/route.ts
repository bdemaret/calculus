import { NextResponse } from "next/server";
import { getGuildCrest } from "@calculus/db";
import { getSession } from "@/lib/auth";

/** Blason d'une guilde, servi à tout joueur connecté (les invités le voient avant d'entrer). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) return NextResponse.json({ error: "not-found" }, { status: 404 });
  const crest = await getGuildCrest(id);
  if (!crest) return NextResponse.json({ error: "not-found" }, { status: 404 });
  return new NextResponse(Buffer.from(crest.data), {
    headers: {
      "content-type": crest.mime,
      "x-content-type-options": "nosniff",
      // L'adresse change à chaque nouveau blason (`?v=`) : le navigateur peut la garder longtemps, sans cache partagé.
      "cache-control": "private, max-age=31536000, immutable",
      "last-modified": crest.updatedAt.toUTCString(),
    },
  });
}
