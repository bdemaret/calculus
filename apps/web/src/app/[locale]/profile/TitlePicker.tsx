"use client";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { PlayerTitle } from "@/components/PlayerTitle";

/** Titre porté, sous le pseudo : le toucher déroule la liste de ceux que le joueur possède. */
export function TitlePicker({ owned, current }: { owned: string[]; current: string | null }) {
  const t = useTranslations("achievementsPage");
  const router = useRouter();
  const root = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!open) return;
    const clickOutside = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", clickOutside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", clickOutside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  async function choose(titleId: string | null) {
    setOpen(false);
    if (titleId === current) return;
    setBusy(true);
    setError(false);
    const res = await fetch("/api/profile/title", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ titleId }) }).catch(() => null);
    if (res?.ok) router.refresh();
    else setError(true);
    setBusy(false);
  }

  const label = (id: string | null) => (id ? <PlayerTitle title={id} /> : <span className="player-title">{t("titlesNone")}</span>);

  return (
    <div className="title-picker" ref={root}>
      <button type="button" className="title-picker-toggle" disabled={busy} aria-expanded={open} aria-label={t("titlesLabel")} onClick={() => setOpen(!open)}>
        {label(current)}
      </button>
      {open ? (
        <div className="title-picker-list" role="group" aria-label={t("titlesLabel")}>
          {[null, ...owned].map((id) => (
            <button key={id ?? "none"} type="button" aria-pressed={id === current} onClick={() => choose(id)}>
              {label(id)}
            </button>
          ))}
          {owned.length === 1 ? <p className="muted">{t("titlesEmpty")}</p> : null}
        </div>
      ) : null}
      {error ? <p className="form-error">{t("titlesError")}</p> : null}
    </div>
  );
}
