import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { getAdminOverview } from "@calculus/db";
import { Link } from "@/i18n/navigation";
import { fetchLiveRooms, requireAdmin } from "@/lib/admin";

export default async function AdminOverviewPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireAdmin();
  const t = await getTranslations("admin.overview");
  const format = await getFormatter();
  const [o, live] = await Promise.all([getAdminOverview(new Date()), fetchLiveRooms()]);
  const n = (x: number) => format.number(x);
  const max = Math.max(1, ...o.signups.map((s) => s.count));
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
