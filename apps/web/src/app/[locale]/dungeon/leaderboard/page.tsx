import { getTranslations, setRequestLocale } from "next-intl/server";
import { z } from "zod";
import { DUNGEON_LEADERBOARD_SIZE, getDungeonLeaderboard } from "@calculus/db";
import { DIFFICULTIES, DUNGEON_MAX_PLAYERS, DUNGEON_MIN_PLAYERS, type Difficulty } from "@calculus/game-core";
import { Link, redirect } from "@/i18n/navigation";
import { getSession } from "@/lib/auth";
import { NO_INDEX } from "@/lib/seo";

type Params = Promise<{ locale: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** Un classement par taille d'équipe : 2, 3 ou 4 joueurs. */
const PLAYER_COUNTS = Array.from({ length: DUNGEON_MAX_PLAYERS - DUNGEON_MIN_PLAYERS + 1 }, (_, i) => DUNGEON_MIN_PLAYERS + i);
/** Filtre de difficulté, de la plus haute à la plus basse comme le classement. */
const DIFFICULTY_FILTERS = [...DIFFICULTIES].reverse();

/* Paramètres d'URL : une valeur invalide est remplacée par la valeur par défaut (duo, toutes difficultés). */
const query = z.object({
  players: z.coerce
    .number()
    .int()
    .refine((n) => PLAYER_COUNTS.includes(n))
    .catch(DUNGEON_MIN_PLAYERS),
  difficulty: z.coerce
    .number()
    .int()
    .refine((d): d is Difficulty => DIFFICULTIES.includes(d as Difficulty))
    .nullable()
    .catch(null),
});

export async function generateMetadata({ params }: { params: Params }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "dungeon" });
  return { title: t("board.title"), ...NO_INDEX };
}

/**
 * Classement des expéditions gagnées, réservé aux comptes comme le reste des donjons. Trié par difficulté
 * (Légende d'abord), puis par score ; chaque ligne mène au bilan de l'expédition, ouvert à tous les comptes.
 */
export default async function DungeonLeaderboardPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await getSession().catch(() => null);
  if (!session) return redirect({ href: "/login?next=/dungeon/leaderboard", locale });
  const raw = await searchParams;
  const { players, difficulty } = query.parse({
    players: typeof raw.players === "string" ? raw.players : undefined,
    difficulty: typeof raw.difficulty === "string" ? raw.difficulty : null,
  });
  const entries = await getDungeonLeaderboard({ playerCount: players, difficulty });
  const t = await getTranslations({ locale });
  const me = session.user.id;
  // Garde le filtre de difficulté en changeant de taille d'équipe, et inversement.
  const href = (p: number, d: number | null) => ({ pathname: "/dungeon/leaderboard", query: d == null ? { players: p } : { players: p, difficulty: d } });

  return (
    <section className="dungeon-board">
      <div className="setup-head">
        <h1>{t("dungeon.board.title")}</h1>
        <p className="muted">{t("dungeon.board.lede")}</p>
      </div>

      <nav className="board-tabs" aria-label={t("dungeon.board.teamLabel")}>
        {PLAYER_COUNTS.map((p) => (
          <Link key={p} href={href(p, difficulty)} aria-current={p === players ? "page" : undefined}>
            {t("dungeon.board.team", { count: p })}
          </Link>
        ))}
      </nav>

      <div className="field">
        <span className="field-label">{t("settings.difficulty")}</span>
        <nav className="seg" aria-label={t("settings.difficulty")}>
          <Link href={href(players, null)} aria-current={difficulty == null ? "page" : undefined}>
            {t("dungeon.board.allDifficulties")}
          </Link>
          {DIFFICULTY_FILTERS.map((d) => (
            <Link key={d} href={href(players, d)} aria-current={d === difficulty ? "page" : undefined}>
              {t(`levels.${d}`)}
            </Link>
          ))}
        </nav>
      </div>

      <h2 className="h3">{t("dungeon.board.topTitle", { count: DUNGEON_LEADERBOARD_SIZE })}</h2>
      {entries.length ? (
        <div className="scroll-x">
          <table className="dungeon-table dungeon-board-table" aria-label={t("dungeon.board.title")}>
            <thead>
              <tr>
                <th>{t("leaderboard.rank")}</th>
                <th>{t("settings.difficulty")}</th>
                <th>{t("dungeon.board.players")}</th>
                <th>{t("dungeon.board.score")}</th>
                <th>{t("dungeon.board.correct")}</th>
                <th>{t("dungeon.board.date")}</th>
                <th>{t("dungeon.board.reportHead")}</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.runId} className={e.players.some((p) => p.userId === me) ? "me" : undefined}>
                  <td className="rk">{e.rank}</td>
                  <td>{t(`levels.${e.difficulty}`)}</td>
                  <td>
                    <ul className="dungeon-board-players">
                      {e.players.map((p, i) =>
                        p.userId ? (
                          <li key={p.userId}>
                            <Link className="player-link" href={`/player/${p.userId}`}>
                              {p.name}
                            </Link>
                          </li>
                        ) : (
                          <li key={`deleted-${i}`} className="muted">
                            {t("dungeon.end.deleted")}
                          </li>
                        ),
                      )}
                    </ul>
                  </td>
                  <td>
                    <strong>{e.score}</strong>
                  </td>
                  <td>{e.correct}</td>
                  <td>{e.endedAt.toLocaleDateString(locale, { dateStyle: "medium" })}</td>
                  <td>
                    <Link href={`/dungeon/report/${e.runId}`}>{t("dungeon.board.report")}</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="muted">{t("dungeon.board.empty")}</p>
      )}

      <div className="actions">
        <Link className="btn ghost" href="/dungeon">
          {t("dungeon.board.back")}
        </Link>
      </div>
    </section>
  );
}
