"use client";
import type { DailyRunView } from "@calculus/db";
import { local } from "./storage";

const STORAGE_KEY = "daily";

/** Dernier essai du navigateur : le jeton désigne l'essai d'un invité, le reste sert à l'accueil. */
export interface StoredDaily {
  date: string;
  token: string;
  finished: boolean;
  saved: boolean;
  correct: number;
  totalTimeMs: number;
}

export const readDaily = (): StoredDaily | null => local.get<StoredDaily | null>(STORAGE_KEY, null);

export function rememberDaily(run: DailyRunView) {
  const { date, token, finished, saved, correct, totalTimeMs } = run;
  local.set(STORAGE_KEY, { date, token, finished, saved, correct, totalTimeMs } satisfies StoredDaily);
}

/** Le compte est banni : le calcul du jour lui est fermé. */
export class DailyBannedError extends Error {}

type DailyRequest = { action: "state" | "start" | "next" } | { action: "answer"; value: number | null };

/** Une action sur l'essai du jour ; le serveur rend l'essai à jour, null s'il n'y en a pas encore. */
export async function callDaily(request: DailyRequest): Promise<DailyRunView | null> {
  const res = await fetch("/api/daily", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...request, token: readDaily()?.token ?? null }),
  });
  if (res.status === 403) throw new DailyBannedError("Calcul du jour : compte banni");
  if (!res.ok) throw new Error(`Calcul du jour : réponse ${res.status}`);
  const { run } = (await res.json()) as { run: DailyRunView | null };
  if (run) rememberDaily(run);
  return run;
}
