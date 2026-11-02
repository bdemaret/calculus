import { NextResponse } from "next/server";
import { markAchievementsSeen } from "@calculus/db";
import { getSession } from "@/lib/auth";

/** L'onglet « Mes succès » a été ouvert : plus rien de nouveau à signaler. */
export async function POST() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  await markAchievementsSeen(session.user.id);
  return NextResponse.json({ ok: true });
}
