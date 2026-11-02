"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { DailyAnswerView, DailyRunView } from "@calculus/db";
import { DAILY_ROUNDS, detectTechnique } from "@calculus/game-core";
import { Link, useRouter } from "@/i18n/navigation";
import { CalcLine } from "@/components/CalcLine";
import { Check } from "@/components/Check";
import { Margin, MarginNote } from "@/components/Margin";
import { MathText } from "@/components/MathText";
import { RoundCorrection } from "@/components/RoundCorrection";
import { TimerBar } from "@/components/TimerBar";
import { revealSeparator } from "@/lib/answer";
import { callDaily } from "@/lib/daily";
import { formatSeconds } from "@/lib/format";
import { celebrate, sfx } from "@/lib/sound";
import { useShowTips } from "@/lib/tips";
import { useGameOnScreen } from "@/lib/useGameOnScreen";
import { useTouch } from "@/lib/useTouch";

/**
 * Mêmes étapes qu'en solo, mais chaque calcul vient du serveur : `waiting` couvre l'aller-retour
 * (case verrouillée, chrono masqué). `error` : le serveur n'a pas répondu, l'essai reprend au rechargement.
 */
type Phase = "loading" | "intro" | "countdown" | "waiting" | "question" | "result" | "review" | "finished" | "error";

interface Props {
  loggedIn: boolean;
  /** Le classement du jour, relu par la page serveur à la fin de l'essai. */
  children: ReactNode;
}

