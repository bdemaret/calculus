import { getTranslations, setRequestLocale } from "next-intl/server";
import { getAchievements, getTitles } from "@calculus/db";
import { redirect } from "@/i18n/navigation";
import { getSession } from "@/lib/auth";
import { AchievementsView } from "./AchievementsView";
import { TitlePicker } from "./TitlePicker";

type Params = Promise<{ locale: string }>;

export async function generateMetadata({ params }: { params: Params }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "achievementsPage" });
  return { title: t("metaTitle") };
}

/** Onglet « Mes succès » du profil : choix du titre, puis succès. */
export default async function AchievementsPage({ params }: { params: Params }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await getSession();
  if (!session) return redirect({ href: "/login", locale });
  const [achievements, titles] = await Promise.all([getAchievements(session.user.id), getTitles(session.user.id)]);
  return (
    <>
      <TitlePicker {...titles} />
      <AchievementsView achievements={achievements} />
    </>
  );
}
