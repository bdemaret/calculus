"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";

/** Choix du titre porté, parmi ceux que le joueur possède. */
export function TitlePicker({ owned, current }: { owned: string[]; current: string | null }) {
  const t = useTranslations();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  async function choose(titleId: string | null) {
    setBusy(true);
    setError(false);
    const res = await fetch("/api/profile/title", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ titleId }) }).catch(() => null);
    if (res?.ok) router.refresh();
    else setError(true);
    setBusy(false);
  }

  return (
    <div className="title-picker">
      <h3>{t("achievementsPage.titlesHeading")}</h3>
      {owned.length ? (
        <div className="seg" role="group" aria-label={t("achievementsPage.titlesLabel")}>
          {[null, ...owned].map((id) => (
            <button key={id ?? "none"} type="button" disabled={busy} aria-pressed={current === id} onClick={() => choose(id)}>
              {id ? t(`titles.${id}`) : t("achievementsPage.titlesNone")}
            </button>
          ))}
        </div>
      ) : (
        <p className="muted">{t("achievementsPage.titlesEmpty")}</p>
      )}
      {error ? <p className="form-error">{t("achievementsPage.titlesError")}</p> : null}
    </div>
  );
}
