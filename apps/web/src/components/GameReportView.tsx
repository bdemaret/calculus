"use client";
import { useState, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { PLACEMENT_GAMES, type GameModeId, type GameReport, type PlayerReport, type RatingChange, type RoundReview } from "@calculus/game-core";
import { formatPercent, formatSeconds, formatSigned } from "@/lib/format";

interface Props {
  report: GameReport;
  meId: string | null;
  online: boolean;
  mode: GameModeId;
  timePerQuestion: number;
  /** Effet sur l'Elo par id de joueur (parties en ligne classées uniquement). */
  ratings?: Record<string, RatingChange> | null;
  actions?: ReactNode;
}

/** Rapport de fin de partie : verdict, classement, statistiques, graphique de progression. */
export function GameReportView({ report: raw, meId, online, mode, timePerQuestion, ratings, actions }: Props) {
  const t = useTranslations("report");
  // Pseudo vide : le compte de ce joueur a été supprimé depuis la partie.
  const report: GameReport = { ...raw, players: raw.players.map((pl) => (pl.name ? pl : { ...pl, name: t("deletedPlayer") })) };
  const tOps = useTranslations("ops");
  const locale = useLocale();
  const s = (ms: number) => formatSeconds(ms, locale);
  const p = (x: number) => formatPercent(x, locale);
  const mine: PlayerReport | undefined = report.players.find((x) => x.playerId === meId) ?? (online ? undefined : report.players[0]);
  const winner = report.players[0];
  const unit = mode === "speed-race" ? t("pts") : t("correctUnit");
  const myRating = mine ? ratings?.[mine.playerId] : undefined;

  let big: string;
  let sub: string;
  if (online) {
    if (mine?.rank === 1) {
      big = t("first");
      sub = mode === "battle-royale" ? t("lastAlive") : t("fastest");
    } else if (mine) {
      big = t("rank", { rank: mine.rank });
      sub = t("ofPlayers", { count: report.players.length, name: winner?.name ?? "" });
    } else {
      big = winner?.name ?? "";
      sub = t("winner");
    }
  } else if (mode === "battle-royale") {
    big = String(mine?.score ?? 0);
    sub = t("survived", { count: mine?.score ?? 0 });
  } else {
    big = `${mine?.score ?? 0}/${report.rounds}`;
    sub = mine && mine.score === report.rounds ? t("perfect") : t("goodAnswers");
  }

  return (
    <section className="report">
      <div className="verdict">
        <span className="big" data-testid="report-verdict">
          {big}
        </span>
        <p className="lede" style={{ margin: 0 }}>
          {sub}
        </p>
        {myRating ? (
          <p className="elo-line" data-testid="report-elo">
            {myRating.status === "rated" ? (
              <>
                {t("rating", { before: myRating.before, after: myRating.after })} <EloDelta change={myRating} />
              </>
            ) : myRating.status === "revealed" ? (
              t("ratingRevealed", { rating: myRating.after })
            ) : (
              t("placement", { played: myRating.played, total: PLACEMENT_GAMES })
            )}
          </p>
        ) : null}
      </div>

      {/* Les actions juste sous le verdict, pour rejouer sans avoir à faire défiler le détail. */}
      {actions}

      {online ? (
        <ol className="ranking">
          {report.players.map((pl) => (
            <li key={pl.playerId} className={pl.playerId === meId ? "me" : undefined}>
              <span className="rk">{pl.rank}</span>
              <span>
                <strong>{pl.name}</strong>
                <span className="sub">
                  {pl.answered ? t("successRate", { pct: p(pl.accuracy) }) : t("noAnswer")}
                  {pl.avgCorrectMs != null ? " · " + t("avgShort", { time: s(pl.avgCorrectMs) }) : ""}
                  {mode === "battle-royale" && !pl.alive && pl.eliminatedAt != null ? " · " + t("outAt", { n: pl.eliminatedAt + 1 }) : ""}
                  {ratings?.[pl.playerId] ? <> · <RatingShort change={ratings[pl.playerId]!} /></> : null}
                </span>
              </span>
              <span className="sc">
                {pl.score} {unit}
              </span>
            </li>
          ))}
        </ol>
      ) : null}

      {mine ? (
        <>
          <div className="stats">
            <div className="stat">
              <span className="v">{p(mine.accuracy)}</span>
              <span className="k">{t("accuracy")}</span>
            </div>
            <div className="stat">
              <span className="v">{mine.avgCorrectMs != null ? s(mine.avgCorrectMs) : "–"}</span>
              <span className="k">{t("avgTime")}</span>
            </div>
            <div className="stat">
              <span className="v">{mine.fastestMs != null ? s(mine.fastestMs) : "–"}</span>
              <span className="k">{t("fastestTime")}</span>
            </div>
            <div className="stat">
              <span className="v">{mine.bestStreak}</span>
              <span className="k">{t("bestStreak")}</span>
            </div>
          </div>
          <div className="two">
            <div className="stack">
              <h3>{t("timelineTitle")}</h3>
              <Timeline points={mine.timeline} maxMs={timePerQuestion * 1000} label={t("timelineTitle")} />
              <p className="callout">{t("timelineLegend")}</p>
            </div>
            <div className="stack">
              <h3>{t("byOpTitle")}</h3>
              <div className="bars">
                {mine.byOperation.length === 0 ? <p className="muted">{t("noAnswer")}</p> : null}
                {mine.byOperation.map((o) => (
                  <div className="bar-row" key={o.tag}>
                    <span>{tOps(o.tag)}</span>
                    <span className="bar">
                      <i style={{ width: `${o.attempts ? (o.correct / o.attempts) * 100 : 0}%` }} />
                    </span>
                    <span className="pc">
                      {o.correct}/{o.attempts}
                    </span>
                  </div>
                ))}
              </div>
              {report.hardest ? (
                <p className="callout">
                  {t("hardest")}
                  <b>
                    {report.hardest.text} = {report.hardest.answer}
                  </b>
                </p>
              ) : null}
            </div>
          </div>
        </>
      ) : null}

      {report.review?.length ? <Review report={report} meId={mine?.playerId ?? null} online={online} mode={mode} /> : null}
    </section>
  );
}

/** Elo d'un joueur dans le classement : « Elo 1016 (+16) », « Elo 1032 (nouveau) » ou « placement 2/5 ». */
function RatingShort({ change }: { change: RatingChange }) {
  const t = useTranslations("report");
  if (change.status === "placement") return <>{t("placementShort", { played: change.played, total: PLACEMENT_GAMES })}</>;
  if (change.status === "revealed") return <>{t("ratingShort", { rating: change.after })} ({t("ratingNew")})</>;
  return (
    <>
      {t("ratingShort", { rating: change.after })} <EloDelta change={change} />
    </>
  );
}

/** Variation d'Elo colorée : vert si elle monte, rouge si elle baisse. */
export function EloDelta({ change }: { change: { before: number; after: number } }) {
  const locale = useLocale();
  const d = change.after - change.before;
  return <span className={`elo-delta${d > 0 ? " up" : d < 0 ? " down" : ""}`}>({formatSigned(d, locale)})</span>;
}

/** Revoir les calculs : chaque manche, la bonne réponse et ce que chaque joueur a répondu. */
function Review({ report, meId, online, mode }: { report: GameReport; meId: string | null; online: boolean; mode: GameModeId }) {
  const t = useTranslations("report");
  const locale = useLocale();
  const [onlyMisses, setOnlyMisses] = useState(false);
  const rounds = report.review;
  // Toi d'abord, puis les autres dans l'ordre du classement.
  const order = [...report.players].sort((a, b) => (a.playerId === meId ? -1 : b.playerId === meId ? 1 : 0));
  const missed = (r: RoundReview) => {
    const a = meId ? r.answers.find((x) => x.playerId === meId) : undefined;
    return !!a && !a.correct;
  };
  const misses = meId ? rounds.filter(missed).length : 0;
  const inPlay = (pl: PlayerReport, r: RoundReview) => {
    if (r.activePlayerId) return r.activePlayerId === pl.playerId;
    if (mode === "battle-royale") return pl.eliminatedAt == null || pl.eliminatedAt >= r.round - 1;
    return true;
  };
  const shown = onlyMisses ? rounds.filter(missed) : rounds;

  return (
    <section className="review" aria-labelledby="review-title">
      <div className="review-head">
        <h3 id="review-title">{t("reviewTitle")}</h3>
        {meId ? (
          <div className="seg" role="group" aria-label={t("reviewFilter")}>
            <button type="button" aria-pressed={!onlyMisses} onClick={() => setOnlyMisses(false)}>
              {t("reviewAll", { count: rounds.length })}
            </button>
            <button type="button" aria-pressed={onlyMisses} disabled={misses === 0} onClick={() => setOnlyMisses(true)}>
              {t("reviewMisses", { count: misses })}
            </button>
          </div>
        ) : null}
      </div>
      <ol className="review-list">
        {shown.map((r) => {
          const mineA = meId ? r.answers.find((a) => a.playerId === meId) : undefined;
          return (
            <li className="rv" key={r.round}>
              <span className="rv-n">{r.round}</span>
              <p className="rv-q">
                {r.text}
                <span className="eq">=</span>
                <b>{r.answer}</b>
                {mineA ? <span className={`mk ${mineA.correct ? "ok" : "ko"}`}>{mineA.correct ? t("reviewRight") : t("reviewWrong")}</span> : null}
                {r.spared ? <span className="rv-spared"> · {t("reviewSpared")}</span> : null}
              </p>
              <div className="rv-answers">
                {order.map((pl) => {
                  const a = r.answers.find((x) => x.playerId === pl.playerId);
                  if (!a && !inPlay(pl, r)) return null;
                  const isMe = pl.playerId === meId;
                  const who = isMe ? (online ? t("reviewYou") : t("reviewYourAnswer")) : pl.name;
                  const me = isMe ? " me" : "";
                  if (!a)
                    return (
                      <span key={pl.playerId} className={`rv-a none${me}`}>
                        <span className="nm">{who}</span>
                        <span>{t("reviewNoAnswer")}</span>
                      </span>
                    );
                  if (a.value == null)
                    return (
                      <span key={pl.playerId} className={`rv-a ko${me}`}>
                        <span className="nm">{who}</span>
                        <span className="val">{t("reviewTimeout")}</span>
                      </span>
                    );
                  return (
                    <span key={pl.playerId} className={`rv-a ${a.correct ? "ok" : "ko"}${me}`}>
                      <span className="nm">{who}</span>
                      <span className="val">{a.correct ? <>{a.value} ✓</> : <><s>{a.value}</s> ✗</>}</span>
                      <span className="t">{formatSeconds(a.timeMs, locale)}</span>
                      {r.scorers.includes(pl.playerId) ? <span className="pt">+1</span> : null}
                    </span>
                  );
                })}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function Timeline({ points, maxMs, label }: { points: PlayerReport["timeline"]; maxMs: number; label: string }) {
  if (points.length === 0) return null;
  const W = 420,
    H = 150,
    L = 34,
    R = 8,
    T = 10,
    B = 22;
  const iw = W - L - R,
    ih = H - T - B;
  const top = Math.max(1000, Math.ceil(Math.max(...points.map((x) => x.timeMs ?? 0), maxMs * 0.25) / 1000) * 1000);
  const bw = Math.min(22, iw / points.length - 3);
  const x = (i: number) => L + (i + 0.5) * (iw / points.length);
  const y = (ms: number) => T + ih - (ms / top) * ih;
  const ticks = [0, top / 2, top];
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
      {ticks.map((tk) => (
        <g key={tk}>
          <line x1={L} x2={W - R} y1={y(tk)} y2={y(tk)} stroke="var(--line-strong)" strokeWidth={1} />
          <text x={L - 6} y={y(tk) + 4} textAnchor="end">
            {tk / 1000} s
          </text>
        </g>
      ))}
      {points.map((pt, i) =>
        pt.correct && pt.timeMs != null ? (
          <rect key={i} x={x(i) - bw / 2} y={y(pt.timeMs)} width={bw} height={Math.max(2, T + ih - y(pt.timeMs))} rx={3} fill="var(--ink)" />
        ) : (
          <path
            key={i}
            d={`M${x(i) - 5} ${T + ih - 14}l10 10M${x(i) + 5} ${T + ih - 14}l-10 10`}
            stroke="var(--ko)"
            strokeWidth={2.5}
            strokeLinecap="round"
            fill="none"
          />
        ),
      )}
      {points.map((pt, i) =>
        points.length <= 20 || i % 5 === 4 ? (
          <text key={`l${i}`} x={x(i)} y={H - 6} textAnchor="middle">
            {pt.round}
          </text>
        ) : null,
      )}
    </svg>
  );
}
