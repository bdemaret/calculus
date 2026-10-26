"use client";
import { useState, useTransition, type FormEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { LeaderboardData, LeaderboardEntry } from "@calculus/db";
import { DIFFICULTIES, GAMES, GAME_IDS, PLACEMENT_GAMES, type Difficulty, type GameId, type GameModeId } from "@calculus/game-core";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { formatPercent } from "@/lib/format";

interface Props {
  game: GameId;
  mode: GameModeId;
  difficulty: Difficulty;
  query: string;
  board: LeaderboardData;
  /** Taille du top affiché */
  size: number;
  /** Résultats de la recherche par pseudo, null sans recherche */
  results: LeaderboardEntry[] | null;
  viewerId: string | null;
}

export function LeaderboardView({ game, mode, difficulty, query, board, size, results, viewerId }: Props) {
  const t = useTranslations();
  const router = useRouter();
  const pathname = usePathname();
  const [search, setSearch] = useState(query);
  const [pending, startTransition] = useTransition();

  // La recherche passe par l'URL : la page serveur relit `q` et renvoie les résultats.
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const q = search.trim();
    startTransition(() => router.replace({ pathname, query: q ? { difficulty, q } : { difficulty } }));
  };
  const clear = () => {
    setSearch("");
    startTransition(() => router.replace({ pathname, query: { difficulty } }));
  };

  const meInTop = board.me != null && board.top.some((e) => e.userId === board.me!.userId);

  return (
    <section className="report">
      <div className="setup-head">
        <h2>{t("leaderboard.title")}</h2>
        <p className="muted">{t("leaderboard.lede", { total: PLACEMENT_GAMES })}</p>
      </div>

      <nav className="board-tabs" aria-label={t("leaderboard.gamesLabel")}>
        {GAME_IDS.map((g) => (
          // Changer de jeu garde le mode s'il existe dans ce jeu, sinon on prend son premier mode.
          <Link
            key={g}
            href={{ pathname: `/leaderboard/${g}/${GAMES[g].modes.includes(mode) ? mode : GAMES[g].modes[0]}`, query: { difficulty } }}
            aria-current={g === game ? "page" : undefined}
          >
            {t(`games.${g}.name`)}
          </Link>
        ))}
      </nav>

      <nav className="board-tabs" aria-label={t("leaderboard.modesLabel")}>
        {GAMES[game].modes.map((m) => (
          <Link key={m} href={{ pathname: `/leaderboard/${game}/${m}`, query: { difficulty } }} aria-current={m === mode ? "page" : undefined}>
            {t(`modes.${m}.name`)}
          </Link>
        ))}
      </nav>

      <div className="field">
        <span className="field-label">{t("settings.difficulty")}</span>
        <nav className="seg" aria-label={t("settings.difficulty")}>
          {DIFFICULTIES.map((d) => (
            <Link key={d} href={{ pathname, query: query ? { difficulty: d, q: query } : { difficulty: d } }} aria-current={d === difficulty ? "page" : undefined}>
              {t(`levels.${d}`)}
            </Link>
          ))}
        </nav>
      </div>

      {viewerId ? (
        <div className="stack">
          <h3>{t("leaderboard.meTitle")}</h3>
          {board.me ? (
            <>
              <BoardTable entries={[board.me]} viewerId={viewerId} label={t("leaderboard.meTitle")} />
              <p className="callout">
                {t("leaderboard.meOf", { total: board.total })}
                {meInTop ? (
                  <>
                    {" · "}
                    <a href="#board-me">{t("leaderboard.meShowInTop")}</a>
                  </>
                ) : null}
              </p>
            </>
          ) : (
            <p className="muted">
              {board.mePlacement != null
                ? t("leaderboard.mePlacement", { played: board.mePlacement, total: PLACEMENT_GAMES })
                : t("leaderboard.meUnranked", { total: PLACEMENT_GAMES })}
            </p>
          )}
        </div>
      ) : null}

      <form className="friend-add" role="search" onSubmit={submit}>
        <label className="field-label" htmlFor="board-search">
          {t("leaderboard.searchLabel")}
        </label>
        <div className="friend-add-row">
          <input
            className="text-input"
            id="board-search"
            type="search"
            maxLength={64}
            autoComplete="off"
            placeholder={t("leaderboard.searchPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button className="btn" type="submit" disabled={pending || !search.trim()}>
            {t("leaderboard.search")}
          </button>
          {query ? (
            <button className="btn ghost" type="button" onClick={clear} disabled={pending}>
              {t("leaderboard.clear")}
            </button>
          ) : null}
        </div>
      </form>

      {results ? (
        <div className="stack">
          <h3>{t("leaderboard.resultsTitle", { query })}</h3>
          {results.length ? (
            <BoardTable entries={results} viewerId={viewerId} label={t("leaderboard.resultsTitle", { query })} />
          ) : (
            <p className="muted">{t("leaderboard.noResults")}</p>
          )}
        </div>
      ) : null}

      <div className="stack">
        <h3>{t("leaderboard.topTitle", { count: size })}</h3>
        {board.top.length ? (
          <BoardTable entries={board.top} viewerId={viewerId} label={t("leaderboard.topTitle", { count: size })} anchorMe />
        ) : (
          <p className="muted">{t("leaderboard.empty", { total: PLACEMENT_GAMES })}</p>
        )}
      </div>
    </section>
  );
}

/** `anchorMe` : la ligne du joueur connecté reçoit l'ancre `#board-me` (lien « voir dans le top »). */
function BoardTable({ entries, viewerId, label, anchorMe }: { entries: LeaderboardEntry[]; viewerId: string | null; label: string; anchorMe?: boolean }) {
  const t = useTranslations();
  const locale = useLocale();
  return (
    <div className="scroll-x">
      <table className="games board" aria-label={label}>
        <thead>
          <tr>
            <th>{t("leaderboard.rank")}</th>
            <th>{t("leaderboard.player")}</th>
            <th>{t("dashboard.elo")}</th>
            <th>{t("leaderboard.games")}</th>
            <th>{t("leaderboard.winRate")}</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => (
            <tr key={e.userId} className={e.userId === viewerId ? "me" : undefined} id={anchorMe && e.userId === viewerId ? "board-me" : undefined}>
              <td className="rk">{e.rank}</td>
              <td>
                {e.name}
                {e.userId === viewerId ? <span className="muted"> {t("leaderboard.you")}</span> : null}
              </td>
              <td>
                <strong>{e.rating}</strong>
              </td>
              <td>{e.games}</td>
              <td>{formatPercent(e.games ? e.wins / e.games : 0, locale)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
