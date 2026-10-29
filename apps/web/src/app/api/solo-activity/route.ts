import { NextResponse } from "next/server";
import { z } from "zod";
import { GAMES, sanitizeSettings } from "@calculus/game-core";
import { startSoloPlay, touchSoloPlay } from "@calculus/db";
import { getSession } from "@/lib/auth";
import { rateLimited, requestIp } from "@/lib/rateLimit";

const progress = { rounds: z.number().int().min(0).max(1000), correct: z.number().int().min(0).max(1000) };

const body = z.discriminatedUnion("event", [
  z.object({ event: z.literal("start"), settings: z.unknown() }).strict(),
  z.object({ event: z.enum(["ping", "end", "quit"]), id: z.string().min(1).max(40), ...progress }).strict(),
]);

const HOUR_MS = 60 * 60 * 1000;
/** Parties commencées par compte ou par IP et par heure (une ligne en base chacune). */
const STARTS_PER_HOUR = 120;
/** Signaux par compte ou par IP et par heure : un battement toutes les 30 s, plusieurs onglets possibles. */
const SIGNALS_PER_HOUR = 600;

/**
 * Suivi d'activité des parties solo (invités compris), pour le panel administrateur :
 * début, battement régulier, fin ou abandon. Indicatif seulement, rien n'en sort vers un classement.
 */
export async function POST(req: Request) {
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad-request" }, { status: 400 });
  const session = await getSession().catch(() => null);
  const who = session ? `user:${session.user.id}` : `ip:${requestIp(req)}`;
  const data = parsed.data;

  if (data.event === "start") {
    if (await rateLimited(`solo-activity:start:${who}`, STARTS_PER_HOUR, HOUR_MS))
      return NextResponse.json({ error: "rate-limited" }, { status: 429 });
    const settings = sanitizeSettings(data.settings);
    if (!GAMES[settings.game].solo) return NextResponse.json({ error: "bad-request" }, { status: 400 });
    const id = await startSoloPlay(
      { userId: session?.user.id ?? null, game: settings.game, mode: settings.mode, difficulty: settings.difficulty },
      new Date(),
    );
    return NextResponse.json({ id });
  }

  if (await rateLimited(`solo-activity:signal:${who}`, SIGNALS_PER_HOUR, HOUR_MS))
    return NextResponse.json({ error: "rate-limited" }, { status: 429 });
  await touchSoloPlay(data.id, data.event, { rounds: data.rounds, correct: data.correct }, new Date());
  return new NextResponse(null, { status: 204 });
}
