import { NextResponse } from "next/server";
import { z } from "zod";
import { ALL_OPERATIONS, GAMES, GameEngine, MAX_EXPRESSION_LENGTH, sanitizeSettings, type Operation } from "@calculus/game-core";
import { saveGame } from "@calculus/db";
import { getSession } from "@/lib/auth";

/** Réponse d'une manche : un nombre, une expression ou un opérateur ; null si le temps s'est écoulé. */
const answer = z.union([
  z.object({ value: z.number().int().min(0).max(1_000_000) }).strict(),
  z.object({ expr: z.string().min(1).max(MAX_EXPRESSION_LENGTH) }).strict(),
  z.object({ op: z.enum(ALL_OPERATIONS as [Operation, ...Operation[]]) }).strict(),
]);

const body = z.object({
  seed: z.string().min(4).max(64),
  settings: z.unknown(),
  startedAt: z.number(),
  answers: z
    .array(z.object({ answer: answer.nullable(), timeMs: z.number().min(0).max(120_000) }))
    .max(200),
});

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

  const { seed, answers, startedAt } = parsed.data;
  const settings = sanitizeSettings(parsed.data.settings);
  if (!GAMES[settings.game].solo) return NextResponse.json({ error: "bad-request" }, { status: 400 });
  const playerId = session.user.id;
  const engine = new GameEngine(settings, [{ id: playerId, name: session.user.name }], seed);

  let t = 0;
  for (const a of answers) {
    const round = engine.startRound(t);
    if (!round) break;
    if (a.answer !== null) engine.submit(playerId, a.answer, t + Math.min(a.timeMs, round.timeLimitMs));
    engine.closeRound();
    t += round.timeLimitMs + 1;
  }

  const { id } = await saveGame({
    code: null,
    solo: true,
    hostUserId: playerId,
    settings,
    seed,
    startedAt: new Date(startedAt),
    endedAt: new Date(),
    standings: engine.standings(),
    history: engine.history,
    userIds: { [playerId]: playerId },
  });
  return NextResponse.json({ id });
}
