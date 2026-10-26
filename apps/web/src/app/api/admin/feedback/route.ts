import { NextResponse } from "next/server";
import { z } from "zod";
import { deleteFeedback, setFeedbackResolved } from "@calculus/db";
import { getAdminSession } from "@/lib/admin";

const updateBody = z.object({ id: z.string().min(1).max(64), resolved: z.boolean() });
const deleteBody = z.object({ id: z.string().min(1).max(64) });

/** Marque un retour comme traité (ou le rouvre). */
export async function PATCH(req: Request) {
  if (!(await getAdminSession())) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const parsed = updateBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad-request" }, { status: 400 });
  const ok = await setFeedbackResolved(parsed.data.id, parsed.data.resolved);
  return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "not-found" }, { status: 404 });
}

/** Supprime un retour (spam, données personnelles à effacer…). */
export async function DELETE(req: Request) {
  if (!(await getAdminSession())) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const parsed = deleteBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad-request" }, { status: 400 });
  const ok = await deleteFeedback(parsed.data.id);
  return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "not-found" }, { status: 404 });
}
