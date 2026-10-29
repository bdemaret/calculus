import { getTranslations, setRequestLocale } from "next-intl/server";
import { GAMES, GAME_IDS } from "@calculus/game-core";
import { getSession } from "@/lib/auth";
import { SoloGame } from "./SoloGame";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "solo" });
  return { title: t("title") };
}

export default async function SoloPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ game?: string | string[] }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  // `?game=<id>` (boutons de l'onglet Jeux) présélectionne un jeu jouable seul ; toute autre valeur est ignorée.
  const { game } = await searchParams;
  const preset = GAME_IDS.find((g) => g === game && GAMES[g].solo) ?? null;
  const session = await getSession().catch(() => null);
  return <SoloGame loggedIn={!!session} playerName={session?.user.name ?? null} preset={preset} />;
}
