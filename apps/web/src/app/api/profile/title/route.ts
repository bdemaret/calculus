import { NextResponse } from "next/server";
import { z } from "zod";
import { TITLE_IDS } from "@calculus/game-core";
import { setUserTitle } from "@calculus/db";
import { getSession } from "@/lib/auth";
import { rateLimited } from "@/lib/rateLimit";

const body = z.object({ titleId: z.string().refine((id) => TITLE_IDS.includes(id)).nullable() });

const MINUTE_MS = 60_000;
const CHANGES_PER_MINUTE = 30;

/** Porte un titre possédé, ou aucun. */
export async function PATCH(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad-request" }, { status: 400 });
  if (await rateLimited(`title:${session.user.id}`, CHANGES_PER_MINUTE, MINUTE_MS)) return NextResponse.json({ error: "rate-limited" }, { status: 429 });
  if (!(await setUserTitle(session.user.id, parsed.data.titleId))) return NextResponse.json({ error: "not-owned" }, { status: 403 });
  return NextResponse.json({ ok: true });
}
