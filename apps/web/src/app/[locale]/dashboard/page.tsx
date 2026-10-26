import { getTranslations, setRequestLocale } from "next-intl/server";
import { getDashboard } from "@calculus/db";
import { redirect } from "@/i18n/navigation";
import { getSession } from "@/lib/auth";
import { DashboardView } from "./DashboardView";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "dashboard" });
  return { title: t("title") };
}

export default async function DashboardPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await getSession();
  if (!session) return redirect({ href: "/login", locale });
  const data = await getDashboard(session.user.id);
  return <DashboardView data={data} name={session.user.name} />;
}
