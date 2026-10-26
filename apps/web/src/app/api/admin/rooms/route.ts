import { NextResponse } from "next/server";
import { fetchLiveRooms, getAdminSession } from "@/lib/admin";

/** Parties en cours (panel administrateur, interrogé régulièrement). */
export async function GET() {
  if (!(await getAdminSession())) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const live = await fetchLiveRooms();
  if (!live) return NextResponse.json({ error: "game-server-unreachable" }, { status: 502 });
  return NextResponse.json(live);
}
