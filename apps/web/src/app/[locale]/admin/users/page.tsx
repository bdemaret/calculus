import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { z } from "zod";
import { ADMIN_PAGE_SIZE, listUsers } from "@calculus/db";
import { Link } from "@/i18n/navigation";
import { isAdminEmail, requireAdmin } from "@/lib/admin";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const query = z.object({
  q: z.string().trim().max(100).catch(""),
  page: z.coerce.number().int().min(0).max(10_000).catch(0),
});

export default async function AdminUsersPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: SearchParams }) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireAdmin();
  const raw = await searchParams;
  const { q, page } = query.parse({ q: typeof raw.q === "string" ? raw.q : "", page: raw.page ?? 0 });
  const t = await getTranslations("admin.users");
  const format = await getFormatter();
  const { users, total } = await listUsers(q, page);
  const pages = Math.ceil(total / ADMIN_PAGE_SIZE);
  const date = (iso: string) => format.dateTime(new Date(iso), { dateStyle: "medium" });

  return (
    <div className="stack">
      <form className="friend-add-row" method="get" role="search">
        <label className="sr-only" htmlFor="admin-user-q">
          {t("search")}
        </label>
        <input id="admin-user-q" className="text-input" name="q" defaultValue={q} placeholder={t("searchPlaceholder")} maxLength={100} />
        <button className="btn ghost" type="submit">
          {t("searchButton")}
        </button>
      </form>
      <p className="muted">{t("count", { count: total })}</p>
      {users.length ? (
        <div className="scroll-x">
          <table className="games">
            <thead>
              <tr>
                <th>{t("name")}</th>
                <th>{t("email")}</th>
                <th>{t("createdAt")}</th>
                <th>{t("games")}</th>
                <th>{t("lastGame")}</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>
                    <Link href={`/admin/users/${u.id}`}>{u.name}</Link>
                    {isAdminEmail(u.email) ? <span className="tag-mini">{t("admin")}</span> : null}
                  </td>
                  <td>{u.email}</td>
                  <td>{date(u.createdAt)}</td>
                  <td>{format.number(u.gamesPlayed)}</td>
                  <td>{u.lastGameAt ? date(u.lastGameAt) : "–"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="muted">{t("empty")}</p>
      )}
      {pages > 1 ? (
        <p className="actions">
          {page > 0 ? (
            <Link className="btn ghost" href={{ pathname: "/admin/users", query: { q, page: page - 1 } }}>
              {t("previous")}
            </Link>
          ) : null}
          <span className="muted">{t("page", { page: page + 1, pages })}</span>
          {page + 1 < pages ? (
            <Link className="btn ghost" href={{ pathname: "/admin/users", query: { q, page: page + 1 } }}>
              {t("next")}
            </Link>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}
