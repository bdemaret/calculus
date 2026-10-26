import { setRequestLocale } from "next-intl/server";
import { fetchLiveRooms, requireAdmin } from "@/lib/admin";
import { LiveGames } from "./LiveGames";

export default async function AdminGamesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireAdmin();
  return <LiveGames initial={await fetchLiveRooms()} />;
}
