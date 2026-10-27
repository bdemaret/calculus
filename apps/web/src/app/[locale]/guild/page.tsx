import { getTranslations, setRequestLocale } from "next-intl/server";
import { getMyGuild, getReceivedGuildInvites } from "@calculus/db";
import { redirect } from "@/i18n/navigation";
import { getSession } from "@/lib/auth";
import { GuildClient } from "./GuildClient";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "guild" });
  return { title: t("title") };
}

/** Page de la guilde : sa guilde (membres, invitations, lobby de guilde), ou les invitations reçues et la fondation d'une guilde. */
export default async function GuildPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await getSession();
  if (!session) return redirect({ href: "/login", locale });
  const [guild, invites] = await Promise.all([getMyGuild(session.user.id, new Date()), getReceivedGuildInvites(session.user.id)]);
  return <GuildClient guild={guild} invites={invites} meId={session.user.id} />;
}
