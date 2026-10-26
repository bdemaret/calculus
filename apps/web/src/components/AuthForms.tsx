"use client";
import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { Link, useRouter } from "@/i18n/navigation";
import { authClient } from "@/lib/auth-client";
import { cleanName } from "@/lib/names";

function useErrorText() {
  const t = useTranslations("auth");
  return (code?: string, detail?: string, status?: number) => {
    // Rate limit de Better Auth : réponse 429 sans code.
    if (status === 429) return t("tooManyRequests");
    switch (code) {
      case "INVALID_EMAIL_OR_PASSWORD":
        return t("invalidCreds");
      case "USER_ALREADY_EXISTS":
      case "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL":
        return t("emailTaken");
      case "PASSWORD_TOO_SHORT":
        return t("passwordShort");
      case "INVALID_EMAIL":
        return t("invalidEmail");
      case "INVALID_TOKEN":
        return t("invalidToken");
      case "INVALID_NAME":
        return t("nameRequired");
      default:
        // On montre le détail technique pour aider à comprendre le problème.
        return detail || code ? `${t("generic")} (${[code, detail].filter(Boolean).join(" : ")})` : t("generic");
    }
  };
}

export function LoginForm() {
  const t = useTranslations("auth");
  const router = useRouter();
  const errorText = useErrorText();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <section className="auth">
      <h2>{t("loginTitle")}</h2>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          setBusy(true);
          setError(null);
          const { error } = await authClient.signIn.email({ email: String(f.get("email")), password: String(f.get("password")) });
          setBusy(false);
          if (error) return setError(errorText(error.code, error.message ?? `${error.status ?? ""} ${error.statusText ?? ""}`.trim(), error.status));
          router.push("/dashboard");
          router.refresh();
        }}
      >
        <label>
          {t("email")}
          <input className="text-input" name="email" type="email" autoComplete="email" required />
        </label>
        <label>
          {t("password")}
          <input className="text-input" name="password" type="password" autoComplete="current-password" required />
        </label>
        <button className="btn" type="submit" disabled={busy}>
          {t("loginBtn")}
        </button>
        {error ? <p className="form-error">{error}</p> : null}
      </form>
      <p className="muted">
        <Link href="/forgot-password">{t("forgot")}</Link>
      </p>
      <p className="muted">
        {t("noAccount")} <Link href="/signup">{t("signupLink")}</Link>
      </p>
      <p className="note">{t("guestHint")}</p>
    </section>
  );
}

export function SignupForm() {
  const t = useTranslations("auth");
  const router = useRouter();
  const errorText = useErrorText();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <section className="auth">
      <h2>{t("signupTitle")}</h2>
      <p className="muted">{t("signupIntro")}</p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const name = cleanName(String(f.get("name")));
          if (!name) return setError(t("nameRequired"));
          setBusy(true);
          setError(null);
          const { error } = await authClient.signUp.email({ name, email: String(f.get("email")), password: String(f.get("password")) });
          setBusy(false);
          if (error) return setError(errorText(error.code, error.message ?? `${error.status ?? ""} ${error.statusText ?? ""}`.trim(), error.status));
          router.push("/dashboard");
          router.refresh();
        }}
      >
        <label>
          {t("name")}
          <input className="text-input" name="name" maxLength={20} autoComplete="nickname" required />
        </label>
        <label>
          {t("email")}
          <input className="text-input" name="email" type="email" autoComplete="email" required />
        </label>
        <label>
          {t("password")}
          <input className="text-input" name="password" type="password" autoComplete="new-password" minLength={8} required />
          <span className="muted" style={{ fontWeight: 400, fontSize: 14 }}>
            {t("passwordRule")}
          </span>
        </label>
        <button className="btn" type="submit" disabled={busy}>
          {t("signupBtn")}
        </button>
        {error ? <p className="form-error">{error}</p> : null}
      </form>
      <p className="muted">
        {t("haveAccount")} <Link href="/login">{t("loginLink")}</Link>
      </p>
    </section>
  );
}

export function ForgotForm() {
  const t = useTranslations("auth");
  const locale = useLocale();
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  return (
    <section className="auth">
      <h2>{t("forgotTitle")}</h2>
      <p className="muted">{t("forgotText")}</p>
      {sent ? (
        <p className="form-ok">{t("linkSent")}</p>
      ) : (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            setBusy(true);
            // Même réponse que l'adresse existe ou non : on ne révèle pas qui est inscrit.
            const args = { email: String(f.get("email")), redirectTo: `/${locale}/reset-password` };
            // Le nom de cette méthode a changé selon les versions de Better Auth.
            const c = authClient as unknown as Record<string, ((a: typeof args) => Promise<unknown>) | undefined>;
            await (c.requestPasswordReset ?? c.forgetPassword)?.(args);
            setBusy(false);
            setSent(true);
          }}
        >
          <label>
            {t("email")}
            <input className="text-input" name="email" type="email" autoComplete="email" required />
          </label>
          <button className="btn" type="submit" disabled={busy}>
            {t("sendLink")}
          </button>
        </form>
      )}
    </section>
  );
}

export function ResetForm() {
  const t = useTranslations("auth");
  const errorText = useErrorText();
  const params = useSearchParams();
  const token = params.get("token");
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(params.get("error") ? errorText("INVALID_TOKEN") : null);

  return (
    <section className="auth">
      <h2>{t("resetTitle")}</h2>
      {done ? (
        <>
          <p className="form-ok">{t("resetDone")}</p>
          <Link className="btn" href="/login">
            {t("loginBtn")}
          </Link>
        </>
      ) : (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!token) return setError(errorText("INVALID_TOKEN"));
            const f = new FormData(e.currentTarget);
            const { error } = await authClient.resetPassword({ newPassword: String(f.get("password")), token });
            if (error) return setError(errorText(error.code, error.message ?? `${error.status ?? ""} ${error.statusText ?? ""}`.trim(), error.status));
            setDone(true);
          }}
        >
          <label>
            {t("newPassword")}
            <input className="text-input" name="password" type="password" autoComplete="new-password" minLength={8} required />
          </label>
          <button className="btn" type="submit">
            {t("resetBtn")}
          </button>
          {error ? <p className="form-error">{error}</p> : null}
        </form>
      )}
    </section>
  );
}
