"use client";
import { useEffect, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import type { AdminSoloActivity, AdminSoloPlay } from "@calculus/db";
import { Link } from "@/i18n/navigation";

type Data = AdminSoloActivity & { serverNow: number };

/** Durée de rafraîchissement de la liste. */
const REFRESH_MS = 10_000;

/** Parties solo en cours et dernières parties, rafraîchies toutes les 10 s. */
export function SoloPlays({ initial }: { initial: Data }) {
  const t = useTranslations();
  const format = useFormatter();
  const [data, setData] = useState<Data>(initial);
  const [error, setError] = useState(false);
  // Heure affichée seulement après le premier rafraîchissement (évite un écart serveur / navigateur).
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);

  useEffect(() => {
    let stopped = false;
    const tick = async () => {
      const res = await fetch("/api/admin/solo", { cache: "no-store" }).catch(() => null);
      if (stopped) return;
      if (res?.ok) setData((await res.json()) as Data);
      setError(!res?.ok);
      setUpdatedAt(Date.now());
    };
    const id = setInterval(tick, REFRESH_MS);
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, []);

  const n = (x: number) => format.number(x);
  const since = (iso: string) => format.relativeTime(new Date(iso), new Date(data.serverNow));
  const duration = (p: AdminSoloPlay) => {
    const seconds = Math.max(0, Math.round((new Date(p.endedAt ?? p.lastSeenAt).getTime() - new Date(p.startedAt).getTime()) / 1000));
    return t("admin.solo.duration", { minutes: Math.floor(seconds / 60), seconds: String(seconds % 60).padStart(2, "0") });
  };
  const player = (p: AdminSoloPlay) =>
    p.user ? <Link href={`/admin/users/${p.user.id}`}>{p.user.name}</Link> : <span className="muted">{t("admin.solo.guest")}</span>;
  const what = (p: AdminSoloPlay) =>
    `${t(`games.${p.game}.name`)} · ${t(`modes.${p.mode}.name`)} · ${t("admin.games.level", { level: p.difficulty })}`;
  const d = data.last24Hours;

  return (
    <div className="stack">
      <div className="stats">
        <div className="stat">
          <span className="v">{n(data.live.length)}</span>
          <span className="k">{t("admin.solo.live")}</span>
        </div>
        <div className="stat">
          <span className="v">{n(d.started)}</span>
          <span className="k">{t("admin.solo.started24")}</span>
        </div>
        <div className="stat">
          <span className="v">{n(d.finished)}</span>
          <span className="k">{t("admin.solo.finished24")}</span>
        </div>
        <div className="stat">
          <span className="v">{n(d.players)}</span>
          <span className="k">{t("admin.solo.players24", { players: d.players, guests: d.guests })}</span>
        </div>
      </div>

      <p className="muted" aria-live="polite">
        {t("admin.solo.note")}
        {updatedAt != null ? ` · ${t("admin.games.updated", { time: format.dateTime(new Date(updatedAt), { timeStyle: "medium" }) })}` : null}
      </p>
      {error ? <p className="form-error">{t("admin.solo.error")}</p> : null}

      <h3>{t("admin.solo.liveTitle")}</h3>
      {data.live.length === 0 ? <p className="muted">{t("admin.solo.liveEmpty")}</p> : null}
      <ul className="admin-rooms">
        {data.live.map((p) => (
          <li key={p.id} className="panel admin-room">
            <div className="admin-room-head">
              <strong>{player(p)}</strong>
              <span className="admin-phase question">{t("admin.solo.status.live")}</span>
              <span className="muted">{what(p)}</span>
            </div>
            <p className="muted admin-room-meta">
              {t("admin.solo.startedAt", { since: since(p.startedAt) })} · {t("admin.solo.progress", { correct: p.correct, rounds: p.rounds })}
            </p>
          </li>
        ))}
      </ul>

      <h3>{t("admin.solo.recentTitle")}</h3>
      {data.recent.length ? (
        <div className="scroll-x">
          <table className="games">
            <thead>
              <tr>
                <th>{t("admin.solo.when")}</th>
                <th>{t("admin.solo.player")}</th>
                <th>{t("admin.solo.game")}</th>
                <th>{t("admin.solo.length")}</th>
                <th>{t("admin.solo.answers")}</th>
                <th>{t("admin.solo.state")}</th>
              </tr>
            </thead>
            <tbody>
              {data.recent.map((p) => (
                <tr key={p.id}>
                  <td title={format.dateTime(new Date(p.startedAt), { dateStyle: "medium", timeStyle: "short" })}>{since(p.startedAt)}</td>
                  <td>{player(p)}</td>
                  <td>{what(p)}</td>
                  <td>{duration(p)}</td>
                  <td>{t("admin.solo.progress", { correct: p.correct, rounds: p.rounds })}</td>
                  <td>
                    <span className={`admin-phase ${p.status}`}>{t(`admin.solo.status.${p.status}`)}</span>
                    {p.gameId ? (
                      <>
                        {" "}
                        <Link href={`/report/${p.gameId}`}>{t("admin.solo.report")}</Link>
                      </>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="muted">{t("admin.solo.recentEmpty")}</p>
      )}
    </div>
  );
}