/** Calcul du jour : cinq calculs posés et chronométrés par le serveur, un seul essai. */
export function DailyClient({ loggedIn, children }: Props) {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("loading");
  const [run, setRun] = useState<DailyRunView | null>(null);
  const [count, setCount] = useState(3);
  const [value, setValue] = useState("");
  const [deadline, setDeadline] = useState<number | null>(null);
  const tips = useShowTips();
  const touch = useTouch();
  useGameOnScreen(phase === "countdown" || phase === "waiting" || phase === "question" || phase === "result" || phase === "review");
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const later = (fn: () => void, ms: number) => {
    timers.current.push(setTimeout(fn, ms));
  };
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  /** Affiche un essai relu du serveur : à son calcul en cours s'il y en a un, sinon à l'accueil de la page. */
  function show(r: DailyRunView | null) {
    setRun(r);
    if (r?.finished) setPhase("finished");
    else if (r?.question) openQuestion(r);
    else setPhase("intro");
  }

  function openQuestion(r: DailyRunView) {
    setRun(r);
    setValue("");
    setDeadline(Date.now() + (r.question?.remainingMs ?? 0));
    setPhase("question");
  }

  useEffect(() => {
    // Le serveur rattache ici l'essai d'un invité qui vient de se connecter : le classement est à relire.
    callDaily({ action: "state" })
      .then((r) => {
        show(r);
        if (r?.saved) router.refresh();
      })
      .catch(() => setPhase("error"));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function start() {
    try {
      setRun(await callDaily({ action: "start" }));
      setPhase("countdown");
      countdown(3);
    } catch {
      setPhase("error");
    }
  }

  function countdown(n: number) {
    if (n === 0) {
      sfx.go();
      void next();
      return;
    }
    setCount(n);
    sfx.tick();
    later(() => countdown(n - 1), 800);
  }

  async function next() {
    setPhase("waiting");
    try {
      const r = await callDaily({ action: "next" });
      if (r?.question) openQuestion(r);
      else if (r) finish(r);
      else setPhase("error");
    } catch {
      setPhase("error");
    }
  }

  function finish(r: DailyRunView) {
    setRun(r);
    setPhase("finished");
    if (r.correct === DAILY_ROUNDS) void celebrate();
    router.refresh();
  }

  /** `given` null : le temps s'est écoulé. */
  async function send(given: number | null) {
    if (phase !== "question") return;
    setPhase("waiting");
    setDeadline(null);
    try {
      const r = await callDaily({ action: "answer", value: given });
      if (!r) return setPhase("error");
      setRun(r);
      const last = r.answers[r.answers.length - 1];
      if (last?.correct) {
        sfx.ok();
        setPhase("result");
        later(() => advance(r), 700);
      } else {
        sfx.ko();
        setPhase("review");
      }
    } catch {
      setPhase("error");
    }
  }

  function advance(r: DailyRunView) {
    if (r.finished) finish(r);
    else void next();
  }

  // Entrée passe à la suite pendant la correction, comme en solo.
  useEffect(() => {
    if (phase !== "review" || !run) return;
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key !== "Enter" || ev.repeat || ev.defaultPrevented) return;
      if (ev.target instanceof HTMLElement && ev.target.closest("button, a, summary")) return;
      ev.preventDefault();
      advance(run);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, run]); // eslint-disable-line react-hooks/exhaustive-deps

  if (phase === "loading") return <p className="muted">{t("daily.loading")}</p>;

  if (phase === "error") {
    return (
      <section className="daily-intro">
        <h2>{t("daily.title")}</h2>
        <p className="form-error">{t("daily.error")}</p>
        <div className="actions">
          <button className="btn" type="button" onClick={() => window.location.reload()}>
            {t("daily.retry")}
          </button>
        </div>
      </section>
    );
  }

  if (phase === "intro") {
    const played = run?.index ?? 0;
    return (
      <section className="report">
        <Margin>
          <MarginNote value={t("daily.margin")} />
        </Margin>
        <div className="daily-intro">
          <div className="setup-head">
            <h2>{t("daily.title")}</h2>
            <p className="muted">{t("daily.lede", { rounds: DAILY_ROUNDS })}</p>
          </div>
          <div className="actions">
            <button className="btn" type="button" onClick={start}>
              {played > 0 ? t("daily.resume", { round: played + 1, total: DAILY_ROUNDS }) : t("daily.start")}
            </button>
            <Link className="btn ghost" href="/">
              {t("common.back")}
            </Link>
          </div>
          {!loggedIn ? <p className="note">{t("daily.guestNote")}</p> : null}
        </div>
        {children}
      </section>
    );
  }

  if (phase === "finished" && run) return <DailyResult run={run} board={children} />;

  const last: DailyAnswerView | undefined = run?.answers[run.answers.length - 1];
  const reviewing = phase === "result" || phase === "review";
  const closed = reviewing ? last : undefined;
  // En attendant le calcul suivant, on garde celui qu'on vient de jouer plutôt qu'une ligne vide.
  const text = phase === "question" || phase === "waiting" ? (run?.question?.text ?? "") : (closed?.text ?? "");
  const difficulty = run?.question?.difficulty ?? closed?.difficulty;
  const hint = phase === "review" && closed && tips.show ? detectTechnique(closed.text) : null;
  const round = closed ? closed.index + 1 : Math.min((run?.index ?? 0) + 1, DAILY_ROUNDS);

  return (
    <section className="game">
      <Margin>
        <MarginNote value={`${round}/${DAILY_ROUNDS}`} label={t("game.round")} />
        <MarginNote value={<span className="grade">{run?.correct ?? 0}</span>} label={t("game.correct")} />
      </Margin>
      <TimerBar deadline={phase === "question" ? deadline : null} totalMs={run?.question?.timeLimitMs ?? 1} onExpire={() => void send(null)} />
      <p className="status">{difficulty ? <span className="daily-level">{t(`levels.${difficulty}`)}</span> : t("daily.rule")}</p>
      {phase === "countdown" ? (
        <div className="game-row">
          <span className="count" key={count}>
            {count}
          </span>
        </div>
      ) : text ? (
        <CalcLine
          text={text}
          puzzle={{ game: "standard" }}
          value={value}
          onChange={setValue}
          onSubmit={() => {
            if (value !== "") void send(Number(value));
          }}
          disabled={phase !== "question"}
          status={closed ? (closed.correct ? "right" : "wrong") : null}
          shake={closed ? !closed.correct : false}
        />
      ) : null}
      <p className="result-line" aria-live="polite">
        {closed ? (
          closed.correct ? (
            <span className="ok">
              <Check /> {formatSeconds(closed.timeMs, locale)}
            </span>
          ) : (
            <span className="ko">
              {closed.value === null ? t("game.timeUp") : t("game.no")} : {closed.solution}
            </span>
          )
        ) : null}
      </p>
      {phase === "review" && closed && run ? (
        <RoundCorrection
          given={closed.value?.toString() ?? ""}
          text={closed.text}
          separator={revealSeparator("standard")}
          solution={closed.solution}
          hint={hint}
          nextLabel={run.finished ? t("solo.seeReport") : t("solo.next")}
          onNext={() => advance(run)}
          touch={touch}
        />
      ) : null}
    </section>
  );
}

/** Fin de l'essai : score, place, invitation à enregistrer son score pour un invité, détail des calculs. */
function DailyResult({ run, board }: { run: DailyRunView; board: ReactNode }) {
  const t = useTranslations();
  const locale = useLocale();
  return (
    <section className="report">
      <Margin>
        <MarginNote value={t("daily.margin")} />
      </Margin>
      <div className="setup-head">
        <h2>{t("daily.resultTitle")}</h2>
      </div>
      <div className="daily-score">
        <span className="grade" data-testid="daily-score">
          {run.correct}/{DAILY_ROUNDS}
        </span>
        <div>
          <p>{t("daily.totalTime", { time: formatSeconds(run.totalTimeMs, locale) })}</p>
          {run.saved ? (
            <p data-testid="daily-rank">{t("daily.rankOf", { rank: run.rank ?? 1, total: run.players })}</p>
          ) : (
            <p data-testid="daily-rank">{t("daily.wouldRank", { rank: run.rank ?? 1 })}</p>
          )}
        </div>
      </div>
      {run.saved ? (
        <p className="form-ok">{t("daily.saved")}</p>
      ) : (
        <div className="daily-save">
          <p>
            <strong>{t("daily.saveTitle")}</strong>
          </p>
          <p>{t("daily.saveText")}</p>
          <div className="actions">
            <Link className="btn" href={{ pathname: "/signup", query: { next: "/daily" } }}>
              {t("daily.signup")}
            </Link>
            <Link className="btn ghost" href={{ pathname: "/login", query: { next: "/daily" } }}>
              {t("daily.login")}
            </Link>
          </div>
        </div>
      )}
      <div className="scroll-x">
        <table className="games" aria-label={t("daily.detail")}>
          <thead>
            <tr>
              <th>{t("settings.difficulty")}</th>
              <th>{t("daily.calculation")}</th>
              <th>{t("daily.yourAnswer")}</th>
              <th>{t("daily.time")}</th>
            </tr>
          </thead>
          <tbody>
            {run.answers.map((a) => (
              <tr key={a.index}>
                <td>{t(`levels.${a.difficulty}`)}</td>
                <td>
                  <MathText text={a.text} /> = <strong>{a.solution}</strong>
                </td>
                <td className={a.correct ? "ok" : "ko"}>{a.value ?? "–"}</td>
                <td>{formatSeconds(a.timeMs, locale)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {board}
      <p>
        <Link href="/">{t("report.menu")}</Link>
      </p>
    </section>
  );
}
