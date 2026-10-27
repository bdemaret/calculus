import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { getSession } from "@/lib/auth";
import { isDivisionDisplay } from "@/lib/division";
import { PreferencesForm } from "./PreferencesForm";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "profile" });
  return { title: t("tabs.preferences") };
}

/** Onglet « Mes préférences » : langue, saisie des réponses, affichage des divisions. */
export default async function PreferencesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await getSession();
  if (!session) return redirect({ href: "/login", locale });
  return (
    <PreferencesForm
      voiceInput={!!session.user.voiceInput}
      divisionDisplay={isDivisionDisplay(session.user.divisionDisplay) ? session.user.divisionDisplay : "standard"}
    />
  );
}
