"use client";
import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { DAILY_ROUNDS, shiftDailyDate, type DailyStreak } from "@calculus/game-core";
import { Link } from "@/i18n/navigation";
import { readDaily } from "@/lib/daily";
import { formatSeconds } from "@/lib/format";

/** Rafraîchissement du temps restant, en ms. */
const TICK_MS = 30_000;
/** Temps restant, en ms, sous lequel la carte passe en alerte. */
const URGENT_MS = 3 * 60 * 60 * 1000;
const MINUTE_MS = 60_000;

interface Props {
  today: string;
  loggedIn: boolean;
  /** Résultat du jour d'un compte, null s'il ne l'a pas fini. */
  result: { correct: number; totalTimeMs: number; rank: number } | null;
  /** Série du compte, null pour un invité. */
  streak: DailyStreak | null;
  /** Heure du serveur au rendu (ms) : le premier rendu du navigateur doit donner le même temps restant. */
  now: number;
  /** Fin du jour (ms) : passé cet instant, une série non prolongée est perdue. */
  endsAt: number;
}

/** Les sept derniers jours en pastilles : cochés, manqués, et aujourd'hui qui attend. */
function StreakWeek({ today, week }: { today: string; week: readonly boolean[] }) {
  const t = useTranslations("daily");
  const locale = useLocale();
  const letter = new Intl.DateTimeFormat(locale, { weekday: "narrow", timeZone: "UTC" });
  const full = new Intl.DateTimeFormat(locale, { weekday: "long", timeZone: "UTC" });
  return (
    <ol className="streak-week" aria-label={t("streakWeek")}>
      {week.map((done, i) => {
        const date = new Date(`${shiftDailyDate(today, i + 1 - week.length)}T00:00:00Z`);
        const isToday = i === week.length - 1;
        const state = done ? "done" : isToday ? "today" : "missed";
        const label = { done: "streakDayDone", today: "streakDayToday", missed: "streakDayMissed" } as const;
        return (
          <li key={i} data-state={state} aria-label={t(label[state], { day: full.format(date) })}>
            <span className="streak-dot" aria-hidden="true">
              {done ? "✓" : ""}
            </span>
            <span className="streak-day" aria-hidden="true">
              {letter.format(date)}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** Accueil : le calcul du jour en grand tant qu'il n'est pas fait (avec la série à sauver), puis son résultat et la série. */
export function DailyCard({ today, loggedIn, result, streak, now, endsAt }: Props) {
  const t = useTranslations("daily");
  const locale = useLocale();
  // Un invité n'a que son navigateur pour dire qu'il a déjà joué : lu après le premier rendu.
  const [guest, setGuest] = useState<{ correct: number; totalTimeMs: number } | null>(null);
  useEffect(() => {
    const stored = readDaily();
    // `saved` : l'essai d'un compte déconnecté depuis, que le visiteur ne peut pas reprendre comme invité.
    if (!loggedIn && stored?.date === today && stored.finished && !stored.saved) setGuest(stored);
  }, [loggedIn, today]);

  const done = result ?? guest;
  const atRisk = !done && !!streak && streak.current > 0;
  // Temps restant avant minuit, tenu à jour tant qu'une série est en jeu.
  const [left, setLeft] = useState(endsAt - now);
  useEffect(() => {
    if (!atRisk) return;
    const tick = () => setLeft(endsAt - Date.now());
    tick();
    const id = setInterval(tick, TICK_MS);
    return () => clearInterval(id);
  }, [atRisk, endsAt]);

  if (!done) {
    const minutes = Math.max(0, Math.ceil(left / MINUTE_MS));
    return (
      <section className="daily-home" aria-label={t("title")}>
        <Link className="choice daily-card" href="/daily" style={{ textDecoration: "none" }} data-streak={atRisk ? "at-risk" : undefined}>
          <span className="choice-glyph" aria-hidden="true">=</span>
          {atRisk && streak ? (
            <>
              <span className="choice-kicker" data-testid="daily-streak">
                <span aria-hidden="true">🔥 </span>
                {t("streakKicker", { count: streak.current })}
              </span>
              <span className="choice-title">{t("title")}</span>
              <span className="streak-warn">
                {t("streakWarn")}{" "}
                <strong className="streak-left" data-urgent={left < URGENT_MS || undefined}>
                  {minutes >= 60 ? t("streakLeftHours", { hours: Math.floor(minutes / 60), minutes: minutes % 60 }) : t("streakLeftMinutes", { minutes })}
                </strong>
              </span>
              <StreakWeek today={today} week={streak.week} />
              <span className="daily-card-go">{t("streakGo")}</span>
            </>
          ) : (
            <>
              <span className="choice-kicker">{t("cardKicker")}</span>
              <span className="choice-title">{t("title")}</span>
              <span className="choice-sub">{t("cardSub", { rounds: DAILY_ROUNDS })}</span>
              <span className="daily-card-go">{t("cardGo")}</span>
            </>
          )}
        </Link>
      </section>
    );
  }
  const kept = result && streak && streak.current > 0 ? streak : null;
  return (
    <section className="daily-home" aria-label={t("title")}>
      <div className="daily-done">
        <p>
          <span>
            <strong>{t("doneTitle")}</strong> {t("doneScore", { correct: done.correct, total: DAILY_ROUNDS })} · {formatSeconds(done.totalTimeMs, locale)}
            {result ? ` · ${t("doneRank", { rank: result.rank })}` : ""}
          </span>
          <Link href="/daily">{result ? t("seeBoard") : t("saveScore")}</Link>
        </p>
        {kept ? (
          <div className="daily-done-streak">
            <p data-testid="daily-streak">
              <span className="streak-flame" aria-hidden="true">🔥</span>
              <span>
                <strong>{t("streakDone", { count: kept.current })}</strong>
                <span className="streak-next">{t("streakTomorrow")}</span>
              </span>
            </p>
            <StreakWeek today={today} week={kept.week} />
          </div>
        ) : null}
      </div>
    </section>
  );
}
