import type { ReactNode } from "react";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { prisma } from "@calculus/db";
import { redirect } from "@/i18n/navigation";
import { getSession } from "@/lib/auth";
import { Avatar } from "@/components/PlayerChips";
import { ProfileTabs } from "./ProfileTabs";

/** Espace du compte : en-tête (photo, pseudo, date d'inscription) et onglets profil, amis, préférences. Chaque page revérifie la session. */
export default async function ProfileLayout({ children, params }: { children: ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await getSession();
  if (!session) return redirect({ href: "/login", locale });
  const t = await getTranslations("profile");
  const format = await getFormatter();
  const requests = await prisma.friendship.count({ where: { addresseeId: session.user.id, status: "pending" } });
  return (
    <section className="profile">
      <div className="profile-head">
        <Avatar className="lg" name={session.user.name} image={session.user.image} />
        <div>
          <h2>{session.user.name}</h2>
          <p className="muted">{t("memberSince", { date: format.dateTime(new Date(session.user.createdAt), { dateStyle: "long" }) })}</p>
        </div>
      </div>
      <ProfileTabs requests={requests} />
      {children}
    </section>
  );
}
