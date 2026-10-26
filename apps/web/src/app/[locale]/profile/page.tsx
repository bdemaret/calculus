import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { getSession } from "@/lib/auth";
import { ProfileForm } from "./ProfileForm";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "profile" });
  return { title: t("title") };
}

export default async function ProfilePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await getSession();
  if (!session) return redirect({ href: "/login", locale });
  const t = await getTranslations("profile");
  const format = await getFormatter();
  return (
    <section className="auth">
      <h2>{t("title")}</h2>
      <p className="muted">
        {session.user.email} · {t("memberSince", { date: format.dateTime(new Date(session.user.createdAt), { dateStyle: "long" }) })}
      </p>
      <ProfileForm name={session.user.name} voiceInput={!!session.user.voiceInput} />
    </section>
  );
}
