import { getTranslations, setRequestLocale } from "next-intl/server";
import { getSession } from "@/lib/auth";
import { publicPage } from "@/lib/seo";
import { OnlineEntry } from "./OnlineEntry";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "online" });
  const meta = await getTranslations({ locale, namespace: "meta" });
  return publicPage(locale, "/online", t("title"), meta("online"));
}

export default async function OnlinePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await getSession().catch(() => null);
  return <OnlineEntry accountName={session?.user.name ?? null} />;
}
