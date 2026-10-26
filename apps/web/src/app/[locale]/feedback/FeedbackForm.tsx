"use client";
import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { FEEDBACK_KINDS, FEEDBACK_MAX_LENGTH, FEEDBACK_MIN_LENGTH, type FeedbackKindName } from "@calculus/db/feedback";
import { Link } from "@/i18n/navigation";
import { Margin, MarginNote } from "@/components/Margin";

/** Formulaire « Faire un retour / signaler un bug », ouvert aux invités comme aux comptes. */
export function FeedbackForm({ signedIn, from, initialKind }: { signedIn: boolean; from?: string; initialKind?: FeedbackKindName }) {
  const t = useTranslations("feedback");
  const locale = useLocale();
  const [kind, setKind] = useState<FeedbackKindName>(initialKind ?? "bug");
  const [message, setMessage] = useState("");
  const [contact, setContact] = useState("");
  const [website, setWebsite] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (message.trim().length < FEEDBACK_MIN_LENGTH) {
      setError(t("error.too-short"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind, message, contact: signedIn ? undefined : contact.trim(), page: from, locale, website }),
      });
      if (res.ok) {
        setSent(true);
        setMessage("");
      } else {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(t(body.error === "too-many" ? "error.too-many" : "error.generic"));
      }
    } catch {
      setError(t("error.generic"));
    }
    setBusy(false);
  }

  if (sent) {
    return (
      <section className="auth">
        <h2>{t("thanksTitle")}</h2>
        <p className="muted">{t("thanks")}</p>
        <p className="actions">
          <Link className="btn" href={from ?? "/"}>
            {t("back")}
          </Link>
          <button type="button" className="link-btn" onClick={() => setSent(false)}>
            {t("another")}
          </button>
        </p>
      </section>
    );
  }

  return (
    <section className="auth feedback-form">
      <Margin>
        <MarginNote value={t("margin")} />
      </Margin>
      <h2>{t("title")}</h2>
      <p className="muted">{t("intro")}</p>
      <form onSubmit={submit}>
        <fieldset className="field">
          <legend>{t("kindLabel")}</legend>
          <div className="seg">
            {FEEDBACK_KINDS.map((k) => (
              <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)}>
                {t(`kind.${k}`)}
              </button>
            ))}
          </div>
        </fieldset>
        <label>
          {t(kind === "bug" ? "messageLabelBug" : "messageLabel")}
          <textarea
            className="text-input"
            rows={7}
            required
            minLength={FEEDBACK_MIN_LENGTH}
            maxLength={FEEDBACK_MAX_LENGTH}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={t(kind === "bug" ? "placeholderBug" : "placeholder")}
          />
          <span className="muted small">{t("remaining", { count: FEEDBACK_MAX_LENGTH - message.length })}</span>
        </label>
        {signedIn ? (
          <p className="muted small">{t("signedInNote")}</p>
        ) : (
          <label>
            {t("contactLabel")}
            <input
              className="text-input"
              type="email"
              autoComplete="email"
              maxLength={200}
              value={contact}
              onChange={(e) => setContact(e.target.value)}
            />
            <span className="muted small">{t("contactHelp")}</span>
          </label>
        )}
        {/* Piège à robots : invisible pour les humains, laissé vide. */}
        <input
          className="hp"
          type="text"
          name="website"
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
        />
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <button className="btn" type="submit" disabled={busy}>
          {busy ? t("sending") : t("send")}
        </button>
        <p className="muted small">
          {t.rich("privacy", { link: (chunks) => <Link href="/privacy">{chunks}</Link> })}
        </p>
      </form>
    </section>
  );
}
