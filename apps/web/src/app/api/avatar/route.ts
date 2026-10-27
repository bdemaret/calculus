import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { deleteAvatar, saveAvatar } from "@calculus/db";
import { auth, getSession } from "@/lib/auth";
import { AVATAR_MAX_BYTES, sniffImage } from "@/lib/avatar";

/** Pose (ou remplace) la photo de profil : un fichier `file` déjà recadré par le navigateur. */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof Blob)) return NextResponse.json({ error: "bad-request" }, { status: 400 });
  if (file.size > AVATAR_MAX_BYTES) return NextResponse.json({ error: "too-large" }, { status: 413 });
  const bytes = new Uint8Array(await file.arrayBuffer());
  // Le type annoncé par le client ne compte pas : on lit la signature du fichier.
  const mime = sniffImage(bytes);
  if (!mime) return NextResponse.json({ error: "bad-type" }, { status: 415 });
  const version = await saveAvatar(session.user.id, bytes, mime);
  const image = `/api/avatar/${session.user.id}?v=${version}`;
  // Passe par Better Auth pour rafraîchir aussi le cache de session (cookie).
  await auth.api.updateUser({ headers: await headers(), body: { image } });
  return NextResponse.json({ image });
}

/** Retire la photo de profil. */
export async function DELETE() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  await deleteAvatar(session.user.id);
  await auth.api.updateUser({ headers: await headers(), body: { image: null } });
  return NextResponse.json({ ok: true });
}
