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

/* ---------- Série ---------- */

/** Jours montrés sur l'accueil : les six derniers et aujourd'hui. */
export const DAILY_STREAK_WEEK = 7;

/** Série de jours consécutifs où un compte a fini le calcul du jour. */
export interface DailyStreak {
  /** Série en cours : elle tient encore si le dernier jour joué est hier, et tombe à 0 après un jour manqué. */
  current: number;
  /** Plus longue série jamais faite : c'est elle qui débloque les succès, perdre sa série ne les retire pas. */
  best: number;
  playedToday: boolean;
  /** Les `DAILY_STREAK_WEEK` derniers jours, aujourd'hui en dernier : vrai si le calcul a été fini ce jour-là. */
  week: boolean[];
}

/** Plus longue suite de jours consécutifs parmi `dates` (dans n'importe quel ordre) : le compteur des succès de série, qui ne dépend pas du jour courant. */
export function longestDailyStreak(dates: readonly string[]): number {
  let best = 0;
  let run = 0;
  let previous: string | null = null;
  for (const date of [...new Set(dates)].sort()) {
    run = previous !== null && shiftDailyDate(previous, 1) === date ? run + 1 : 1;
    best = Math.max(best, run);
    previous = date;
  }
  return best;
}

/** Série d'un compte à partir des jours (« 2026-11-01 », dans n'importe quel ordre) où il a fini son essai. */
export function dailyStreak(dates: readonly string[], today: string): DailyStreak {
  const played = new Set(dates);
  const best = longestDailyStreak(dates);
  const playedToday = played.has(today);
  let current = 0;
  for (let day = playedToday ? today : shiftDailyDate(today, -1); played.has(day); day = shiftDailyDate(day, -1)) current += 1;
  const week = Array.from({ length: DAILY_STREAK_WEEK }, (_, i) => played.has(shiftDailyDate(today, i + 1 - DAILY_STREAK_WEEK)));
  return { current, best, playedToday, week };
}

/** Heure, en ms depuis minuit, à Paris. */
function parisTimeOfDay(now: number): number {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: DAILY_TIME_ZONE, hourCycle: "h23", hour: "numeric", minute: "numeric", second: "numeric" }).formatToParts(now);
  const read = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return ((read("hour") * 60 + read("minute")) * 60 + read("second")) * 1000 + (((now % 1000) + 1000) % 1000);
}

/** Instant (ms) du prochain minuit à Paris : la fin du jour en cours, après laquelle une série non prolongée est perdue. */
export function dailyEndsAt(now: number): number {
  const guess = now + DAY_MS - parisTimeOfDay(now);
  // Les jours de changement d'heure durent 23 ou 25 h : on retombe à 1 h ou 23 h, jamais à minuit.
  const off = parisTimeOfDay(guess);
  return off < DAY_MS / 2 ? guess - off : guess + DAY_MS - off;
}

/* ---------- Anti-bot ---------- */

/**
 * Temps en ms sous lequel une bonne réponse est physiquement impossible, quel que soit le calcul : voir l'énoncé, taper, valider,
 * aller-retour réseau compris (le serveur mesure de l'envoi du calcul à l'arrivée de la réponse). Seule cause de ban automatique.
 * Le même à tous les niveaux : « 90 ÷ 10 » en Difficile se lit aussi vite qu'un calcul Facile.
 */
export const DAILY_BAN_MS = 400;
/**
 * Temps en ms sous lequel une bonne réponse au calcul n° `index` est rapide pour son niveau (de Facile à Légende) : signalée, jamais sanctionnée.
 * Le niveau ne dit pas la difficulté d'un calcul précis, c'est à l'administrateur de juger en le lisant.
 */
export const DAILY_REVIEW_MS = [DAILY_BAN_MS, 600, 800, 800, 800] as const;
/** Écart en ms, entre le calcul le plus lent et le plus rapide d'un sans-faute, sous lequel les temps sont trop réguliers : un humain met bien plus longtemps en Légende qu'en Facile. */
export const DAILY_FLAT_SPREAD_MS = 400;

/** Règle déclenchée par l'anti-bot : `too-fast` bannit, les autres signalent seulement. */
export type BotRule = "too-fast" | "fast-for-level" | "flat-times";
/** `bot` : temps impossible, ban automatique ; `suspect` : à examiner par un administrateur, sans sanction. */
export type BotVerdict = "ok" | "suspect" | "bot";

export interface BotCheck {
  verdict: BotVerdict;
  rules: BotRule[];
}

/**
 * Juge les réponses d'un essai, dans l'ordre des calculs. Seules les bonnes réponses comptent : une faute de frappe est rapide,
 * un bot répond juste. Un bot qui attend avant de répondre n'est pas banni ; c'est le signalement et la relecture qui le rattrapent.
 */
export function checkDailyBot(answers: readonly { correct: boolean; timeMs: number }[]): BotCheck {
  const rules = new Set<BotRule>();
  answers.forEach((a, index) => {
    const review = DAILY_REVIEW_MS[index];
    if (!a.correct || review === undefined) return;
    if (a.timeMs < DAILY_BAN_MS) rules.add("too-fast");
    else if (a.timeMs < review) rules.add("fast-for-level");
  });
  if (answers.length >= DAILY_ROUNDS && answers.every((a) => a.correct)) {
    const times = answers.map((a) => a.timeMs);
    if (Math.max(...times) - Math.min(...times) < DAILY_FLAT_SPREAD_MS) rules.add("flat-times");
  }
  return { verdict: rules.has("too-fast") ? "bot" : rules.size ? "suspect" : "ok", rules: [...rules] };
}
