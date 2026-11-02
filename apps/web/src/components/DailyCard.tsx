"use client";
import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { DAILY_ROUNDS } from "@calculus/game-core";
import { Link } from "@/i18n/navigation";
import { readDaily } from "@/lib/daily";
import { formatSeconds } from "@/lib/format";

interface Props {
  today: string;
  loggedIn: boolean;
  /** Résultat du jour d'un compte, null s'il ne l'a pas fini. */
  result: { correct: number; totalTimeMs: number; rank: number } | null;
}

/** Accueil : le calcul du jour en grand tant qu'il n'est pas fait, puis son résultat en une ligne. */
export function DailyCard({ today, loggedIn, result }: Props) {
  const t = useTranslations("daily");
  const locale = useLocale();
  // Un invité n'a que son navigateur pour dire qu'il a déjà joué : lu après le premier rendu.
  const [guest, setGuest] = useState<{ correct: number; totalTimeMs: number } | null>(null);
  useEffect(() => {
    const stored = readDaily();
    if (!loggedIn && stored?.date === today && stored.finished) setGuest(stored);
  }, [loggedIn, today]);

  const done = result ?? guest;
  if (!done) {
    return (
      <section className="daily-home" aria-label={t("title")}>
        <Link className="choice daily-card" href="/daily" style={{ textDecoration: "none" }}>
          <span className="choice-glyph" aria-hidden="true">=</span>
          <span className="choice-kicker">{t("cardKicker")}</span>
          <span className="choice-title">{t("title")}</span>
          <span className="choice-sub">{t("cardSub", { rounds: DAILY_ROUNDS })}</span>
          <span className="daily-card-go">{t("cardGo")}</span>
        </Link>
      </section>
    );
  }
  return (
    <section className="daily-home" aria-label={t("title")}>
      <p className="daily-done">
        <span>
          <strong>{t("doneTitle")}</strong> {t("doneScore", { correct: done.correct, total: DAILY_ROUNDS })} · {formatSeconds(done.totalTimeMs, locale)}
          {result ? ` · ${t("doneRank", { rank: result.rank })}` : ""}
        </span>
        <Link href="/daily">{result ? t("seeBoard") : t("saveScore")}</Link>
      </p>
    </section>
  );
}
