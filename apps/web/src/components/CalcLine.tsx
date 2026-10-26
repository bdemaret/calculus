"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useSession } from "@/lib/auth-client";
import { useTouch } from "@/lib/useTouch";
import { useVoiceInput } from "@/lib/useVoiceInput";
import { Keypad } from "./Keypad";

interface Props {
  text: string;
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  disabled?: boolean;
  status?: "right" | "wrong" | null;
  shake?: boolean;
  /** Ce qui s'affiche à droite du calcul (coche, temps…). */
  mark?: ReactNode;
  autoFocus?: boolean;
}

const MAX_DIGITS = 6;

/** Une ligne de cahier : le calcul, le signe égal et la réponse écrite à l'encre bleue. */
export function CalcLine({ text, value, onChange, onSubmit, disabled, status, shake, mark, autoFocus = true }: Props) {
  const t = useTranslations("game");
  const locale = useLocale();
  const touch = useTouch();
  const input = useRef<HTMLInputElement>(null);
  // Dictée : réglage du compte, la case se remplit à la voix et Entrée valide toujours.
  const { data: session } = useSession();
  const voice = useVoiceInput({
    enabled: !!session?.user.voiceInput && !disabled,
    locale,
    resetKey: text,
    onNumber: (digits) => set(digits),
  });

  useEffect(() => {
    if (!disabled && autoFocus && !touch) input.current?.focus({ preventScroll: true });
  }, [text, disabled, autoFocus, touch]);

  const set = (v: string) => onChange(v.replace(/\D/g, "").slice(0, MAX_DIGITS));
  const submit = () => {
    if (!disabled && value !== "") onSubmit();
  };

  return (
    <>
      <form
        className="game-row"
        autoComplete="off"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <span className={`calc${text.length > 11 ? " long" : ""}${shake ? " shake" : ""}`}>
          <span>{text}</span> <span className="eq">=</span>{" "}
          <input
            ref={input}
            className={`answer${status ? " " + status : ""}`}
            style={{ width: `${Math.max(2.2, value.length + 0.6)}ch` }}
            value={value}
            onChange={(e) => set(e.target.value)}
            disabled={disabled}
            readOnly={touch}
            inputMode={touch ? "none" : "numeric"}
            aria-label={t("yourAnswer")}
          />
        </span>
        {mark ? <span className="mark">{mark}</span> : null}
      </form>
      {voice !== "off" ? (
        <p className={`voice-status ${voice}`} aria-live="polite">
          {t(voice === "listening" && touch ? "voice.listeningTouch" : `voice.${voice}`)}
        </p>
      ) : null}
      {touch ? (
        <Keypad disabled={disabled} onDigit={(d) => set(value + d)} onDelete={() => set(value.slice(0, -1))} onSubmit={submit} />
      ) : null}
    </>
  );
}
