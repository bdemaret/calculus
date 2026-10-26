import { notFound } from "next/navigation";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { getAdminUser, getDashboard } from "@calculus/db";
import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/admin";
import { DashboardView } from "../../../dashboard/DashboardView";

/** Fiche d'un compte : informations du compte, puis son tableau de bord tel qu'il le voit. */
export default async function AdminUserPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  await requireAdmin();
  if (id.length > 64) notFound();
  const user = await getAdminUser(id);
  if (!user) notFound();
  const [t, format, data] = await Promise.all([getTranslations("admin.users"), getFormatter(), getDashboard(id)]);
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
      </dl>
      {data.stats.gamesPlayed ? <DashboardView data={data} name={user.name} /> : <p className="muted">{t("noGames")}</p>}
    </div>
  );
}
