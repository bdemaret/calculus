import { generateQuestion } from "./generator";
import { DIFFICULTIES, LEVELS } from "./levels";
import { defaultSettings } from "./settings";
import type { Difficulty, Question } from "./types";

/** Calculs du calcul du jour : un par niveau, du plus facile au plus dur. */
export const DAILY_ROUNDS = DIFFICULTIES.length;
/** Fuseau du changement de jour : le site est français, minuit est le même pour tous les joueurs. */
export const DAILY_TIME_ZONE = "Europe/Paris";
/** Après minuit, délai en ms pour finir un calcul du jour commencé la veille ; le gagnant n'est désigné qu'ensuite. */
export const DAILY_LATE_MS = 30 * 60 * 1000;
/** Retard admis en ms sur la fin d'un calcul : le temps que la réponse arrive au serveur. */
export const DAILY_GRACE_MS = 1000;

const DAY_MS = 24 * 60 * 60 * 1000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Jour du calcul à l'instant `now` (ms), à l'heure de Paris : « 2026-11-01 ». */
export function dailyDate(now: number): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: DAILY_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

/** Vrai pour une date réelle au format « 2026-11-01 » (une adresse peut contenir n'importe quoi). */
export function isDailyDate(date: string): boolean {
  if (!DATE_RE.test(date)) return false;
  const time = Date.parse(`${date}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === date;
}

/** Jour décalé de `days` : pour passer d'un classement au précédent. */
export function shiftDailyDate(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/** Niveau du calcul n° `index` (0 = Facile, 4 = Légende). */
export const dailyDifficulty = (index: number): Difficulty => DIFFICULTIES[index]!;

/** Temps donné pour le calcul n° `index`, en ms : celui du niveau, comme une partie par défaut. */
export const dailyTimeLimitMs = (index: number): number => LEVELS[dailyDifficulty(index)].defaultTime * 1000;

/** Le calcul n° `index` du jour : même graine, donc même calcul pour tous les joueurs. */
export function dailyQuestion(seed: string, index: number): Question {
  return generateQuestion(seed, index, defaultSettings(dailyDifficulty(index)));
}

/** Résultat comparable d'un calcul du jour. */
export interface DailyScore {
  correct: number;
  /** Temps total de calcul, en ms */
  totalTimeMs: number;
}

/** Ordre du classement : le plus de bons calculs, puis le temps total le plus court. Négatif si `a` passe devant `b`. */
export const compareDailyScores = (a: DailyScore, b: DailyScore): number => b.correct - a.correct || a.totalTimeMs - b.totalTimeMs;
