import { setRequestLocale } from "next-intl/server";
import { z } from "zod";
import { fetchLiveRooms, requireAdmin } from "@/lib/admin";
import { GamesHistory } from "./GamesHistory";
import { LiveGames } from "./LiveGames";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const pageQuery = z.coerce.number().int().min(0).max(10_000).catch(0);

export default async function AdminGamesPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: SearchParams }) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireAdmin();
  const page = pageQuery.parse((await searchParams).page ?? 0);
  return (
    <div className="stack">
      <LiveGames initial={await fetchLiveRooms()} />
      <GamesHistory page={page} />
    </div>
  );
}
