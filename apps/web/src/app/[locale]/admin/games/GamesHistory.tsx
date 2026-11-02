import { getFormatter, getTranslations } from "next-intl/server";
import { ADMIN_PAGE_SIZE, listOnlineGames, type AdminOnlineGame } from "@calculus/db";
import { Link } from "@/i18n/navigation";

/** Parties en ligne enregistrées : qui a joué et combien de joueurs étaient dans le lobby au lancement. */
export async function GamesHistory({ page }: { page: number }) {
  const t = await getTranslations();
  const format = await getFormatter();
  const { games, total } = await listOnlineGames(page);
  const pages = Math.ceil(total / ADMIN_PAGE_SIZE);
  const now = new Date();

  const duration = (g: AdminOnlineGame) => {
    const seconds = Math.max(0, Math.round((new Date(g.endedAt).getTime() - new Date(g.startedAt).getTime()) / 1000));
    return t("admin.solo.duration", { minutes: Math.floor(seconds / 60), seconds: String(seconds % 60).padStart(2, "0") });
  };
  const player = (p: AdminOnlineGame["players"][number]) => {
    if (p.userId) return <Link href={`/admin/users/${p.userId}`}>{p.name}</Link>;
    // Pseudo vidé par `eraseUserGames` : le compte a été supprimé.
    if (!p.name) return <span className="muted">{t("admin.games.history.deleted")}</span>;
    return (
      <>
        {p.name}
        <span className="tag-mini">{t("admin.games.guest")}</span>
      </>
    );
  };

  return (
    <div className="stack">
      <h3 id="history">{t("admin.games.history.title")}</h3>
      <p className="muted">
        {t("admin.games.history.count", { count: total })} · {t("admin.games.history.note")}
      </p>
      {games.length ? (
        <div className="scroll-x">
          <table className="games">
            <thead>
              <tr>
                <th>{t("admin.solo.when")}</th>
                <th>{t("admin.games.history.code")}</th>
                <th>{t("admin.solo.game")}</th>
                <th>{t("admin.games.history.lobby")}</th>
                <th>{t("admin.games.history.players")}</th>
                <th>{t("admin.solo.length")}</th>
                <th>{t("admin.games.history.report")}</th>
              </tr>
            </thead>
            <tbody>
              {games.map((g) => (
                <tr key={g.id}>
                  <td title={format.dateTime(new Date(g.startedAt), { dateStyle: "medium", timeStyle: "short" })}>
                    {format.relativeTime(new Date(g.startedAt), now)}
                  </td>
                  <td>{g.code ?? "–"}</td>
                  <td>
                    {t(`games.${g.game}.name`)} · {t(`modes.${g.mode}.name`)} · {t("admin.games.level", { level: g.difficulty })}
                  </td>
                  <td>{format.number(g.players.length)}</td>
                  <td>
                    {g.players.map((p, i) => (
                      <span key={`${g.id}-${i}`}>
                        {i > 0 ? ", " : null}
                        {player(p)}
                      </span>
                    ))}
                  </td>
                  <td>{duration(g)}</td>
                  <td>
                    <Link href={`/report/${g.id}`}>{t("admin.solo.report")}</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="muted">{t("admin.games.history.empty")}</p>
      )}
      {pages > 1 ? (
        <p className="actions">
          {page > 0 ? (
            <Link className="btn ghost" href={{ pathname: "/admin/games", query: { page: page - 1 }, hash: "history" }}>
              {t("admin.games.history.previous")}
            </Link>
          ) : null}
          <span className="muted">{t("admin.games.history.page", { page: page + 1, pages })}</span>
          {page + 1 < pages ? (
            <Link className="btn ghost" href={{ pathname: "/admin/games", query: { page: page + 1 }, hash: "history" }}>
              {t("admin.games.history.next")}
            </Link>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}
