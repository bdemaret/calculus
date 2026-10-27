"use client";
import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { TECHNIQUES, explainTechnique, generateDrill, randomSeed, type TechniqueId } from "@calculus/game-core";
import { CalcLine } from "@/components/CalcLine";
import { Check } from "@/components/Check";
import { Margin, MarginNote } from "@/components/Margin";
import { TechniqueSteps } from "@/components/TechniqueSteps";
import { TimerBar } from "@/components/TimerBar";
import { Link } from "@/i18n/navigation";
import { sfx } from "@/lib/sound";

/** Temps proposés pour le chrono, en secondes (0 : pas de chrono). */
const TIMER_CHOICES = [0, 10, 20] as const;

type Outcome = "right" | "wrong" | "timeout";

/**
 * Entraînement à une technique : des calculs sans fin qui s'y prêtent, et après chaque réponse
 * l'explication sur ce calcul. Hors classement, rien n'est enregistré : tout se passe ici.
 */
export function PracticeClient({ technique }: { technique: TechniqueId }) {
  const t = useTranslations();
  // Graine tirée après le premier rendu, pour que le serveur et le navigateur rendent la même page.
  const [seed, setSeed] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [value, setValue] = useState("");
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [timer, setTimer] = useState<(typeof TIMER_CHOICES)[number]>(0);
  const [startedAt, setStartedAt] = useState(0);
  const [score, setScore] = useState({ right: 0, total: 0, streak: 0 });

  useEffect(() => setSeed(randomSeed()), []);
  // Chaque calcul (ou changement de chrono) relance le temps.
  useEffect(() => setStartedAt(Date.now()), [seed, index, timer]);

  const question = useMemo(() => (seed ? generateDrill(technique, seed, index) : null), [seed, technique, index]);
  // L'explication de la technique entraînée, même si une autre pourrait aussi servir.
  const hint = useMemo(() => (question ? explainTechnique(technique, question.text) : null), [question, technique]);

  const finish = (result: Outcome) => {
    if (!question || outcome) return;
    setOutcome(result);
    if (result === "right") sfx.ok();
    else sfx.ko();
    setScore((s) => ({ right: s.right + (result === "right" ? 1 : 0), total: s.total + 1, streak: result === "right" ? s.streak + 1 : 0 }));
  };

  const submit = () => {
    if (!question || value === "") return;
    finish(Number(value) === question.answer ? "right" : "wrong");
  };

  const next = () => {
    setIndex((i) => i + 1);
    setValue("");
    setOutcome(null);
  };

  return (
    <section className="game practice">
      <Margin>
        <MarginNote value={<span className="grade">{score.streak}</span>} label={t("learn.streak")} />
        <MarginNote value={`${score.right}/${score.total}`} label={t("game.correct")} />
      </Margin>
      <div className="setup-head">
        <Link className="link-btn" href={`/learn?level=${TECHNIQUES[technique].level}#${technique}`}>
          ← {t("learn.back")}
        </Link>
        <h2>{t(`techniques.${technique}.name`)}</h2>
        <p className="muted">
          <span className="tag">{t("learn.level", { level: TECHNIQUES[technique].level, name: t(`levels.${TECHNIQUES[technique].level}`) })}</span>{" "}
          {t(`techniques.${technique}.summary`)}
        </p>
      </div>
      <div className="field">
        <span className="field-label" id="practice-timer">
          {t("learn.timer")}
        </span>
        <div className="seg" role="group" aria-labelledby="practice-timer">
          {TIMER_CHOICES.map((s) => (
            <button key={s} type="button" aria-pressed={timer === s} onClick={() => setTimer(s)}>
              {s === 0 ? t("learn.timerOff") : t("learn.timerSeconds", { seconds: s })}
            </button>
          ))}
        </div>
      </div>
      <TimerBar deadline={timer > 0 && question && !outcome ? startedAt + timer * 1000 : null} totalMs={timer * 1000} onExpire={() => finish("timeout")} />
      {question ? (
        <CalcLine
          text={question.text}
          value={value}
          onChange={setValue}
          onSubmit={submit}
          disabled={!!outcome}
          status={outcome ? (outcome === "right" ? "right" : "wrong") : null}
          shake={outcome === "wrong"}
        />
      ) : null}
      <p className="result-line" aria-live="polite">
        {outcome === "right" ? (
          <span className="ok">
            <Check /> {t("learn.right")}
          </span>
        ) : outcome && question ? (
          <span className="ko">
            {outcome === "timeout" ? t("game.timeUp") : t("game.no")} : {question.answer}
          </span>
        ) : null}
      </p>
      {outcome && hint ? (
        <div className="practice-explain">
          <h3>{t("learn.howTo")}</h3>
          <TechniqueSteps hint={hint} />
        </div>
      ) : null}
      <div className="actions">
        {outcome ? (
          <button className="btn" type="button" onClick={next} autoFocus>
            {t("learn.next")}
          </button>
        ) : null}
      </div>
    </section>
  );
}
