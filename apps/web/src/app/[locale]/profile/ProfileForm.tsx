"use client";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { authClient } from "@/lib/auth-client";
import { cleanName } from "@/lib/names";
import { isVoiceSupported } from "@/lib/useVoiceInput";

export function ProfileForm({ name, voiceInput }: { name: string; voiceInput: boolean }) {
  const t = useTranslations("profile");
  const router = useRouter();
  const [value, setValue] = useState(name);
  const [state, setState] = useState<"idle" | "saved" | "error">("idle");
  const [voice, setVoice] = useState(voiceInput);
  const [voiceState, setVoiceState] = useState<"idle" | "saved" | "error">("idle");
  const [voiceSupported, setVoiceSupported] = useState(true);

  useEffect(() => setVoiceSupported(isVoiceSupported()), []);

  const changeVoice = async (on: boolean) => {
    if (on === voice) return;
    setVoice(on);
    const { error } = await authClient.updateUser({ voiceInput: on });
    if (error) setVoice(!on);
    setVoiceState(error ? "error" : "saved");
    router.refresh();
  };

  return (
    <>
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
        <label>
          {t("name")}
          <input className="text-input" maxLength={20} value={value} onChange={(e) => { setValue(e.target.value); setState("idle"); }} />
        </label>
        <button className="btn" type="submit">
          {t("save")}
        </button>
        {state === "saved" ? <p className="form-ok">{t("saved")}</p> : null}
        {state === "error" ? <p className="form-error">{t("error")}</p> : null}
      </form>
      <fieldset className="field">
        <legend>{t("input")}</legend>
        <div className="seg" role="group">
          <button type="button" aria-pressed={!voice} onClick={() => changeVoice(false)}>
            {t("inputKeyboard")}
          </button>
          <button type="button" aria-pressed={voice} onClick={() => changeVoice(true)}>
            {t("inputVoice")}
          </button>
        </div>
        <p className="muted">{t("inputVoiceHelp")}</p>
        {voice && !voiceSupported ? <p className="form-error">{t("inputVoiceUnsupported")}</p> : null}
        {voiceState === "saved" ? <p className="form-ok">{t("inputSaved")}</p> : null}
        {voiceState === "error" ? <p className="form-error">{t("error")}</p> : null}
      </fieldset>
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
      <DeleteAccount />
    </>
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
