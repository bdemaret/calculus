import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { GAMES_HISTORY_RANGES, getAdminOverview, getGamesHistory, type GamesHistoryRange } from "@calculus/db";
import { Link } from "@/i18n/navigation";
import { fetchLiveRooms, requireAdmin } from "@/lib/admin";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function AdminOverviewPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: SearchParams }) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireAdmin();
  const asked = Number((await searchParams).range);
  const range: GamesHistoryRange = GAMES_HISTORY_RANGES.find((r) => r === asked) ?? 30;
  const t = await getTranslations("admin.overview");
  const format = await getFormatter();
  const now = new Date();
  const [o, live, history] = await Promise.all([getAdminOverview(now), fetchLiveRooms(), getGamesHistory(now, range)]);
  const n = (x: number) => format.number(x);
  const max = Math.max(1, ...o.signups.map((s) => s.count));
  const maxGames = Math.max(1, ...history.points.map((p) => p.solo + p.online));
  const pointLabel = (start: string) => {
    const date = format.dateTime(new Date(start), { dateStyle: "medium", timeZone: "UTC" });
    return history.bucket === "week" ? t("weekOf", { date }) : date;
  };
  const playing = live?.rooms.reduce((sum, r) => sum + r.players.length, 0) ?? 0;

  return (
    <>
      <div className="stats">
        <Link className="stat stat-link" href="/admin/users">
          <span className="v">{n(o.users)}</span>
          <span className="k">{t("users")}</span>
        </Link>
        <div className="stat">
          <span className="v">{n(o.usersLast7Days)}</span>
          <span className="k">{t("usersLast7Days")}</span>
        </div>
        <Link className="stat stat-link" href="/admin/games">
          <span className="v">{live ? n(live.rooms.length) : "–"}</span>
          <span className="k">{live ? t("liveRooms", { players: playing }) : t("liveUnavailable")}</span>
        </Link>
        <Link className="stat stat-link" href="/admin/feedback">
          <span className="v">{n(o.openFeedback)}</span>
          <span className="k">{t("openFeedback")}</span>
        </Link>
      </div>

      <div className="stats">
        <div className="stat">
          <span className="v">{n(o.usersLast30Days)}</span>
          <span className="k">{t("usersLast30Days")}</span>
        </div>
        <div className="stat">
          <span className="v">{n(o.games)}</span>
          <span className="k">{t("games")}</span>
        </div>
        <div className="stat">
          <span className="v">{n(o.onlineGames)}</span>
          <span className="k">{t("onlineGames")}</span>
        </div>
        <div className="stat">
          <span className="v">{n(o.gamesLast24Hours)}</span>
          <span className="k">{t("gamesLast24Hours")}</span>
        </div>
      </div>

      <div className="stack">
        <div className="admin-chart-head">
          <h3>{t("gamesTitle")}</h3>
          <nav className="admin-ranges" aria-label={t("rangeLabel")}>
            {GAMES_HISTORY_RANGES.map((r) => (
              <Link key={r} href={{ pathname: "/admin", query: r === 30 ? {} : { range: r } }} aria-current={r === range ? "page" : undefined}>
                {t(`range.${r}`)}
              </Link>
            ))}
          </nav>
        </div>
        <p className="muted admin-legend">
          <span className="admin-swatch online" /> {t("gamesOnline", { count: history.online })}
          <span className="admin-swatch solo" /> {t("gamesSolo", { count: history.solo })}
          {" · "}
          {history.bucket === "week" ? t("perWeek") : t("perDay")}
        </p>
        <div className="spark" role="img" aria-label={t("gamesLabel", { online: history.online, solo: history.solo })}>
          {history.points.map((p) => (
            <span
              key={p.start}
              className="spark-stack"
              style={{ height: `${((p.solo + p.online) / maxGames) * 100}%` }}
              title={`${pointLabel(p.start)} : ${t("gamesTooltip", { online: p.online, solo: p.solo })}`}
            >
              {p.online ? <span className="spark-seg online" style={{ flexGrow: p.online }} /> : null}
              {p.solo ? <span className="spark-seg solo" style={{ flexGrow: p.solo }} /> : null}
            </span>
          ))}
        </div>
      </div>

      <div className="stack">
        <h3>{t("signupsTitle")}</h3>
        <div className="spark" role="img" aria-label={t("signupsLabel", { count: o.usersLast30Days })}>
          {o.signups.map((s) => (
            <span
              key={s.day}
              className="spark-bar"
              style={{ height: `${(s.count / max) * 100}%` }}
              title={`${format.dateTime(new Date(s.day), { dateStyle: "medium", timeZone: "UTC" })} : ${s.count}`}
            />
          ))}
        </div>
      </div>
    </>
  );
}
