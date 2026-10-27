"use client";
import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { Avatar } from "@/components/PlayerChips";
import { authClient } from "@/lib/auth-client";
import { squareAvatar } from "@/lib/avatar";
import { cleanName } from "@/lib/names";

type Status = { ok: boolean; text: string } | null;

/** Onglet « Mon profil » : photo et pseudo, puis connexion (e-mail, mot de passe), puis sortie du compte. */
export function ProfileForm({ name, email, image }: { name: string; email: string; image: string | null }) {
  const t = useTranslations("profile");
  const router = useRouter();
  return (
    <div className="profile-cards">
      <div className="profile-card">
        <h3>{t("identityTitle")}</h3>
        <AvatarForm name={name} image={image} />
        <NameForm name={name} />
      </div>
      <div className="profile-card">
        <h3>{t("loginTitle")}</h3>
        <div className="profile-email">
          <span className="field-label">{t("email")}</span>
          <span className="value">{email}</span>
          <span className="muted small">{t("emailHelp")}</span>
        </div>
        <PasswordForm />
      </div>
      <div className="profile-card">
        <p>
          <button
            className="btn ghost"
            type="button"
            onClick={async () => {
              await authClient.signOut();
              router.push("/");
              router.refresh();
            }}
          >
            {t("logout")}
          </button>
        </p>
        <DeleteAccount />
      </div>
    </div>
  );
}

/** Photo de profil : recadrée en carré et réduite dans le navigateur, puis envoyée à `/api/avatar`. */
function AvatarForm({ name, image }: { name: string; image: string | null }) {
  const t = useTranslations("profile");
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status>(null);

  async function upload(file: File) {
    setBusy(true);
    setStatus(null);
    try {
      const body = new FormData();
      body.set("file", await squareAvatar(file));
      const res = await fetch("/api/avatar", { method: "POST", body });
      setStatus(res.ok ? { ok: true, text: t("avatarSaved") } : { ok: false, text: t("avatarError") });
    } catch {
      // Format que le navigateur ne sait pas décoder (HEIC sous Chrome, par exemple).
      setStatus({ ok: false, text: t("avatarError") });
    }
    setBusy(false);
    router.refresh();
  }

  async function remove() {
    setBusy(true);
    setStatus(null);
    const res = await fetch("/api/avatar", { method: "DELETE" }).catch(() => null);
    setStatus(res?.ok ? { ok: true, text: t("avatarRemoved") } : { ok: false, text: t("avatarError") });
    setBusy(false);
    router.refresh();
  }

  return (
    <div className="avatar-edit">
      <Avatar className="xl" name={name} image={image} />
      <div className="stack" style={{ gap: 8 }}>
        <p className="actions">
          <button className="btn ghost" type="button" disabled={busy} onClick={() => input.current?.click()}>
            {image ? t("avatarChange") : t("avatarAdd")}
          </button>
          {image ? (
            <button className="link-btn" type="button" disabled={busy} onClick={remove}>
              {t("avatarRemove")}
            </button>
          ) : null}
        </p>
        <input
          ref={input}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          aria-label={t("avatarAdd")}
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void upload(file);
          }}
        />
        <p className="muted small">{t("avatarHelp")}</p>
        {status ? <p className={status.ok ? "form-ok" : "form-error"}>{status.text}</p> : null}
      </div>
    </div>
  );
}

function NameForm({ name }: { name: string }) {
  const t = useTranslations("profile");
  const router = useRouter();
  const [value, setValue] = useState(name);
  const [state, setState] = useState<"idle" | "saved" | "error">("idle");
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const n = cleanName(value);
        if (!n) return;
        const { error } = await authClient.updateUser({ name: n });
        setState(error ? "error" : "saved");
        router.refresh();
      }}
    >
      <label className="field-label" htmlFor="profile-name">
        {t("name")}
      </label>
      <div className="friend-add-row">
        <input
          className="text-input"
          id="profile-name"
          maxLength={20}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setState("idle");
          }}
        />
        <button className="btn" type="submit" disabled={!cleanName(value) || cleanName(value) === name}>
          {t("save")}
        </button>
      </div>
      {state === "saved" ? <p className="form-ok">{t("saved")}</p> : null}
      {state === "error" ? <p className="form-error">{t("error")}</p> : null}
    </form>
  );
}

/** Changement de mot de passe : l'ancien est demandé, les autres appareils sont déconnectés. */
function PasswordForm() {
  const t = useTranslations("profile");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status>(null);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const f = new FormData(form);
        const next = String(f.get("newPassword"));
        if (next !== String(f.get("confirmPassword"))) return setStatus({ ok: false, text: t("passwordMismatch") });
        setBusy(true);
        setStatus(null);
        const { error } = await authClient.changePassword({
          currentPassword: String(f.get("currentPassword")),
          newPassword: next,
          revokeOtherSessions: true,
        });
        setBusy(false);
        if (!error) {
          form.reset();
          return setStatus({ ok: true, text: t("passwordSaved") });
        }
        const text =
          error.code === "INVALID_PASSWORD"
            ? t("passwordWrong")
            : error.code === "PASSWORD_TOO_SHORT"
              ? t("passwordTooShort")
              : error.status === 429
                ? t("passwordTooMany")
                : t("passwordError");
        setStatus({ ok: false, text });
      }}
    >
      <h4>{t("passwordTitle")}</h4>
      <label>
        {t("passwordCurrent")}
        <input className="text-input" name="currentPassword" type="password" autoComplete="current-password" required />
      </label>
      <label>
        {t("passwordNew")}
        <input className="text-input" name="newPassword" type="password" autoComplete="new-password" minLength={8} maxLength={128} required />
      </label>
      <label>
        {t("passwordConfirm")}
        <input className="text-input" name="confirmPassword" type="password" autoComplete="new-password" minLength={8} maxLength={128} required />
      </label>
      <p className="muted small">{t("passwordHelp")}</p>
      <p>
        <button className="btn" type="submit" disabled={busy}>
          {t("passwordSave")}
        </button>
      </p>
      {status ? <p className={status.ok ? "form-ok" : "form-error"}>{status.text}</p> : null}
    </form>
  );
}

/** Suppression définitive du compte, confirmée par le mot de passe. */
function DeleteAccount() {
  const t = useTranslations("profile");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open)
    return (
      <p>
        <button className="link-btn" type="button" onClick={() => setOpen(true)}>
          {t("deleteOpen")}
        </button>
      </p>
    );

  return (
    <form
      className="danger-zone"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        setBusy(true);
        setError(null);
        const { error } = await authClient.deleteUser({ password: String(f.get("password")) });
        setBusy(false);
        if (error) return setError(error.code === "INVALID_PASSWORD" ? t("deleteWrongPassword") : t("deleteError"));
        router.push("/");
        router.refresh();
      }}
    >
      <h3>{t("deleteTitle")}</h3>
      <p className="muted">{t("deleteText")}</p>
      <label>
        {t("deletePassword")}
        <input className="text-input" name="password" type="password" autoComplete="current-password" required />
      </label>
      <p className="actions">
        <button className="btn danger" type="submit" disabled={busy}>
          {t("deleteBtn")}
        </button>
        <button className="btn ghost" type="button" onClick={() => setOpen(false)}>
          {t("deleteCancel")}
        </button>
      </p>
      {error ? <p className="form-error">{error}</p> : null}
    </form>
  );
}
