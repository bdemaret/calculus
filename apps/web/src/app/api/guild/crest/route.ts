import { NextResponse } from "next/server";
import { deleteGuildCrest, saveGuildCrest } from "@calculus/db";
import { getSession } from "@/lib/auth";
import { AVATAR_MAX_BYTES, sniffImage } from "@/lib/avatar";
import { badRequest, guildResponse, unauthorized } from "@/lib/guild-api";

/** Pose (ou remplace) le blason de la guilde, chef seulement : un fichier `file` déjà recadré par le navigateur. */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return unauthorized();
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof Blob)) return badRequest();
  if (file.size > AVATAR_MAX_BYTES) return NextResponse.json({ error: "too-large" }, { status: 413 });
  const bytes = new Uint8Array(await file.arrayBuffer());
  // Le type annoncé par le client ne compte pas : on lit la signature du fichier.
  const mime = sniffImage(bytes);
  if (!mime) return NextResponse.json({ error: "bad-type" }, { status: 415 });
  const result = await saveGuildCrest(session.user.id, bytes, mime);
  return "error" in result ? guildResponse(result.error) : NextResponse.json(result);
}

/** Retire le blason de la guilde, chef seulement. */
export async function DELETE() {
  const session = await getSession();
  if (!session) return unauthorized();
  return guildResponse(await deleteGuildCrest(session.user.id));
}
