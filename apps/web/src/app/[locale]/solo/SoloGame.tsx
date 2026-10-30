"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocale, useTranslations } from "next-intl";
import {
  GAMES,
  GAME_IDS,
  GameEngine,
  answerOfRecord,
  buildReport,
  defaultSettings,
  detectTechnique,
  randomSeed,
  sanitizeSettings,
  type GameReport,
  type GameId,
  type GameSettings,
  type PlayerAnswer,
  type RoundRecord,
  type SoloAnswer,
} from "@calculus/game-core";
import { Link, useRouter } from "@/i18n/navigation";
import { CalcLine } from "@/components/CalcLine";
import { Check } from "@/components/Check";
import { ExpressionBuilder } from "@/components/ExpressionBuilder";
import { GameReportView } from "@/components/GameReportView";
import { MathText } from "@/components/MathText";
import { Margin, MarginNote } from "@/components/Margin";
import { SettingsForm } from "@/components/SettingsForm";
import { TechniqueSteps } from "@/components/TechniqueSteps";
import { TimerBar } from "@/components/TimerBar";
import { answerFromInput, revealSeparator, shownAnswer } from "@/lib/answer";
import { formatSeconds } from "@/lib/format";
import { celebrate, sfx } from "@/lib/sound";
import { SOLO_ACTIVITY_PING_MS, SoloActivity } from "@/lib/soloActivity";
import { local } from "@/lib/storage";
import { useShowTips } from "@/lib/tips";
import { useGameOnScreen } from "@/lib/useGameOnScreen";
import { useTouch } from "@/lib/useTouch";

/**
 * `result` : bonne réponse, on enchaîne tout seul. `review` : erreur ou temps écoulé, la correction
 * reste affichée jusqu'à ce que le joueur passe à la suite (bouton ou Entrée). Le chrono ne tourne
 * que pendant `question` : la manche suivante ne commence qu'à ce moment-là.
 */
type Phase = "setup" | "countdown" | "question" | "result" | "review" | "finished";
const ME = "me";

interface Props {
  loggedIn: boolean;
  playerName: string | null;
  /** Jeu choisi depuis l'onglet Jeux (`?game=`), déjà validé par la page. */
  preset: GameId | null;
}

