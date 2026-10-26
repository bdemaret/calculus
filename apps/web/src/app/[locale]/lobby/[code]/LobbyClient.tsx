"use client";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { Room } from "colyseus.js";
import { GAMES, MAX_PLAYERS, type GameSettings, type RoomSnapshot } from "@calculus/game-core";
import { Link, useRouter } from "@/i18n/navigation";
import { CalcLine } from "@/components/CalcLine";
import { Check } from "@/components/Check";
import { ExpressionBuilder } from "@/components/ExpressionBuilder";
import { GameReportView } from "@/components/GameReportView";
import { InviteFriends } from "@/components/InviteFriends";
import { Margin, MarginNote } from "@/components/Margin";
import { Avatar, PlayerChips, type ChipPlayer } from "@/components/PlayerChips";
import { SettingsForm } from "@/components/SettingsForm";
import { TimerBar } from "@/components/TimerBar";
import { JoinError, joinLobby, leaveLobby, readRoom, subscribeRoom, type LobbyState } from "@/lib/colyseus";
import { answerFromInput, answerKindOfPuzzle, revealSeparator, shownAnswer } from "@/lib/answer";
import { formatSeconds } from "@/lib/format";
import { cleanName } from "@/lib/names";
import { celebrate, sfx } from "@/lib/sound";
import { local } from "@/lib/storage";

interface Props {
  code: string;
  accountName: string | null;
}

/** Page du lobby : salle d'attente, partie en direct et rapport, sans jamais couper la connexion. */
export function LobbyClient({ code, accountName }: Props) {
  const t = useTranslations();
  const router = useRouter();
  const [room, setRoom] = useState<Room | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [needName, setNeedName] = useState(false);
  const [name, setName] = useState("");

  const connect = useCallback(
    (pseudo: string) => {
      setError(null);
      joinLobby(code, pseudo)
        .then(setRoom)
        .catch((err) => setError(err instanceof JoinError ? err.code : "generic"));
    },
    [code],
  );

  useEffect(() => {
    const saved = local.get("name", "");
    setName(saved);
    if (!accountName && !cleanName(saved)) setNeedName(true);
    else connect(cleanName(saved));
  }, [accountName, connect]);

  if (needName && !room) {
    return (
      <section className="auth">
        <h2>{t("lobby.joinTitle", { code })}</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const n = cleanName(name);
            if (!n) return;
            local.set("name", n);
            setNeedName(false);
            connect(n);
          }}
        >
          <label>
            {t("online.pseudo")}
            <input className="text-input" maxLength={20} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </label>
          <button className="btn" type="submit">
            {t("online.join")}
          </button>
          <p className="muted">
            <Link href="/login">{t("lobby.loginInstead")}</Link>
          </p>
        </form>
      </section>
    );
  }

  if (error) {
    return (
      <section className="empty-state">
        <h2>{t("lobby.cannotJoin", { code })}</h2>
        <p className="muted">{t(`errors.${error}`)}</p>
        <div className="actions">
          <button className="btn" type="button" onClick={() => connect(cleanName(name))}>
            {t("common.retry")}
          </button>
          <Link className="btn ghost" href="/online">
            {t("lobby.backToOnline")}
          </Link>
        </div>
      </section>
    );
  }

  if (!room) return <p className="status">{t("lobby.connecting")}</p>;
  return (
    <ConnectedLobby
      room={room}
      signedIn={!!accountName}
      onLeave={() => {
        leaveLobby();
        router.push("/online");
      }}
    />
  );
}

function useRoomState(room: Room): LobbyState | null {
  return useSyncExternalStore(
    (cb) => subscribeRoom(room, cb),
    () => readRoom(room),
    () => null,
  );
}

function ConnectedLobby({ room, signedIn, onLeave }: { room: Room; signedIn: boolean; onLeave: () => void }) {
  const t = useTranslations();
  const state = useRoomState(room);
  const snap = state?.snapshot ?? null;
  const me = state?.playerId ?? null;

  if (state?.left) {
    return (
      <section className="empty-state">
        <h2>{t("lobby.disconnectedTitle")}</h2>
        <p className="muted">{t("lobby.disconnectedText")}</p>
        <Link className="btn" href="/online">
          {t("lobby.backToOnline")}
        </Link>
      </section>
    );
  }
  if (!snap || !state) return <p className="status">{t("lobby.connecting")}</p>;

  const isHost = snap.hostId === me;
  if (snap.phase === "lobby") return <WaitingRoom room={room} snap={snap} me={me} isHost={isHost} signedIn={signedIn} onLeave={onLeave} />;
  if (snap.phase === "finished") return <Finished room={room} snap={snap} me={me} isHost={isHost} onLeave={onLeave} />;
  return <Playing room={room} state={state} snap={snap} me={me} onLeave={onLeave} />;
}

