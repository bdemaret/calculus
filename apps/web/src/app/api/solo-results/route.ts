import { NextResponse } from "next/server";
import { z } from "zod";
import { BASIC_OPERATIONS, GAMES, MAX_EXPRESSION_LENGTH, replaySolo, sanitizeSettings, type BasicOperation } from "@calculus/game-core";
import { linkSoloPlayGame, saveGame } from "@calculus/db";
import { getSession } from "@/lib/auth";
import { rateLimited } from "@/lib/rateLimit";

/** Réponse d'une manche : un nombre, une expression ou un opérateur ; null si le temps s'est écoulé. */
const answer = z.union([
  z.object({ value: z.number().int().min(0).max(1_000_000) }).strict(),
  z.object({ expr: z.string().min(1).max(MAX_EXPRESSION_LENGTH) }).strict(),
  z.object({ op: z.enum(BASIC_OPERATIONS as [BasicOperation, ...BasicOperation[]]) }).strict(),
]);

const body = z.object({
  seed: z.string().min(4).max(64),
  settings: z.unknown(),
  startedAt: z.number(),
  /** Id du suivi d'activité (`/api/solo-activity`), pour relier la partie enregistrée au panel admin */
  activityId: z.string().min(1).max(40).optional(),
  answers: z
    .array(z.object({ answer: answer.nullable(), timeMs: z.number().min(0).max(120_000) }))
    .max(200),
});

const HOUR_MS = 60 * 60 * 1000;
/** Parties solo enregistrées par compte et par heure : bien au-dessus d'un vrai joueur, borne la base. */
const SOLO_GAMES_PER_HOUR = 60;
/** Ancienneté maximale du début d'une partie, en ms. */
const MAX_GAME_AGE_MS = 3 * HOUR_MS;

/**
 * Enregistre une partie solo d'un joueur connecté.
 * Le serveur rejoue la partie à partir de la graine : les calculs et la justesse
 * des réponses sont recalculés ici, jamais crus sur parole.
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success || parsed.data.answers.length === 0) return NextResponse.json({ error: "bad-request" }, { status: 400 });

  if (await rateLimited(`solo-results:user:${session.user.id}`, SOLO_GAMES_PER_HOUR, HOUR_MS))
    return NextResponse.json({ error: "rate-limited" }, { status: 429 });

  const { seed, answers } = parsed.data;
  // Heure du navigateur : ramenée entre maintenant − 3 h et maintenant (une valeur hors limites
  // donnerait une date invalide, une horloge en avance une partie commencée dans le futur).
  const receivedAt = Date.now();
  const startedAt = Math.min(Math.max(parsed.data.startedAt, receivedAt - MAX_GAME_AGE_MS), receivedAt);
  const settings = sanitizeSettings(parsed.data.settings);
  if (!GAMES[settings.game].solo) return NextResponse.json({ error: "bad-request" }, { status: 400 });
  const playerId = session.user.id;
  // Le temps passé sur la correction après une erreur n'entre pas dans le rejeu : seuls comptent les temps de réponse.
  const engine = replaySolo(settings, { id: playerId, name: session.user.name }, seed, answers);

  const { id } = await saveGame({
    code: null,
    solo: true,
    hostUserId: playerId,
    settings,
    seed,
    startedAt: new Date(startedAt),
    endedAt: new Date(receivedAt),
    standings: engine.standings(),
    history: engine.history,
    userIds: { [playerId]: playerId },
  });
  if (parsed.data.activityId) await linkSoloPlayGame(parsed.data.activityId, playerId, id);
  return NextResponse.json({ id });
}
