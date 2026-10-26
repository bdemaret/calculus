import { GAMES, GAME_IDS } from "@calculus/game-core";
import { redirect } from "@/i18n/navigation";

/** Sans jeu précisé, on ouvre le classement du premier mode du premier jeu. */
export default async function LeaderboardIndex({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const game = GAME_IDS[0]!;
  return redirect({ href: `/leaderboard/${game}/${GAMES[game].modes[0]}`, locale });
}
