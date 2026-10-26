import { GAME_MODES } from "@calculus/game-core";
import { redirect } from "@/i18n/navigation";

/** Sans mode précisé, on ouvre le classement du premier mode. */
export default async function LeaderboardIndex({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return redirect({ href: `/leaderboard/${GAME_MODES[0]}`, locale });
}
