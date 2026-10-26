import { getTranslations, setRequestLocale } from "next-intl/server";
import { getSession } from "@/lib/auth";
import { OnlineEntry } from "./OnlineEntry";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "online" });
  return { title: t("title") };
}

export default async function OnlinePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await getSession().catch(() => null);
  return <OnlineEntry accountName={session?.user.name ?? null} />;
}
