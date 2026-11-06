import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { getSession } from "@/lib/auth";
import { NO_INDEX } from "@/lib/seo";
import { DungeonEntry } from "./DungeonEntry";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "dungeon" });
  return { title: t("title"), ...NO_INDEX };
}

/** Entrée des donjons : réservée aux comptes (un invité passe par la connexion, qui le ramène ici). */
export default async function DungeonPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await getSession().catch(() => null);
  if (!session) return redirect({ href: "/login?next=/dungeon", locale });
  return <DungeonEntry />;
}
