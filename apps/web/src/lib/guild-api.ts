import "server-only";
import { NextResponse } from "next/server";
import type { z } from "zod";
import type { GuildError } from "@calculus/db";

const STATUS: Record<GuildError, number> = {
  "not-member": 403,
  "not-leader": 403,
  "name-invalid": 400,
  "name-taken": 409,
  "in-guild": 409,
  full: 409,
  "not-found": 404,
};

/** Réponse d'une action de guilde : `{ ok: true }`, ou `{ error }` avec le statut HTTP qui va avec. */
export function guildResponse(error: GuildError | null) {
  return error ? NextResponse.json({ error }, { status: STATUS[error] }) : NextResponse.json({ ok: true });
}

/** Corps JSON validé par `schema`, null s'il est absent ou invalide. */
export async function readBody<T>(req: Request, schema: z.ZodType<T>): Promise<T | null> {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  return parsed.success ? parsed.data : null;
}

export const unauthorized = () => NextResponse.json({ error: "unauthorized" }, { status: 401 });
export const badRequest = () => NextResponse.json({ error: "bad-request" }, { status: 400 });
