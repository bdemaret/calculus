import { getTranslations, setRequestLocale } from "next-intl/server";
import { getFriends } from "@calculus/db";
import { redirect } from "@/i18n/navigation";
import { getSession } from "@/lib/auth";
import { FriendsClient } from "./FriendsClient";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "friends" });
  return { title: t("title") };
}

export default async function FriendsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await getSession();
  if (!session) return redirect({ href: "/login", locale });
  const data = await getFriends(session.user.id);
  return <FriendsClient data={data} />;
}
