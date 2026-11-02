import { getTranslations, setRequestLocale } from "next-intl/server";
import { getAchievements } from "@calculus/db";
import { redirect } from "@/i18n/navigation";
import { getSession } from "@/lib/auth";
import { AchievementsView } from "./AchievementsView";

type Params = Promise<{ locale: string }>;

export async function generateMetadata({ params }: { params: Params }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "achievementsPage" });
  return { title: t("metaTitle") };
}

/** Onglet « Mes succès » du profil. */
export default async function AchievementsPage({ params }: { params: Params }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await getSession();
  if (!session) return redirect({ href: "/login", locale });
  return <AchievementsView achievements={await getAchievements(session.user.id)} />;
}