/** Partie solo : tout se passe dans le navigateur, avec le même moteur que le serveur. */
export function SoloGame({ loggedIn, playerName, preset }: Props) {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const [settings, setSettings] = useState<GameSettings>(() => defaultSettings(2, "speed-race"));
  const [phase, setPhase] = useState<Phase>("setup");
  const [count, setCount] = useState(3);
  const [round, setRound] = useState<RoundRecord | null>(null);
  const [value, setValue] = useState("");
  const [feedback, setFeedback] = useState<{ correct: boolean; timeMs: number } | null>(null);
  const [closed, setClosed] = useState<RoundRecord | null>(null);
  const [report, setReport] = useState<GameReport | null>(null);
  const [save, setSave] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [, force] = useState(0);
  const tips = useShowTips();
  const touch = useTouch();
  const gameSection = useGameOnScreen(phase === "countdown");

  const engine = useRef<GameEngine | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const log = useRef<SoloAnswer[]>([]);
  const startedAt = useRef(0);
  const startButton = useRef<HTMLButtonElement>(null);
  const [showStart, setShowStart] = useState(false);
  // « Suivant » a-t-il été appuyé lui-même ? Sur téléphone, OK répond dès que le doigt se pose et la
  // correction s'ouvre sous ce doigt : le clic émis quand il se relève tomberait sur « Suivant ».
  const nextPressed = useRef(false);

  const activity = useRef<SoloActivity | null>(null);

  /** Manches jouées et bonnes réponses, pour le suivi d'activité. */
  const progress = () => ({
    rounds: log.current.length,
    correct: engine.current?.history.filter((r) => r.answers.some((a) => a.playerId === ME && a.correct)).length ?? 0,
  });
  const quitActivity = () => activity.current?.close("quit", progress());

  useEffect(() => {
    // Page quittée ou onglet fermé en pleine partie : abandon.
    window.addEventListener("pagehide", quitActivity);
    return () => {
      window.removeEventListener("pagehide", quitActivity);
      quitActivity();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Battement régulier tant que la partie dure (compte à rebours, calculs, résultats de manche).
  const playing = phase !== "setup" && phase !== "finished";
  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => activity.current?.ping(progress()), SOLO_ACTIVITY_PING_MS);
    return () => clearInterval(id);
  }, [playing]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const saved = sanitizeSettings(local.get("solo", defaultSettings(2, "speed-race")));
    if (preset && preset !== saved.game) {
      // Jeu choisi dans l'onglet Jeux : ses derniers réglages, sinon ceux par défaut au dernier niveau joué.
      const last = local.get<unknown>(`solo.${preset}`, null);
      const next = last ? sanitizeSettings({ ...(last as object), game: preset }) : sanitizeSettings({ ...saved, game: preset, ...GAMES[preset].defaults(saved.difficulty) });
      setSettings(next);
      local.set("solo", next);
    } else {
      // Un jeu qui ne se joue qu'en ligne est remplacé par le premier jeu jouable seul.
      setSettings(GAMES[saved.game].solo ? saved : sanitizeSettings({ ...saved, game: GAME_IDS.find((g) => GAMES[g].solo) }));
    }
    // L'adresse redevient /solo : un rechargement garde ensuite les réglages modifiés.
    if (preset) {
      router.replace("/solo", { scroll: false });
      setShowStart(true);
    }
    return () => timers.current.forEach(clearTimeout);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Venu de l'onglet Jeux : « Commencer » est amené à l'écran, la partie est à un toucher.
  useEffect(() => {
    if (!showStart) return;
    setShowStart(false);
    startButton.current?.focus({ preventScroll: true });
    startButton.current?.scrollIntoView({ block: "center" });
  }, [showStart]);

  const later = (fn: () => void, ms: number) => {
    timers.current.push(setTimeout(fn, ms));
  };
  const clearTimers = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };

  const changeSettings = (s: GameSettings) => {
    setSettings(s);
    local.set("solo", s);
    // Retenus aussi par jeu, pour les boutons de l'onglet Jeux.
    local.set(`solo.${s.game}`, s);
  };

  function start() {
    clearTimers();
    quitActivity();
    activity.current = new SoloActivity(settings);
    engine.current = new GameEngine(settings, [{ id: ME, name: playerName ?? t("game.you") }], randomSeed());
    log.current = [];
    startedAt.current = Date.now();
    setReport(null);
    setSave("idle");
    setClosed(null);
    setRound(null);
    setPhase("countdown");
    countdown(3);
  }

  function countdown(n: number) {
    if (n === 0) {
      sfx.go();
      nextRound();
      return;
    }
    setCount(n);
    sfx.tick();
    later(() => countdown(n - 1), 800);
  }

  function nextRound() {
    const e = engine.current;
    if (!e) return;
    const r = e.startRound(Date.now());
    if (!r) {
      finish();
      return;
    }
    setRound({ ...r });
    setValue("");
    setFeedback(null);
    setClosed(null);
    setPhase("question");
  }

  /** `given` : la réponse déjà formée (l'expression complète du bon compte), sinon lue dans la saisie. */
  function submit(given?: PlayerAnswer) {
    const e = engine.current;
    if (!e || !e.currentRound) return;
    const answer = given ?? answerFromInput(value, e.game.answerKind(e.currentRound.question));
    if (!answer) return;
    const res = e.submit(ME, answer, Date.now());
    if (!res.accepted) return;
    setFeedback({ correct: !!res.correct, timeMs: res.timeMs ?? 0 });
    if (res.correct) sfx.ok();
    else sfx.ko();
    endRound();
  }

  function endRound() {
    const e = engine.current;
    if (!e || !e.currentRound) return;
    const rec = e.closeRound();
    if (!rec) return;
    const mine = rec.answers.find((a) => a.playerId === ME);
    log.current.push({ answer: mine ? answerOfRecord(mine, e.game.answerKind(rec.question)) : null, timeMs: mine?.timeMs ?? rec.timeLimitMs });
    if (!mine || mine.value === null) sfx.ko();
    setClosed(rec);
    force((x) => x + 1);
    if (!mine?.correct) {
      setPhase("review");
      return;
    }
    setPhase("result");
    later(advance, 700);
  }

  function advance() {
    const e = engine.current;
    if (!e) return;
    if (e.isOver) finish();
    else nextRound();
  }

  // Entrée passe à la suite pendant la correction. Sur le bouton, Entrée le clique déjà ;
  // une touche maintenue depuis la réponse ne doit pas sauter la correction.
  useEffect(() => {
    if (phase !== "review") return;
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key !== "Enter" || ev.repeat || ev.defaultPrevented) return;
      if (ev.target instanceof HTMLElement && ev.target.closest("button, a, summary")) return;
      ev.preventDefault();
      advance();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase]);

  function finish() {
    const e = engine.current;
    if (!e) return;
    const rep = buildReport(e.standings(), e.history);
    setReport(rep);
    setPhase("finished");
    activity.current?.close("end", progress());
    const mine = rep.players[0];
    if (mine && mine.correct > 0 && (settings.mode === "battle-royale" || mine.correct === rep.rounds)) void celebrate();
    if (loggedIn && e.history.length > 0) {
      setSave("saving");
      fetch("/api/solo-results", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          seed: e.seed,
          settings: e.settings,
          startedAt: startedAt.current,
          answers: log.current,
          activityId: activity.current?.id ?? undefined,
        }),
      })
        .then((r) => setSave(r.ok ? "saved" : "error"))
        .catch(() => setSave("error"));
    }
  }

  const e = engine.current;
  const me = e?.player(ME);

  if (phase === "setup") {
    return (
      <section className="setup">
        <Margin>
          <MarginNote value={t("solo.marginSolo")} />
        </Margin>
        <div className="setup-head">
          <h2>{t("solo.title")}</h2>
        </div>
        <SettingsForm id="solo-settings" settings={settings} onChange={changeSettings} online={false} />
        <div className="actions">
          <button ref={startButton} className="btn" type="button" onClick={start}>
            {t("solo.start")}
          </button>
          <Link className="btn ghost" href="/">
            {t("common.back")}
          </Link>
        </div>
        {!loggedIn ? (
          <p className="note">
            <Link href="/login">{t("solo.loginToSave")}</Link>
          </p>
        ) : null}
      </section>
    );
  }

  if (phase === "finished" && report && e) {
    return (
      <>
        <Margin>
          <MarginNote value={t("game.end")} />
        </Margin>
        <GameReportView
          report={report}
          meId={ME}
          online={false}
          game={e.settings.game}
          mode={e.settings.mode}
          timePerQuestion={e.settings.timePerQuestion}
          actions={
            <>
              <div className="actions">
                <button className="btn" type="button" onClick={start}>
                  {t("report.again")}
                </button>
                <button className="btn ghost" type="button" onClick={() => setPhase("setup")}>
                  {t("report.changeSolo")}
                </button>
                <Link className="link-btn" href="/">
                  {t("report.menu")}
                </Link>
              </div>
              {save === "saved" ? <p className="form-ok">{t("solo.saved")}</p> : null}
              {save === "error" ? <p className="form-error">{t("solo.saveError")}</p> : null}
            </>
          }
        />
      </>
    );
  }

  const shown = round ?? closed;
  const myClosed = closed?.answers.find((a) => a.playerId === ME);
  // Correction d'une erreur : la réponse donnée, et la technique au calcul mental (si les conseils sont affichés).
  const given = phase === "review" && myClosed ? shownAnswer(myClosed) : "";
  const hint = phase === "review" && closed && tips.show && closed.question.puzzle.game === "standard" ? detectTechnique(closed.question.text) : null;
  // Sur téléphone, le pavé est ancré en bas de l'écran (PadDock) : la correction et « Suivant » se posent
  // par-dessus, dans body comme lui, au lieu de passer dessous. Le pavé ne sert à rien pendant la correction.
  const review =
    phase === "review" && closed ? (
      <div className={`solo-review${touch ? " docked" : ""}`}>
        {given ? (
          <p>
            {t("solo.yourAnswer")} <s className="ko">{given}</s>
          </p>
        ) : null}
        <p>
          {t("solo.correction")}{" "}
          <span className="solo-review-calc">
            <MathText text={closed.question.text} /> <span className="eq">{revealSeparator(closed.question.puzzle.game)}</span>{" "}
            <b>{closed.question.solution}</b>
          </span>
        </p>
        {hint ? (
          <div className="practice-explain">
            <h3>{t(`techniques.${hint.technique}.name`)}</h3>
            <TechniqueSteps hint={hint} />
          </div>
        ) : null}
        <div className="actions">
          <button
            className="btn"
            type="button"
            autoFocus
            onPointerDown={() => (nextPressed.current = true)}
            onClick={(ev) => {
              const pressed = nextPressed.current;
              nextPressed.current = false;
              // detail vaut 0 pour un clic au clavier (Entrée, Espace) : il n'a pas d'appui à vérifier.
              if (ev.detail !== 0 && !pressed) return;
              advance();
            }}
          >
            {e?.isOver ? t("solo.seeReport") : t("solo.next")}
          </button>
        </div>
      </div>
    ) : null;
  const totalLabel = settings.mode === "speed-race" && e ? `/${e.totalRounds}` : "";

  return (
    <section ref={gameSection} className="game">
      <Margin>
        <MarginNote value={`${(shown?.index ?? 0) + 1}${totalLabel}`} label={t("game.round")} />
        <MarginNote value={<span className="grade">{me?.score ?? 0}</span>} label={settings.mode === "speed-race" ? t("game.points") : t("game.correct")} />
      </Margin>
      <TimerBar
        deadline={phase === "question" && round ? round.startedAt + round.timeLimitMs : null}
        totalMs={round?.timeLimitMs ?? 1}
        onExpire={endRound}
      />
      <p className="status">{phase === "countdown" ? t(`modes.${settings.mode}.solo`) : ""}</p>
      {phase === "countdown" ? (
        <div className="game-row">
          <span className="count" key={count}>
            {count}
          </span>
        </div>
      ) : shown && shown.question.puzzle.game === "right-count" ? (
        <ExpressionBuilder
          text={shown.question.text}
          puzzle={shown.question.puzzle}
          value={value}
          onChange={setValue}
          onSubmit={(expr) => submit({ expr })}
          disabled={phase !== "question"}
          status={feedback ? (feedback.correct ? "right" : "wrong") : null}
          shake={feedback ? !feedback.correct : false}
        />
      ) : shown ? (
        <CalcLine
          text={shown.question.text}
          puzzle={shown.question.puzzle}
          value={value}
          onChange={setValue}
          onSubmit={() => submit()}
          disabled={phase !== "question"}
          status={feedback ? (feedback.correct ? "right" : "wrong") : null}
          shake={feedback ? !feedback.correct : false}
        />
      ) : null}
      <p className="result-line" aria-live="polite">
        {(phase === "result" || phase === "review") && closed ? (
          myClosed?.correct ? (
            <span className="ok">
              <Check /> {formatSeconds(myClosed.timeMs, locale)}
            </span>
          ) : (
            <span className="ko">
              {myClosed?.value == null && myClosed?.text == null ? t("game.timeUp") : t("game.no")} : {closed.question.solution}
            </span>
          )
        ) : null}
      </p>
      {review ? (touch ? createPortal(review, document.body) : review) : null}
      <div className="actions">
        <button
          className="link-btn"
          type="button"
          onClick={() => {
            clearTimers();
            quitActivity();
            setPhase("setup");
          }}
        >
          {t("game.quit")}
        </button>
      </div>
    </section>
  );
}
