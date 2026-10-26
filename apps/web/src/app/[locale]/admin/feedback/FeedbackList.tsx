"use client";
import { useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import type { AdminFeedback } from "@calculus/db";
import { Link, useRouter } from "@/i18n/navigation";

/** Retours des joueurs, avec les actions « traité » / « rouvrir » / « supprimer ». */
export function FeedbackList({ items }: { items: AdminFeedback[] }) {
  const t = useTranslations("admin.feedback");
  const tk = useTranslations("feedback.kind");
  const format = useFormatter();
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState(false);

  async function call(method: "PATCH" | "DELETE", body: { id: string; resolved?: boolean }) {
    setBusy(body.id);
    setError(false);
    const res = await fetch("/api/admin/feedback", {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => null);
    if (!res?.ok) setError(true);
    setBusy(null);
    router.refresh();
  }

  if (items.length === 0) return <p className="muted">{t("empty")}</p>;

  return (
    <>
      {error ? <p className="form-error">{t("error")}</p> : null}
      <ul className="feedback-list">
        {items.map((f) => (
          <li key={f.id} className={`panel feedback-item${f.resolved ? " resolved" : ""}`}>
            <div className="feedback-head">
              <span className={`admin-phase ${f.kind}`}>{tk(f.kind)}</span>
              <span className="muted">
                {format.dateTime(new Date(f.createdAt), { dateStyle: "medium", timeStyle: "short" })}
                {" · "}
                {f.user ? <Link href={`/admin/users/${f.user.id}`}>{f.user.name}</Link> : t("guest")}
                {f.user ? ` (${f.user.email})` : f.contact ? ` (${f.contact})` : null}
                {f.page ? ` · ${f.page}` : null} · {f.locale.toUpperCase()}
              </span>
            </div>
            <p className="feedback-message">{f.message}</p>
            <div className="actions">
              <button
                type="button"
                className="btn ghost small"
                disabled={busy === f.id}
                onClick={() => call("PATCH", { id: f.id, resolved: !f.resolved })}
              >
                {f.resolved ? t("reopen") : t("resolve")}
              </button>
              <button
                type="button"
                className="link-btn"
                disabled={busy === f.id}
                onClick={() => {
                  if (window.confirm(t("deleteConfirm"))) void call("DELETE", { id: f.id });
                }}
              >
                {t("delete")}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
