import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { loadGameReport } from "@calculus/db";
import { Link } from "@/i18n/navigation";
import { getSession } from "@/lib/auth";
import { GameReportView } from "@/components/GameReportView";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "report" });
  return { title: t("pageTitle") };
}

/** Rapport d'une partie enregistrée (accessible depuis le tableau de bord). */
export default async function ReportPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const [stored, session] = await Promise.all([loadGameReport(id), getSession().catch(() => null)]);
  if (!stored) notFound();
  const t = await getTranslations("report");
  const meId = session ? (stored.playerKeyByUser[session.user.id] ?? null) : null;
  return (
    <GameReportView
      report={stored.report}
      meId={meId}
      online={!stored.solo}
      game={stored.settings.game}
      mode={stored.settings.mode}
      timePerQuestion={stored.settings.timePerQuestion}
      ratings={stored.ratings}
      actions={
        <div className="actions">
          <Link className="btn" href={stored.solo ? "/solo" : "/online"}>
            {t("playAgain")}
          </Link>
          <Link className="link-btn" href="/dashboard">
            {t("toDashboard")}
          </Link>
        </div>
      }
    />
  );
}
