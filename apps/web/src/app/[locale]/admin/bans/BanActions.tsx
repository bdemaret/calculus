"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";

interface Props {
  userId: string;
  name: string;
  banned: boolean;
  /** Signalement à classer sans suite (bouton absent sans lui) */
  reportId?: string;
}

/** Boutons du panel : bannir ou débannir un compte, classer un signalement. */
export function BanActions({ userId, name, banned, reportId }: Props) {
  const t = useTranslations("admin.bans");
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  async function call(method: "POST" | "PATCH", body: object) {
    setBusy(true);
    setError(false);
    const res = await fetch("/api/admin/bans", { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    if (!res?.ok) setError(true);
    setBusy(false);
    router.refresh();
  }

  return (
    <div className="actions">
      {banned ? (
        <button
          type="button"
          className="btn ghost small"
          disabled={busy}
          onClick={() => {
            if (window.confirm(t("unbanConfirm", { name }))) void call("POST", { action: "unban", userId });
          }}
        >
          {t("unban")}
        </button>
      ) : (
        <button
          type="button"
          className="btn ghost small"
          disabled={busy}
          onClick={() => {
            if (window.confirm(t("banConfirm", { name }))) void call("POST", { action: "ban", userId });
          }}
        >
          {t("ban")}
        </button>
      )}
      {reportId && !banned ? (
        <button type="button" className="link-btn" disabled={busy} onClick={() => void call("PATCH", { reportId })}>
          {t("dismiss")}
        </button>
      ) : null}
      {error ? <span className="form-error">{t("error")}</span> : null}
    </div>
  );
}
