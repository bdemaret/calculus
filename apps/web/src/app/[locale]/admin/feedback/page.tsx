import { getTranslations, setRequestLocale } from "next-intl/server";
import { z } from "zod";
import { ADMIN_PAGE_SIZE, listFeedback } from "@calculus/db";
import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/admin";
import { FeedbackList } from "./FeedbackList";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const STATUSES = ["open", "resolved", "all"] as const;
const query = z.object({
  status: z.enum(STATUSES).catch("open"),
  page: z.coerce.number().int().min(0).max(10_000).catch(0),
});

export default async function AdminFeedbackPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: SearchParams }) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireAdmin();
  const raw = await searchParams;
  const { status, page } = query.parse({ status: raw.status ?? "open", page: raw.page ?? 0 });
  const t = await getTranslations("admin.feedback");
  const { items, total } = await listFeedback(status === "all" ? undefined : status === "resolved", page);
  const pages = Math.ceil(total / ADMIN_PAGE_SIZE);

  return (
    <div className="stack">
      <nav className="seg" aria-label={t("filter")}>
        {STATUSES.map((s) => (
          <Link key={s} href={{ pathname: "/admin/feedback", query: { status: s } }} aria-current={s === status ? "page" : undefined}>
            {t(`status.${s}`)}
          </Link>
        ))}
      </nav>
      <p className="muted">{t("count", { count: total })}</p>
      <FeedbackList items={items} />
      {pages > 1 ? (
        <p className="actions">
          {page > 0 ? (
            <Link className="btn ghost" href={{ pathname: "/admin/feedback", query: { status, page: page - 1 } }}>
              {t("previous")}
            </Link>
          ) : null}
          <span className="muted">{t("page", { page: page + 1, pages })}</span>
          {page + 1 < pages ? (
            <Link className="btn ghost" href={{ pathname: "/admin/feedback", query: { status, page: page + 1 } }}>
              {t("next")}
            </Link>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}
