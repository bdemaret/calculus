import { getTranslations, setRequestLocale } from "next-intl/server";
import { normalizeCode } from "@calculus/game-core";
import { getSession } from "@/lib/auth";
import { LobbyClient } from "./LobbyClient";

export async function generateMetadata({ params }: { params: Promise<{ locale: string; code: string }> }) {
  const { locale, code } = await params;
  const t = await getTranslations({ locale, namespace: "lobby" });
  return { title: t("pageTitle", { code: normalizeCode(code) }) };
}

export default async function LobbyPage({ params }: { params: Promise<{ locale: string; code: string }> }) {
  const { locale, code } = await params;
  setRequestLocale(locale);
  const session = await getSession().catch(() => null);
  return <LobbyClient code={normalizeCode(code)} accountName={session?.user.name ?? null} />;
}
