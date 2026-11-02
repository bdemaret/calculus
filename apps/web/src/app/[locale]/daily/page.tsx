import { getTranslations, setRequestLocale } from "next-intl/server";
import { getDailyBoard, settleDailyChallenges } from "@calculus/db";
import { dailyDate, isDailyDate } from "@calculus/game-core";
import { Link } from "@/i18n/navigation";
import { getSession } from "@/lib/auth";
import { DailyBoardView } from "./DailyBoardView";
import { DailyClient } from "./DailyClient";
import "./daily.css";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "daily" });
  return { title: t("title") };
}

/** Calcul du jour et son classement ; `?date=` montre seulement le classement d'un jour passé. */
export default async function DailyPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ date?: string | string[] }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("daily");
  const session = await getSession().catch(() => null);
  const now = new Date();
  await settleDailyChallenges(now).catch((e: unknown) => console.error("Calcul du jour : gagnants non désignés", e));
  const today = dailyDate(now.getTime());
  const { date: asked } = await searchParams;
  const date = typeof asked === "string" && isDailyDate(asked) && asked < today ? asked : today;
  const viewerId = session?.user.id ?? null;
  const board = <DailyBoardView board={await getDailyBoard(date, viewerId ?? undefined)} today={today} viewerId={viewerId} />;
  if (date === today) return <DailyClient loggedIn={!!session}>{board}</DailyClient>;
  return (
    <section className="report">
      <div className="setup-head">
        <h2>{t("title")}</h2>
      </div>
      {board}
      <p>
        <Link href="/daily">{t("backToToday")}</Link>
      </p>
    </section>
  );
}
