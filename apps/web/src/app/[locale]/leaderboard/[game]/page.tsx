import { notFound } from "next/navigation";
import { GAMES, GAME_IDS, GAME_MODES, type GameId, type GameModeId } from "@calculus/game-core";
import { redirect } from "@/i18n/navigation";

type Params = Promise<{ locale: string; game: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * Un seul segment : un jeu (on ouvre son premier mode), ou un mode venant d'une ancienne adresse
 * `/leaderboard/<mode>` (d'avant les jeux, donc du calcul standard). La difficulté est conservée.
 */
export default async function LeaderboardGame({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const { locale, game } = await params;
  const { difficulty } = await searchParams;
  const query = typeof difficulty === "string" ? `?difficulty=${encodeURIComponent(difficulty)}` : "";
  if (GAME_IDS.includes(game as GameId)) return redirect({ href: `/leaderboard/${game}/${GAMES[game as GameId].modes[0]}${query}`, locale });
  if (GAME_MODES.includes(game as GameModeId)) return redirect({ href: `/leaderboard/${GAME_IDS[0]}/${game}${query}`, locale });
  notFound();
}