/* ------------------------------------------------------------------ */
/* Salle d'attente                                                       */
/* ------------------------------------------------------------------ */

function WaitingRoom({
  room,
  snap,
  me,
  isHost,
  signedIn,
  onLeave,
}: {
  room: Room;
  snap: RoomSnapshot;
  me: string | null;
  isHost: boolean;
  signedIn: boolean;
  onLeave: () => void;
}) {
  const t = useTranslations();
  const [copied, setCopied] = useState<"code" | "link" | null>(null);
  const mine = snap.players.find((p) => p.id === me);

  const copy = async (what: "code" | "link") => {
    const text = what === "code" ? snap.code : window.location.href;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      setTimeout(() => setCopied(null), 1600);
    } catch {
      window.prompt?.(text);
    }
  };

  const updateSettings = (s: GameSettings) => {
    local.set("online", s);
    room.send("settings", s);
  };

  const others = snap.players.filter((p) => !p.isHost);
  const allReady = others.length > 0 && others.every((p) => p.ready);
  // Certains jeux demandent plusieurs joueurs : le serveur refuse aussi de lancer en dessous.
  const minPlayers = GAMES[snap.settings.game].minPlayers;
  const enoughPlayers = snap.players.filter((p) => p.connected).length >= minPlayers;

  return (
    <section className="lobby">
      <Margin>
        <MarginNote value={t("lobby.margin")} />
      </Margin>
      <div className="stack">
        <div>
          <p className="muted">{t("lobby.code")}</p>
          <div className="actions">
            <div className="code-boxes" aria-label={t("lobby.codeAria", { code: snap.code })}>
              {[...snap.code].map((c, i) => (
                <span key={i}>{c}</span>
              ))}
            </div>
            <button className="btn ghost" type="button" onClick={() => copy("code")}>
              {copied === "code" ? t("lobby.copied") : t("lobby.copy")}
            </button>
            <button className="link-btn" type="button" onClick={() => copy("link")}>
              {copied === "link" ? t("lobby.linkCopied") : t("lobby.copyLink")}
            </button>
          </div>
        </div>

        <div className="stack" style={{ gap: 10 }}>
          <h3>{t("lobby.players", { count: snap.players.length, max: MAX_PLAYERS })}</h3>
          <div className="slots" data-testid="lobby-slots">
            {Array.from({ length: MAX_PLAYERS }, (_, i) => {
              const p = snap.players[i];
              if (!p) return <div className="slot empty" key={`e${i}`}>{t("lobby.free")}</div>;
              return (
                <div className="slot filled" key={p.id} style={p.connected ? undefined : { opacity: 0.5 }}>
                  <Avatar name={p.name} />
                  <span className="nm">{p.name}</span>
                  {p.isHost ? (
                    <span className="host">{t("lobby.host")}</span>
                  ) : p.ready ? (
                    <span className="host" style={{ color: "var(--ok)" }}>
                      {t("lobby.ready")}
                    </span>
                  ) : isHost ? (
                    <button className="link-btn" type="button" style={{ marginLeft: "auto", fontSize: 13 }} onClick={() => room.send("kick", { playerId: p.id })}>
                      {t("lobby.kick")}
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>

        <div className="actions">
          {isHost ? (
            <button className="btn" type="button" disabled={!enoughPlayers} onClick={() => room.send("start", {})}>
              {t("lobby.start")}
            </button>
          ) : (
            <button className="btn" type="button" onClick={() => room.send("ready", { ready: !mine?.ready })}>
              {mine?.ready ? t("lobby.notReady") : t("lobby.imReady")}
            </button>
          )}
          <button className="btn ghost" type="button" onClick={onLeave}>
            {t("lobby.leave")}
          </button>
        </div>
        <p className="note">
          {!enoughPlayers
            ? t("lobby.notEnoughPlayers", { count: minPlayers })
            : isHost
              ? allReady
                ? t("lobby.everyoneReady")
                : t("lobby.hostHint")
              : t("lobby.waitingHost")}
        </p>
        {signedIn && snap.players.length < MAX_PLAYERS ? <InviteFriends code={snap.code} presentIds={snap.players.map((p) => p.id)} /> : null}
      </div>

      <div className="stack">
        <h3>{t("lobby.rules")}</h3>
        <SettingsForm id="lobby-settings" settings={snap.settings} onChange={updateSettings} online readOnly={!isHost} />
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Partie en direct                                                      */
/* ------------------------------------------------------------------ */

function Playing({ room, state, snap, me, onLeave }: { room: Room; state: LobbyState; snap: RoomSnapshot; me: string | null; onLeave: () => void }) {
  const t = useTranslations();
  const locale = useLocale();
  const [value, setValue] = useState("");
  const [sentFor, setSentFor] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const lastPhase = useRef<string>("");
  const lastAckIndex = useRef<number | null>(null);

  const meP = snap.players.find((p) => p.id === me);
  const question = snap.question;
  const localDeadline = snap.deadline !== null ? snap.deadline - state.clockOffset : null;
  const turns = snap.settings.turnStyle === "turns";
  const myTurn = !turns || snap.activePlayerId === me;
  const eliminates = snap.settings.mode === "battle-royale";
  const canAnswer = snap.phase === "question" && !!question && !!meP && (!eliminates || meP.alive) && myTurn && !meP.answeredThisRound && sentFor !== question.index;

  // Nouveau calcul : on efface la réponse.
  useEffect(() => {
    setValue("");
  }, [question?.index]);

  // Compte à rebours affiché.
  useEffect(() => {
    if (snap.phase !== "countdown") return;
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, [snap.phase]);

  // Sons selon ce qui arrive.
  useEffect(() => {
    const ack = state.lastAck;
    if (ack && ack.questionIndex !== lastAckIndex.current) {
      lastAckIndex.current = ack.questionIndex;
      if (ack.correct) sfx.ok();
      else sfx.ko();
    }
  }, [state.lastAck]);
  useEffect(() => {
    const key = `${snap.phase}:${snap.roundIndex}`;
    if (key === lastPhase.current) return;
    lastPhase.current = key;
    if (snap.phase === "countdown") sfx.tick();
    if (snap.phase === "question" && snap.roundIndex === 0) sfx.go();
    if (snap.phase === "round-result" && me && snap.lastRound?.eliminated.includes(me)) sfx.out();
  }, [snap.phase, snap.roundIndex, snap.lastRound, me]);

  const submit = () => {
    if (!canAnswer || !question) return;
    const answer = answerFromInput(value, answerKindOfPuzzle(question.puzzle));
    if (!answer) return;
    setSentFor(question.index);
    room.send("answer", { ...answer, questionIndex: question.index });
  };

  const onType = (v: string) => {
    setValue(v);
    if (turns && myTurn) room.send("typing", { value: v });
  };

  const ack = state.lastAck && question && state.lastAck.questionIndex === question.index ? state.lastAck : null;
  const last = snap.phase === "round-result" ? snap.lastRound : null;
  const myLast = last?.answers.find((a) => a.playerId === me);
  const nameOf = (id: string) => snap.players.find((p) => p.id === id)?.name ?? "?";
  const active = snap.players.find((p) => p.id === snap.activePlayerId);

  // Ce qu'on voit dans la case réponse : sa propre saisie, ou celle du joueur dont c'est le tour.
  const watching = turns && !myTurn && snap.phase === "question";
  const shownValue = watching ? (state.typing?.playerId === snap.activePlayerId ? state.typing.value : "") : value;
  const lastActive = last && turns ? last.answers[0] : undefined;

  let status = "";
  if (snap.phase === "countdown") status = `${t(`modes.${snap.settings.mode}.name`)} · ${t("game.level", { n: snap.settings.difficulty })}`;
  else if (turns && active) status = active.id === me ? t("game.yourTurn") : t("game.turnOf", { name: active.name });
  else if (eliminates && meP && !meP.alive) status = t("game.spectator");

  const chips: ChipPlayer[] = snap.players.map((p) => {
    const a = last?.answers.find((x) => x.playerId === p.id);
    let st: ChipPlayer["state"] = null;
    if (a) st = a.correct ? "right" : "wrong";
    else if (p.answeredThisRound) st = p.id === me && ack ? (ack.correct ? "right" : "wrong") : "answered";
    return { id: p.id, name: p.name, score: p.score, alive: p.alive, connected: p.connected, state: st, active: p.id === snap.activePlayerId };
  });

  const displayedText = question?.text ?? last?.text ?? "";
  const displayedPuzzle = question?.puzzle ?? last?.puzzle;
  // Mêmes réglages de saisie pour la ligne de calcul et pour le bon compte.
  const lineProps = {
    value: last && lastActive && turns && lastActive.playerId !== me ? shownAnswer(lastActive) : shownValue,
    onChange: onType,
    onSubmit: submit,
    disabled: !canAnswer,
    status: (ack ? (ack.correct ? "right" : "wrong") : myLast ? (myLast.correct ? "right" : "wrong") : lastActive ? (lastActive.correct ? "right" : "wrong") : null) as
      | "right"
      | "wrong"
      | null,
    shake: !!ack && !ack.correct,
  };
  const countLeft = localDeadline ? Math.max(1, Math.ceil((localDeadline - now) / 1000)) : 3;

  return (
    <section className="game">
      <Margin>
        <MarginNote value={`${snap.roundIndex + 1}${snap.totalRounds ? `/${snap.totalRounds}` : ""}`} label={t("game.round")} />
        <MarginNote value={<span className="grade">{meP?.score ?? 0}</span>} label={snap.settings.mode === "speed-race" ? t("game.points") : t("game.correct")} />
      </Margin>
      <TimerBar
        deadline={snap.phase === "question" ? localDeadline : null}
        totalMs={snap.timeLimitMs ?? 1}
      />
      <p className="status">{status}</p>
      {snap.phase === "countdown" ? (
        <div className="game-row">
          <span className="count" key={countLeft}>
            {countLeft}
          </span>
        </div>
      ) : displayedText && displayedPuzzle?.game === "right-count" ? (
        <ExpressionBuilder text={displayedText} puzzle={displayedPuzzle} {...lineProps} />
      ) : displayedText ? (
        <CalcLine text={displayedText} puzzle={displayedPuzzle} {...lineProps} />
      ) : null}
      <p className="result-line" aria-live="polite">
        {ack && snap.phase === "question" ? (
          ack.correct ? (
            <span className="ok">
              <Check /> {formatSeconds(ack.timeMs, locale)}
            </span>
          ) : (
            <span className="ko">{t("game.no")}</span>
          )
        ) : null}
        {last ? (
          <>
            {myLast?.correct ? (
              <span className="ok">
                <Check /> {formatSeconds(myLast.timeMs, locale)}
              </span>
            ) : myLast ? (
              <span className="ko">
                {myLast.value == null && myLast.text == null ? t("game.timeUp") : t("game.no")} : {last.solution}
              </span>
            ) : (
              <span>
                {revealSeparator(snap.settings.game)} {last.solution}
              </span>
            )}
            {last.scorers.length && me && !last.scorers.includes(me) ? (
              <span className="muted"> · {t("game.pointFor", { names: last.scorers.map(nameOf).join(", ") })}</span>
            ) : null}
            {last.spared ? <span className="muted"> · {t("game.spared")}</span> : null}
            {last.eliminated.length ? <span className="ko"> · {t("game.out", { names: last.eliminated.map(nameOf).join(", ") })}</span> : null}
          </>
        ) : null}
      </p>
      <PlayerChips players={chips} meId={me} />
      <div className="actions">
        <button className="link-btn" type="button" onClick={onLeave}>
          {t("game.quit")}
        </button>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Fin de partie                                                         */
/* ------------------------------------------------------------------ */

function Finished({ room, snap, me, isHost, onLeave }: { room: Room; snap: RoomSnapshot; me: string | null; isHost: boolean; onLeave: () => void }) {
  const t = useTranslations();
  const celebrated = useRef<number | null>(null);
  const report = snap.report;

  useEffect(() => {
    if (!report || celebrated.current === snap.gameNumber) return;
    celebrated.current = snap.gameNumber;
    const mine = report.players.find((p) => p.playerId === me);
    if (mine?.rank === 1) {
      sfx.win();
      void celebrate();
    }
  }, [report, me, snap.gameNumber]);

  if (!report) return null;
  return (
    <>
      <Margin>
        <MarginNote value={t("game.end")} />
      </Margin>
      <GameReportView
        report={report}
        meId={me}
        online
        game={snap.settings.game}
        mode={snap.settings.mode}
        timePerQuestion={snap.settings.timePerQuestion}
        ratings={snap.ratings}
        actions={
          <>
            <div className="actions">
              {isHost ? (
                <>
                  <button className="btn" type="button" onClick={() => room.send("replay-same", {})}>
                    {t("report.again")}
                  </button>
                  <button className="btn ghost" type="button" onClick={() => room.send("replay-new", {})}>
                    {t("report.change")}
                  </button>
                </>
              ) : null}
              <button className="link-btn" type="button" onClick={onLeave}>
                {t("lobby.leave")}
              </button>
            </div>
            <p className="note">{isHost ? t("report.keepPlayers") : t("report.waitHost")}</p>
          </>
        }
      />
    </>
  );
}
