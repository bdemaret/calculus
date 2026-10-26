"use client";
import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  GAMES,
  GAME_IDS,
  GameEngine,
  answerOfRecord,
  buildReport,
  defaultSettings,
  randomSeed,
  sanitizeSettings,
  type GameReport,
  type GameSettings,
  type PlayerAnswer,
  type RoundRecord,
} from "@calculus/game-core";
import { Link } from "@/i18n/navigation";
import { CalcLine } from "@/components/CalcLine";
import { Check } from "@/components/Check";
import { ExpressionBuilder } from "@/components/ExpressionBuilder";
import { GameReportView } from "@/components/GameReportView";
import { Margin, MarginNote } from "@/components/Margin";
import { SettingsForm } from "@/components/SettingsForm";
import { TimerBar } from "@/components/TimerBar";
import { answerFromInput } from "@/lib/answer";
import { formatSeconds } from "@/lib/format";
import { celebrate, sfx } from "@/lib/sound";
import { local } from "@/lib/storage";

type Phase = "setup" | "countdown" | "question" | "result" | "finished";
const ME = "me";

interface Props {
  loggedIn: boolean;
  playerName: string | null;
}

/** Partie solo : tout se passe dans le navigateur, avec le même moteur que le serveur. */
export function SoloGame({ loggedIn, playerName }: Props) {
  const t = useTranslations();
  const locale = useLocale();
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

  const engine = useRef<GameEngine | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const log = useRef<{ answer: PlayerAnswer | null; timeMs: number }[]>([]);
  const startedAt = useRef(0);

  useEffect(() => {
    const saved = sanitizeSettings(local.get("solo", defaultSettings(2, "speed-race")));
    // Un jeu qui ne se joue qu'en ligne est remplacé par le premier jeu jouable seul.
    setSettings(GAMES[saved.game].solo ? saved : sanitizeSettings({ ...saved, game: GAME_IDS.find((g) => GAMES[g].solo) }));
    return () => timers.current.forEach(clearTimeout);
  }, []);

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
  };

  function start() {
    clearTimers();
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
    setPhase("result");
    force((x) => x + 1);
    later(() => (e.isOver ? finish() : nextRound()), mine?.correct ? 700 : 1500);
  }

  function finish() {
    const e = engine.current;
    if (!e) return;
    const rep = buildReport(e.standings(), e.history);
    setReport(rep);
    setPhase("finished");
    const mine = rep.players[0];
    if (mine && mine.correct > 0 && (settings.mode === "battle-royale" || mine.correct === rep.rounds)) void celebrate();
    if (loggedIn && e.history.length > 0) {
      setSave("saving");
      fetch("/api/solo-results", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ seed: e.seed, settings: e.settings, startedAt: startedAt.current, answers: log.current }),
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
          <p className="muted">{t("solo.intro")}</p>
        </div>
        <SettingsForm id="solo-settings" settings={settings} onChange={changeSettings} online={false} />
        <div className="actions">
          <button className="btn" type="button" onClick={start}>
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
  const totalLabel = settings.mode === "speed-race" && e ? `/${e.totalRounds}` : "";

  return (
    <section className="game">
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
        {phase === "result" && closed ? (
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
      <div className="actions">
        <button
          className="link-btn"
          type="button"
          onClick={() => {
            clearTimers();
            setPhase("setup");
          }}
        >
          {t("game.quit")}
        </button>
      </div>
    </section>
  );
}
