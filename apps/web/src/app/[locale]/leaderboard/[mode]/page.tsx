import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { z } from "zod";
import { LEADERBOARD_SIZE, getLeaderboard, searchLeaderboard } from "@calculus/db";
import { DIFFICULTIES, GAME_MODES, type Difficulty, type GameModeId } from "@calculus/game-core";
import { getSession } from "@/lib/auth";
import { LeaderboardView } from "./LeaderboardView";

type Params = Promise<{ locale: string; mode: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const DEFAULT_DIFFICULTY: Difficulty = 2;

/* Paramètres d'URL : une valeur invalide est remplacée par la valeur par défaut. */
const query = z.object({
  difficulty: z.coerce
    .number()
    .int()
    .refine((d): d is Difficulty => DIFFICULTIES.includes(d as Difficulty))
    .catch(DEFAULT_DIFFICULTY),
  q: z.string().trim().max(64).catch(""),
});

export async function generateMetadata({ params }: { params: Params }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "leaderboard" });
  return { title: t("title") };
}

export default async function LeaderboardPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const { locale, mode } = await params;
  setRequestLocale(locale);
  if (!GAME_MODES.includes(mode as GameModeId)) notFound();
  const raw = await searchParams;
  const { difficulty, q } = query.parse({ difficulty: raw.difficulty ?? DEFAULT_DIFFICULTY, q: typeof raw.q === "string" ? raw.q : "" });

  const session = await getSession().catch(() => null);
  const [board, results] = await Promise.all([
    getLeaderboard(mode, difficulty, session?.user.id),
    q ? searchLeaderboard(mode, difficulty, q) : null,
  ]);
  return (
    <LeaderboardView
      mode={mode as GameModeId}
      difficulty={difficulty as Difficulty}
      query={q}
      board={board}
      size={LEADERBOARD_SIZE}
      results={results}
      viewerId={session?.user.id ?? null}
    />
  );
}
