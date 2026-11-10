import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { z } from "zod";
import { ADMIN_PAGE_SIZE, listBannedUsers, listSuspectReports } from "@calculus/db";
import { DAILY_BAN_MS } from "@calculus/game-core";
import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/admin";
import { BanActions } from "./BanActions";
import { ReportEvidence } from "./ReportEvidence";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const query = z.object({ page: z.coerce.number().int().min(0).max(10_000).catch(0) });

/** Anti-bot : signalements douteux à examiner (50 plus récents), puis comptes bannis avec leur preuve et le bouton pour débannir. */
export default async function AdminBansPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: SearchParams }) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireAdmin();
  const { page } = query.parse({ page: (await searchParams).page ?? 0 });
  const [t, format, suspects, banned] = await Promise.all([getTranslations("admin.bans"), getFormatter(), listSuspectReports(0), listBannedUsers(page)]);
  const pages = Math.ceil(banned.total / ADMIN_PAGE_SIZE);

  return (
    <div className="stack">
      <h3>{t("suspectsTitle")}</h3>
      <p className="muted">
        {t("suspectsCount", { count: suspects.total })} · {t("suspectsNote", { ban: DAILY_BAN_MS })}
      </p>
      {suspects.items.length === 0 ? (
        <p className="muted">{t("suspectsEmpty")}</p>
      ) : (
        <ul className="feedback-list" data-testid="bot-suspects">
          {suspects.items.map(({ user, report }) => (
            <li key={report.id} className="panel feedback-item">
              <p>
                <Link href={`/admin/users/${user.id}`}>{user.name}</Link> <span className="muted">({user.email})</span>
              </p>
              <ReportEvidence report={report} />
              <BanActions userId={user.id} name={user.name} banned={false} reportId={report.id} />
            </li>
          ))}
        </ul>
      )}

      <h3>{t("bannedTitle")}</h3>
      <p className="muted">{t("bannedCount", { count: banned.total })}</p>
      {banned.users.length === 0 ? (
        <p className="muted">{t("bannedEmpty")}</p>
      ) : (
        <ul className="feedback-list" data-testid="banned-users">
          {banned.users.map((u) => (
            <li key={u.id} className="panel feedback-item">
              <p>
                <Link href={`/admin/users/${u.id}`}>{u.name}</Link> <span className="muted">({u.email})</span>
              </p>
              <p className="muted">
                {t("bannedOn", { date: format.dateTime(new Date(u.ban.bannedAt), { dateStyle: "long", timeStyle: "short" }) })} · {t(`reason.${u.ban.reason}`)}
              </p>
              {u.reports.length === 0 ? <p className="muted">{t("noReport")}</p> : u.reports.map((r) => <ReportEvidence key={r.id} report={r} />)}
              <BanActions userId={u.id} name={u.name} banned />
            </li>
          ))}
        </ul>
      )}
      {pages > 1 ? (
        <p className="actions">
          {page > 0 ? (
            <Link className="btn ghost" href={{ pathname: "/admin/bans", query: { page: page - 1 } }}>
              {t("previous")}
            </Link>
          ) : null}
          <span className="muted">{t("page", { page: page + 1, pages })}</span>
          {page + 1 < pages ? (
            <Link className="btn ghost" href={{ pathname: "/admin/bans", query: { page: page + 1 } }}>
              {t("next")}
            </Link>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}
