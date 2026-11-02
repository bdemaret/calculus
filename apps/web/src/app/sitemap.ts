import type { MetadataRoute } from "next";
import { DIFFICULTIES, GAMES, GAME_IDS, TECHNIQUE_IDS } from "@calculus/game-core";
import { routing } from "@/i18n/routing";
import { SITE_URL } from "@/lib/seo";

/** Pages publiques, sans la langue. Les pages de compte et de partie n'y figurent pas (`NO_INDEX`). */
function publicPaths(): string[] {
  return [
    "",
    "/games",
    "/solo",
    "/online",
    "/daily",
    "/learn",
    ...DIFFICULTIES.filter((d) => d > 1).map((d) => `/learn?level=${d}`),
    ...TECHNIQUE_IDS.map((id) => `/learn/${id}`),
    ...GAME_IDS.flatMap((game) => GAMES[game].modes.map((mode) => `/leaderboard/${game}/${mode}`)),
    "/changelog",
    "/legal",
    "/privacy",
    "/terms",
  ];
}

export default function sitemap(): MetadataRoute.Sitemap {
  const url = (locale: string, path: string) => `${SITE_URL}/${locale}${path}`;
  return publicPaths().flatMap((path) =>
    routing.locales.map((locale) => ({
      url: url(locale, path),
      alternates: { languages: Object.fromEntries(routing.locales.map((l) => [l, url(l, path)])) },
    })),
  );
}
