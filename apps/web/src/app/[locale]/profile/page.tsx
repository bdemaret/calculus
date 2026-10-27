import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { getSession } from "@/lib/auth";
import { ProfileForm } from "./ProfileForm";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "profile" });
  return { title: t("title") };
}

/** Onglet « Mon profil » : photo, pseudo, e-mail, mot de passe, déconnexion et suppression du compte. */
export default async function ProfilePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await getSession();
  if (!session) return redirect({ href: "/login", locale });
  return <ProfileForm name={session.user.name} email={session.user.email} image={session.user.image ?? null} />;
}
