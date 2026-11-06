import { getTranslations, setRequestLocale } from "next-intl/server";
import { normalizeCode } from "@calculus/game-core";
import { redirect } from "@/i18n/navigation";
import { getSession } from "@/lib/auth";
import { NO_INDEX } from "@/lib/seo";
import { DungeonClient } from "./DungeonClient";

export async function generateMetadata({ params }: { params: Promise<{ locale: string; code: string }> }) {
  const { locale, code } = await params;
  const t = await getTranslations({ locale, namespace: "dungeon" });
  return { title: t("pageTitle", { code: normalizeCode(code) }), ...NO_INDEX };
}

export default async function DungeonRoomPage({ params }: { params: Promise<{ locale: string; code: string }> }) {
  const { locale, code } = await params;
  setRequestLocale(locale);
  const session = await getSession().catch(() => null);
  if (!session) return redirect({ href: "/login?next=/dungeon", locale });
  return <DungeonClient code={normalizeCode(code)} />;
}
