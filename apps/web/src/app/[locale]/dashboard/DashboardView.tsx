"use client";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { DashboardData } from "@calculus/db";
import { Link } from "@/i18n/navigation";
import { Margin, MarginNote } from "@/components/Margin";
import { formatPercent, formatSeconds } from "@/lib/format";

export function DashboardView({ data, name }: { data: DashboardData; name: string }) {
  const t = useTranslations();
  const locale = useLocale();
  const format = useFormatter();
  const s = data.stats;
  const pc = (x: number) => formatPercent(x, locale);
  const sec = (ms: number) => formatSeconds(ms, locale);

  if (s.gamesPlayed === 0) {
    return (
      <section className="empty-state">
        <h2>{t("dashboard.hello", { name })}</h2>
        <p className="muted">{t("dashboard.empty")}</p>
        <div className="actions">
          <Link className="btn" href="/solo">
            {t("home.playSolo")}
          </Link>
          <Link className="btn ghost" href="/online">
            {t("home.playOnline")}
          </Link>
        </div>
      </section>
    );
  }

  // Du plus ancien au plus récent, pour lire la progression de gauche à droite.
  const progress = [...data.recent].reverse().map((g, i) => ({
    n: i + 1,
    accuracy: Math.round(g.accuracy * 100),
    time: g.avgCorrectMs != null ? Math.round(g.avgCorrectMs / 100) / 10 : null,
  }));

  return (
    <section className="report">
      <Margin>
        <MarginNote value={s.gamesPlayed} label={t("dashboard.gamesShort")} />
      </Margin>
      <div className="setup-head">
        <h2>{t("dashboard.hello", { name })}</h2>
        <p className="muted">{t("dashboard.summary", { games: s.gamesPlayed, online: s.onlineGames, solo: s.soloGames })}</p>
      </div>

      <div className="stats">
        <div className="stat">
          <span className="v">{pc(s.accuracy)}</span>
          <span className="k">{t("report.accuracy")}</span>
        </div>
        <div className="stat">
          <span className="v">{s.avgCorrectMs != null ? sec(s.avgCorrectMs) : "–"}</span>
          <span className="k">{t("report.avgTime")}</span>
        </div>
        <div className="stat">
          <span className="v">{s.wins}</span>
          <span className="k">{t("dashboard.wins")}</span>
        </div>
        <div className="stat">
          <span className="v">{s.bestStreak}</span>
          <span className="k">{t("report.bestStreak")}</span>
        </div>
      </div>

      <div className="two">
        <div className="stack">
          <h3>{t("dashboard.progressTitle")}</h3>
          <div style={{ width: "100%", height: 220 }}>
            <ResponsiveContainer>
              <LineChart data={progress} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
                <CartesianGrid vertical={false} strokeDasharray="0" />
                <XAxis dataKey="n" tickLine={false} axisLine={false} />
                <YAxis yAxisId="acc" domain={[0, 100]} tickLine={false} axisLine={false} unit=" %" />
                <YAxis yAxisId="time" orientation="right" tickLine={false} axisLine={false} unit=" s" />
                <Tooltip />
                <Line yAxisId="acc" type="monotone" dataKey="accuracy" name={t("report.accuracy")} stroke="var(--ink)" strokeWidth={2.5} dot={false} />
                <Line yAxisId="time" type="monotone" dataKey="time" name={t("report.avgTime")} stroke="var(--margin-red)" strokeWidth={2} dot={false} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p className="callout">{t("dashboard.progressLegend")}</p>
        </div>
        <div className="stack">
          <h3>{t("report.byOpTitle")}</h3>
          <div className="bars">
            {data.byOperation.map((o) => (
              <div className="bar-row" key={o.tag}>
                <span>{t(`ops.${o.tag}`)}</span>
                <span className="bar">
                  <i style={{ width: `${o.attempts ? (o.correct / o.attempts) * 100 : 0}%` }} />
                </span>
                <span className="pc">{pc(o.attempts ? o.correct / o.attempts : 0)}</span>
              </div>
            ))}
          </div>
          {s.bestSurvival > 0 ? (
            <p className="callout">
              {t("dashboard.bestSurvival")}
              <b>{s.bestSurvival}</b>
            </p>
          ) : null}
        </div>
      </div>

      <div className="stack">
        <h3>{t("dashboard.recentTitle")}</h3>
        <div className="scroll-x">
          <table className="games">
            <thead>
              <tr>
                <th>{t("dashboard.date")}</th>
                <th>{t("settings.mode")}</th>
                <th>{t("settings.difficulty")}</th>
                <th>{t("dashboard.result")}</th>
                <th>{t("report.accuracy")}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.recent.map((g) => (
                <tr key={g.gameId}>
                  <td>{format.dateTime(new Date(g.endedAt), { dateStyle: "short", timeStyle: "short" })}</td>
                  <td>
                    {t(`modes.${g.mode}.name`)} · {g.solo ? t("dashboard.solo") : t("dashboard.online")}
                  </td>
                  <td>{t(`levels.${g.difficulty}`)}</td>
                  <td>{g.solo ? t("dashboard.scoreOnly", { score: g.score }) : t("dashboard.rankOf", { rank: g.rank, players: g.players })}</td>
                  <td>{pc(g.accuracy)}</td>
                  <td>
                    <Link href={`/report/${g.gameId}`}>{t("dashboard.view")}</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
