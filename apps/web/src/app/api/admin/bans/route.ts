import { NextResponse } from "next/server";
import { z } from "zod";
import { banUser, dismissBotReport, unbanUser } from "@calculus/db";
import { getAdminSession, isAdminUser } from "@/lib/admin";

const banBody = z.object({ action: z.enum(["ban", "unban"]), userId: z.string().min(1).max(64) }).strict();
const dismissBody = z.object({ reportId: z.string().min(1).max(64) }).strict();

/** Bannit ou débannit un compte à la main. Un administrateur ne se bannit pas : il perdrait l'accès au jeu sans perdre le panel. */
export async function POST(req: Request) {
  if (!(await getAdminSession())) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const parsed = banBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad-request" }, { status: 400 });
  const { action, userId } = parsed.data;
  const now = new Date();
  if (action === "ban" && isAdminUser(userId)) return NextResponse.json({ error: "admin" }, { status: 400 });
  const ok = action === "ban" ? await banUser(userId, "manual", now) : await unbanUser(userId, now);
  return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "not-found" }, { status: 404 });
}

/** Classe un signalement de l'anti-bot sans sanction. */
export async function PATCH(req: Request) {
  if (!(await getAdminSession())) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const parsed = dismissBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad-request" }, { status: 400 });
  const ok = await dismissBotReport(parsed.data.reportId, new Date());
  return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "not-found" }, { status: 404 });
}
