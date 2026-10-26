"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { OPERATION_SYMBOL, renderTokens, type Puzzle } from "@calculus/game-core";
import { answerKindOfPuzzle, cleanInput } from "@/lib/answer";
import { useSession } from "@/lib/auth-client";
import { useTouch } from "@/lib/useTouch";
import { useVoiceInput } from "@/lib/useVoiceInput";
import { Keypad } from "./Keypad";
import { OperatorPad } from "./OperatorPad";

interface Props {
  text: string;
  /** Données du calcul : pour un nombre manquant, la case réponse prend la place du « ? ». */
  puzzle?: Puzzle;
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
export function CalcLine({ text, puzzle, value, onChange, onSubmit, disabled, status, shake, mark, autoFocus = true }: Props) {
  const t = useTranslations("game");
  const locale = useLocale();
  const touch = useTouch();
  const input = useRef<HTMLInputElement>(null);
  // Dictée : réglage du compte, la case se remplit à la voix et Entrée valide toujours.
  const { data: session } = useSession();
  const kind = answerKindOfPuzzle(puzzle);
  const voice = useVoiceInput({
    enabled: !!session?.user.voiceInput && !disabled && kind === "number",
    locale,
    resetKey: text,
    onNumber: (digits) => set(digits),
  });

  useEffect(() => {
    if (!disabled && autoFocus && !touch) input.current?.focus({ preventScroll: true });
  }, [text, disabled, autoFocus, touch]);

  const set = (v: string) => onChange(cleanInput(v, kind, MAX_DIGITS));
  const box = (
    <input
      ref={input}
      className={`answer${status ? " " + status : ""}`}
      style={{ width: `${Math.max(2.2, value.length + 0.6)}ch` }}
      value={value}
      onChange={(e) => set(e.target.value)}
      disabled={disabled}
      readOnly={touch}
      inputMode={touch ? "none" : kind === "op" ? "text" : "numeric"}
      aria-label={t("yourAnswer")}
    />
  );
  const hole = puzzle?.game === "missing" ? splitHole(puzzle) : null;

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
          {hole ? (
            // Nombre manquant : « 23 + [  ] = 41 ». Le texte complet reste lisible dans data-calc.
            <span data-testid="calc-text" data-calc={text}>
              {/* Pas d'espace entre la case et une parenthèse : « (7 + [ ]) × 3 ». */}
              {hole.before}
              {hole.before && !hole.before.endsWith("(") ? " " : null}
              {box}
              {hole.after && !hole.after.startsWith(")") ? " " : null}
              {hole.after} <span className="eq">=</span> {hole.result}
            </span>
          ) : (
            <>
              <span data-testid="calc-text" data-calc={text}>
                {text}
              </span>{" "}
              <span className="eq">=</span> {box}
            </>
          )}
        </span>
        {mark ? <span className="mark">{mark}</span> : null}
      </form>
      {voice !== "off" ? (
        <p className={`voice-status ${voice}`} aria-live="polite">
          {t(voice === "listening" && touch ? "voice.listeningTouch" : `voice.${voice}`)}
        </p>
      ) : null}
      {touch && kind === "op" ? (
        <OperatorPad disabled={disabled} onOperator={(op) => set(OPERATION_SYMBOL[op])} onDelete={() => set("")} onSubmit={submit} />
      ) : touch ? (
        <Keypad disabled={disabled} onDigit={(d) => set(value + d)} onDelete={() => set(value.slice(0, -1))} onSubmit={submit} />
      ) : null}
    </>
  );
}

/** Les deux côtés du « ? » d'un nombre manquant, et le résultat. */
function splitHole(puzzle: Extract<Puzzle, { game: "missing" }>) {
  const at = puzzle.tokens.indexOf("?");
  return {
    before: renderTokens(puzzle.tokens.slice(0, at)),
    after: renderTokens(puzzle.tokens.slice(at + 1)),
    result: puzzle.result,
  };
}
