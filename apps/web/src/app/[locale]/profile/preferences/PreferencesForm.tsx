"use client";
import { useEffect, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { authClient } from "@/lib/auth-client";
import type { DivisionDisplay } from "@/lib/division";
import { isVoiceSupported } from "@/lib/useVoiceInput";

export function PreferencesForm({ voiceInput, divisionDisplay }: { voiceInput: boolean; divisionDisplay: DivisionDisplay }) {
  const t = useTranslations("profile");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const [, startTransition] = useTransition();
  const [voice, setVoice] = useState(voiceInput);
  const [voiceState, setVoiceState] = useState<"idle" | "saved" | "error">("idle");
  const [voiceSupported, setVoiceSupported] = useState(true);
  const [division, setDivision] = useState(divisionDisplay);
  const [divisionState, setDivisionState] = useState<"idle" | "saved" | "error">("idle");

  useEffect(() => setVoiceSupported(isVoiceSupported()), []);

  const changeVoice = async (on: boolean) => {
    if (on === voice) return;
    setVoice(on);
    const { error } = await authClient.updateUser({ voiceInput: on });
    if (error) setVoice(!on);
    setVoiceState(error ? "error" : "saved");
    router.refresh();
  };

  const changeDivision = async (next: DivisionDisplay) => {
    if (next === division) return;
    const before = division;
    setDivision(next);
    const { error } = await authClient.updateUser({ divisionDisplay: next });
    if (error) setDivision(before);
    setDivisionState(error ? "error" : "saved");
    router.refresh();
  };

  return (
    <div className="profile-cards">
      {/* La langue suit l'adresse (/fr, /en) et le cookie de next-intl, comme le bouton de l'en-tête. */}
      <div className="profile-card">
        <fieldset className="field">
          <legend>{t("language")}</legend>
          <div className="seg" role="group">
            {routing.locales.map((l) => (
              <button
                key={l}
                type="button"
                lang={l}
                aria-pressed={l === locale}
                onClick={() => {
                  if (l !== locale) startTransition(() => router.replace(pathname, { locale: l }));
                }}
              >
                {t(`languages.${l}`)}
              </button>
            ))}
          </div>
        </fieldset>
      </div>
      <div className="profile-card">
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
          {voiceState === "error" ? <p className="form-error">{t("prefError")}</p> : null}
        </fieldset>
      </div>
      <div className="profile-card">
        <fieldset className="field">
          <legend>{t("division")}</legend>
          <div className="seg" role="group">
            <button type="button" aria-pressed={division === "standard"} onClick={() => changeDivision("standard")}>
              {t("divisionStandard")}
            </button>
            <button type="button" aria-pressed={division === "fraction"} onClick={() => changeDivision("fraction")}>
              {t("divisionFraction")}
            </button>
          </div>
          {divisionState === "saved" ? <p className="form-ok">{t("inputSaved")}</p> : null}
          {divisionState === "error" ? <p className="form-error">{t("prefError")}</p> : null}
        </fieldset>
      </div>
    </div>
  );
}
