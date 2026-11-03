import { useFormatter, useLocale, useTranslations } from "next-intl";
import type { DailyBoard, DailyBoardEntry } from "@calculus/db";
import { DAILY_ROUNDS, shiftDailyDate } from "@calculus/game-core";
import { Link } from "@/i18n/navigation";
import { formatSeconds } from "@/lib/format";

/** Classement d'un jour, avec des liens vers les jours voisins. */
export function DailyBoardView({ board, today, viewerId }: { board: DailyBoard; today: string; viewerId: string | null }) {
  const t = useTranslations("daily");
  const format = useFormatter();
  const previous = shiftDailyDate(board.date, -1);
  const next = shiftDailyDate(board.date, 1);
  // Midi UTC : le même jour quel que soit le fuseau de l'affichage.
  const day = format.dateTime(new Date(`${board.date}T12:00:00Z`), { dateStyle: "full", timeZone: "UTC" });
  const meInTop = board.me != null && board.top.some((e) => e.userId === board.me!.userId);
  return (
    <div className="stack" id="daily-board">
      <h2 className="h3">{board.date === today ? t("boardToday") : t("boardOf", { day })}</h2>
      {board.date === today ? <p className="muted">{t("boardRule")}</p> : null}
      {board.top.length ? <BoardTable entries={board.top} viewerId={viewerId} label={t("boardLabel", { day })} champion={board.settled} /> : <p className="muted">{t("boardEmpty")}</p>}
      {board.me && !meInTop ? <BoardTable entries={[board.me]} viewerId={viewerId} label={t("boardMe")} champion={false} /> : null}
      <nav className="daily-days" aria-label={t("daysLabel")}>
        <Link href={{ pathname: "/daily", query: { date: previous } }}>{t("previousDay")}</Link>
        {board.date !== today ? <Link href={next === today ? "/daily" : { pathname: "/daily", query: { date: next } }}>{t("nextDay")}</Link> : null}
      </nav>
    </div>
  );
}

function BoardTable({ entries, viewerId, label, champion }: { entries: DailyBoardEntry[]; viewerId: string | null; label: string; champion: boolean }) {
  const t = useTranslations();
  const locale = useLocale();
  return (
    <div className="scroll-x">
      <table className="games board" aria-label={label}>
        <thead>
          <tr>
            <th>{t("leaderboard.rank")}</th>
            <th>{t("leaderboard.player")}</th>
            <th>{t("daily.correct")}</th>
            <th>{t("daily.time")}</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => (
            <tr key={e.userId} className={e.userId === viewerId ? "me" : undefined}>
              <td className="rk">{e.rank}</td>
              <td>
                <Link className="player-link" href={`/player/${e.userId}`}>
                  {e.name}
                </Link>
                {champion && e.rank === 1 && e.correct > 0 ? <span title={t("achievements.daily-champion.name")}> 🏆</span> : null}
                {e.userId === viewerId ? <span className="muted"> {t("leaderboard.you")}</span> : null}
              </td>
              <td>
                <strong>
                  {e.correct}/{DAILY_ROUNDS}
                </strong>
              </td>
              <td>{formatSeconds(e.totalTimeMs, locale)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
