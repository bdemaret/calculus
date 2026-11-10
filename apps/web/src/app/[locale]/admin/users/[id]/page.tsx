import { notFound } from "next/navigation";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { getAdminUser, getBotReports, getDashboard } from "@calculus/db";
import { Link } from "@/i18n/navigation";
import { isAdminUser, requireAdmin } from "@/lib/admin";
import { DashboardView } from "../../../dashboard/DashboardView";
import { BanActions } from "../../bans/BanActions";
import { ReportEvidence } from "../../bans/ReportEvidence";

/** Fiche d'un compte : informations du compte, ban et signalements de l'anti-bot, puis son tableau de bord tel qu'il le voit. */
export default async function AdminUserPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  await requireAdmin();
  if (id.length > 64) notFound();
  const user = await getAdminUser(id);
  if (!user) notFound();
  const [t, tb, format, data, reports] = await Promise.all([getTranslations("admin.users"), getTranslations("admin.bans"), getFormatter(), getDashboard(id), getBotReports(id)]);
  const date = (iso: string) => format.dateTime(new Date(iso), { dateStyle: "long", timeStyle: "short" });

  return (
    <div className="stack">
      <p>
        <Link href="/admin/users">{t("back")}</Link>
      </p>
      <dl className="admin-facts panel">
        <div>
          <dt>{t("name")}</dt>
          <dd>{user.name}</dd>
        </div>
        <div>
          <dt>{t("email")}</dt>
          <dd>
            {user.email} {user.emailVerified ? <span className="tag-mini">{t("verified")}</span> : null}
          </dd>
        </div>
        <div>
          <dt>{t("createdAt")}</dt>
          <dd>{date(user.createdAt)}</dd>
        </div>
        <div>
          <dt>{t("lastSeen")}</dt>
          <dd>{user.lastSeenAt ? date(user.lastSeenAt) : "–"}</dd>
        </div>
        <div>
          <dt>{t("friends")}</dt>
          <dd>{format.number(user.friends)}</dd>
        </div>
        <div>
          <dt>{t("feedbacks")}</dt>
          <dd>{format.number(user.feedbacks)}</dd>
        </div>
        <div>
          <dt>{t("id")}</dt>
          <dd className="admin-id">{user.id}</dd>
        </div>
        <div>
          <dt>{t("status")}</dt>
          <dd data-testid="ban-status">{user.ban ? `${t("banned")} · ${tb(`reason.${user.ban.reason}`)} · ${date(user.ban.bannedAt)}` : t("active")}</dd>
        </div>
      </dl>
      {isAdminUser(user.id) ? null : <BanActions userId={user.id} name={user.name} banned={!!user.ban} />}
      {reports.length ? (
        <div className="panel stack">
          <h3>{t("reports")}</h3>
          {reports.map((r) => (
            <ReportEvidence key={r.id} report={r} />
          ))}
        </div>
      ) : null}
      {data.stats.gamesPlayed ? <DashboardView data={data} name={user.name} /> : <p className="muted">{t("noGames")}</p>}
    </div>
  );
}
