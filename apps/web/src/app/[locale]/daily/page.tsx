import { getTranslations, setRequestLocale } from "next-intl/server";
import { getBan, getDailyBoard, settleDailyChallenges } from "@calculus/db";
import { dailyDate, isDailyDate } from "@calculus/game-core";
import { Link } from "@/i18n/navigation";
import { getSession } from "@/lib/auth";
import { publicPage } from "@/lib/seo";
import { BannedNotice } from "@/components/BannedNotice";
import { DailyBoardView } from "./DailyBoardView";
import { DailyClient } from "./DailyClient";
import "./daily.css";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "daily" });
  const meta = await getTranslations({ locale, namespace: "meta" });
  return publicPage(locale, "/daily", t("title"), meta("daily"));
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
  // Compte banni : pas d'essai. `DailyClient` relit cette page quand le serveur vient de bannir le compte en plein essai.
  if (viewerId && date === today && (await getBan(viewerId))) return <BannedNotice />;
  const board = <DailyBoardView board={await getDailyBoard(date, viewerId ?? undefined)} today={today} viewerId={viewerId} />;
  if (date === today) return <DailyClient loggedIn={!!session}>{board}</DailyClient>;
  return (
    <section className="report">
      <div className="setup-head">
        <h1>{t("title")}</h1>
      </div>
      {board}
      <p>
        <Link href="/daily">{t("backToToday")}</Link>
      </p>
    </section>
  );
}
