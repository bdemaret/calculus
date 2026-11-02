"use client";
import { useEffect, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import type { AchievementCategory } from "@calculus/game-core";
import type { AchievementStatus } from "@calculus/db";
import { useRouter } from "@/i18n/navigation";
import { AchievementBadge } from "@/components/AchievementBadge";

const CATEGORIES: readonly AchievementCategory[] = ["journey", "mode", "game", "fun", "social"];

export function AchievementsView({ achievements }: { achievements: AchievementStatus[] }) {
  const t = useTranslations("achievementsPage");
  const router = useRouter();
  const [filter, setFilter] = useState<AchievementCategory | null>(null);
  // Gardés à l'écran : le rafraîchissement qui suit retire la pastille de l'onglet, pas la mention sur les cartes.
  const [fresh] = useState(() => new Set(achievements.filter((a) => a.isNew).map((a) => a.id)));

  useEffect(() => {
    if (fresh.size === 0) return;
    void fetch("/api/achievements/seen", { method: "POST" }).then((r) => {
      if (r.ok) router.refresh();
    });
  }, [fresh, router]);

  const count = achievements.filter((a) => a.unlockedAt).length;
  const shown = filter ? achievements.filter((a) => a.category === filter) : achievements;
  return (
    <div className="stack">
      <div className="achievement-summary">
        <p style={{ margin: 0 }} data-testid="achievements-summary">
          {t("summary", { count, total: achievements.length })}
        </p>
        <span className="achievement-meter" aria-hidden="true">
          <i style={{ width: `${(count / achievements.length) * 100}%` }} />
        </span>
      </div>
      <div className="seg" role="group" aria-label={t("filtersLabel")}>
        {[null, ...CATEGORIES].map((category) => (
          <button key={category ?? "all"} type="button" aria-pressed={filter === category} onClick={() => setFilter(category)}>
            {t(category ?? "all")}
          </button>
        ))}
      </div>
      <ul className="achievement-grid">
        {shown.map((a) => (
          <AchievementCard key={a.id} achievement={a} fresh={fresh.has(a.id)} />
        ))}
      </ul>
    </div>
  );
}

function AchievementCard({ achievement: a, fresh }: { achievement: AchievementStatus; fresh: boolean }) {
  const t = useTranslations();
  const format = useFormatter();
  const hidden = a.secret && !a.unlockedAt;
  const className = ["achievement", a.unlockedAt ? null : "locked", fresh ? "fresh" : null].filter(Boolean).join(" ");
  return (
    <li className={className} data-testid={hidden ? undefined : `achievement-${a.id}`}>
      <AchievementBadge tier={a.unlockedAt ? a.tier : undefined} mark={hidden ? "?" : "★"} />
      <div>
        <strong>
          {hidden ? t("achievementsPage.secret") : t(`achievements.${a.id}.name`)}
          {fresh ? <span className="fresh-tag">{t("achievementsPage.fresh")}</span> : null}
        </strong>
        <p>{hidden ? t("achievementsPage.secretDesc") : t(`achievements.${a.id}.desc`)}</p>
        {a.unlockedAt ? <p className="muted">{t("achievementsPage.unlockedOn", { date: format.dateTime(new Date(a.unlockedAt), { dateStyle: "long" }) })}</p> : null}
        {a.title && !hidden ? <p className="muted">{t("achievementsPage.offersTitle", { title: t(`titles.${a.title}`) })}</p> : null}
        {a.progress && !a.unlockedAt ? (
          <>
            <p className="muted">{t("achievementsPage.progress", { value: a.progress.value, target: a.progress.target })}</p>
            <span className="achievement-progress" aria-hidden="true">
              <i style={{ width: `${(a.progress.value / a.progress.target) * 100}%` }} />
            </span>
          </>
        ) : null}
      </div>
    </li>
  );
}
