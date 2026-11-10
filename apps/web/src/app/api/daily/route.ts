import { NextResponse } from "next/server";
import { z } from "zod";
import { answerDailyQuestion, getBan, getDailyRun, nextDailyQuestion, startDailyRun } from "@calculus/db";
import { getSession } from "@/lib/auth";
import { rateLimited, requestIp } from "@/lib/rateLimit";

/** Jeton d'essai : l'UUID émis au début de l'essai. */
const token = z.string().uuid().nullable().default(null);

const body = z.discriminatedUnion("action", [
  z.object({ action: z.enum(["state", "start", "next"]), token }).strict(),
  z.object({ action: z.literal("answer"), token, value: z.number().int().min(0).max(1_000_000).nullable() }).strict(),
]);

const HOUR_MS = 60 * 60 * 1000;
/** Demandes par compte ou par IP et par heure : une école derrière une même adresse doit pouvoir jouer. */
const REQUESTS_PER_HOUR = 1200;
/** Essais d'invités commencés par IP et par heure (une ligne en base chacun). */
const GUEST_STARTS_PER_HOUR = 30;

/**
 * Calcul du jour, invités compris : le serveur pose les calculs un par un et tient le chrono.
 * La réponse d'un calcul ne part qu'une fois ce calcul joué, et aucun temps ne vient du navigateur,
 * puisque le score entre au classement. Un compte banni reçoit 403 `banned`.
 */
export async function POST(req: Request) {
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad-request" }, { status: 400 });
  const session = await getSession().catch(() => null);
  const userId = session?.user.id ?? null;
  const who = userId ? `user:${userId}` : `ip:${requestIp(req)}`;
  if (await rateLimited(`daily:${who}`, REQUESTS_PER_HOUR, HOUR_MS)) return NextResponse.json({ error: "rate-limited" }, { status: 429 });

  // Compte banni : ni essai, ni score. La page affiche alors le message de ban.
  if (userId && (await getBan(userId))) return NextResponse.json({ error: "banned" }, { status: 403 });

  const data = parsed.data;
  // L'horloge est prise ici, à l'arrivée de la demande : c'est elle qui mesure le temps de réponse.
  const now = new Date();
  if (data.action === "state") return NextResponse.json({ run: await getDailyRun(userId, data.token, now) });
  if (data.action === "start") {
    if (!userId && !(await getDailyRun(null, data.token, now)) && (await rateLimited(`daily-start:${who}`, GUEST_STARTS_PER_HOUR, HOUR_MS)))
      return NextResponse.json({ error: "rate-limited" }, { status: 429 });
    return NextResponse.json({ run: await startDailyRun(userId, data.token, now) });
  }
  const run = data.action === "answer" ? await answerDailyQuestion(userId, data.token, data.value, now) : await nextDailyQuestion(userId, data.token, now);
  if (!run) return NextResponse.json({ error: "not-found" }, { status: 404 });
  // L'anti-bot juge chaque réponse : celle-ci peut venir de bannir le compte.
  if (userId && data.action === "answer" && (await getBan(userId))) return NextResponse.json({ error: "banned" }, { status: 403 });
  return NextResponse.json({ run });
}
