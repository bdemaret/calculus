import { NextResponse } from "next/server";
import { getAdminSoloActivity } from "@calculus/db";
import { getAdminSession } from "@/lib/admin";

/** Parties solo en cours et récentes (panel administrateur, interrogé régulièrement). */
export async function GET() {
  if (!(await getAdminSession())) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  return NextResponse.json({ ...(await getAdminSoloActivity(new Date())), serverNow: Date.now() });
}
