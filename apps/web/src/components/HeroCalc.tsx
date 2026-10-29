"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { generateQuestion, randomSeed, type Question } from "@calculus/game-core";
import { formatSeconds } from "@/lib/format";
import { sfx } from "@/lib/sound";
import { useTouch } from "@/lib/useTouch";
import { CalcLine } from "./CalcLine";
import { Check } from "./Check";
import { Margin, MarginNote } from "./Margin";

/**
 * L'échauffement de l'accueil : un calcul jouable sans lancer de partie.
 * Sur écran tactile il reste replié (sans pavé) tant qu'on ne le touche pas,
 * pour que le pavé n'occupe pas l'écran et ne passe pas pour le jeu lui-même.
 */
export function HeroCalc() {
  const t = useTranslations("home");
  const locale = useLocale();
  const touch = useTouch();
  const [q, setQ] = useState<Question | null>(null);
  const [value, setValue] = useState("");
  const [result, setResult] = useState<{ ok: boolean; ms: number } | null>(null);
  const [streak, setStreak] = useState(0);
  const [open, setOpen] = useState(false);
  const shownAt = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const next = useCallback(() => {
    setQ(generateQuestion(randomSeed(), 0, { difficulty: 2, operations: ["add", "sub", "mul"], parentheses: false }));
    setValue("");
    setResult(null);
    shownAt.current = performance.now();
  }, []);

  useEffect(() => {
    next();
    return () => clearTimeout(timer.current);
  }, [next]);

  const submit = () => {
    if (!q || result) return;
    const ok = Number(value) === q.answer;
    setResult({ ok, ms: performance.now() - shownAt.current });
    setStreak((s) => (ok ? s + 1 : 0));
    if (ok) sfx.ok();
    else sfx.ko();
    timer.current = setTimeout(next, ok ? 900 : 1600);
  };

  const folded = touch && !open;
  return (
    <>
      {streak > 1 ? (
        <Margin>
          <MarginNote value={streak} label={t("streak")} />
        </Margin>
      ) : null}
      <p className="warmup-kicker" id="warmup-kicker">
        {t("warmup")}
      </p>
      {q && folded ? (
        <button type="button" className="warmup-try" aria-describedby="warmup-kicker" onClick={() => setOpen(true)}>
          <span className="warmup-calc">
            {q.text} <span className="eq">=</span> ?
          </span>
        </button>
      ) : q ? (
        <CalcLine
          docked={false}
          text={q.text}
          value={value}
          onChange={setValue}
          onSubmit={submit}
          disabled={!!result}
          status={result ? (result.ok ? "right" : "wrong") : null}
          shake={!!result && !result.ok}
          mark={
            result ? (
              result.ok ? (
                <span className="ok" style={{ color: "var(--ok)" }}>
                  <Check /> {formatSeconds(result.ms, locale)}
                </span>
              ) : (
                <span style={{ color: "var(--ko)" }}>{t("wrong", { answer: q.answer })}</span>
              )
            ) : null
          }
        />
      ) : (
        <div className="calc" aria-hidden="true">
          &nbsp;
        </div>
      )}
      {folded ? null : <p className="hint">{touch ? t("hintTouch") : t("hint")}</p>}
    </>
  );
}
