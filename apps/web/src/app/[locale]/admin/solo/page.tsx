import { setRequestLocale } from "next-intl/server";
import { getAdminSoloActivity } from "@calculus/db";
import { requireAdmin } from "@/lib/admin";
import { SoloPlays } from "./SoloPlays";

export default async function AdminSoloPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireAdmin();
  return <SoloPlays initial={{ ...(await getAdminSoloActivity(new Date())), serverNow: Date.now() }} />;
}
