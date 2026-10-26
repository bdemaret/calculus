import { getTranslations, setRequestLocale } from "next-intl/server";
import { getSession } from "@/lib/auth";
import { SoloGame } from "./SoloGame";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "solo" });
  return { title: t("title") };
}

export default async function SoloPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await getSession().catch(() => null);
  return <SoloGame loggedIn={!!session} playerName={session?.user.name ?? null} />;
}
