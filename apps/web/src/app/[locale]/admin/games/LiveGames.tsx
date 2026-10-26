"use client";
import { useEffect, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import type { AdminRoomSummary } from "@calculus/game-core";
import { Avatar } from "@/components/PlayerChips";

type Live = { rooms: AdminRoomSummary[]; serverNow: number } | null;

/** Durée de rafraîchissement de la liste des parties en cours. */
const REFRESH_MS = 5000;

/** Parties en cours sur le serveur de jeu, rafraîchies toutes les 5 s. */
export function LiveGames({ initial }: { initial: Live }) {
  const t = useTranslations();
  const format = useFormatter();
  const [live, setLive] = useState<Live>(initial);
  // Heure affichée seulement après le premier rafraîchissement (évite un écart serveur / navigateur).
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);

  useEffect(() => {
    let stopped = false;
    const tick = async () => {
      const res = await fetch("/api/admin/rooms", { cache: "no-store" }).catch(() => null);
      if (stopped) return;
      setLive(res?.ok ? ((await res.json()) as Live) : null);
      setUpdatedAt(Date.now());
    };
    const id = setInterval(tick, REFRESH_MS);
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, []);

  if (!live) return <p className="form-error">{t("admin.games.unreachable")}</p>;

  // Parties lancées d'abord, puis lobbies, les plus récents en tête.
  const rooms = [...live.rooms].sort(
    (a, b) => Number(a.phase === "lobby") - Number(b.phase === "lobby") || b.createdAt - a.createdAt,
  );
  const players = rooms.reduce((sum, r) => sum + r.players.length, 0);
  const since = (ms: number) => format.relativeTime(new Date(ms), new Date(live.serverNow));

  return (
    <div className="stack">
      <p className="muted" aria-live="polite">
        {t("admin.games.summary", { rooms: rooms.length, players })}
        {updatedAt != null ? ` · ${t("admin.games.updated", { time: format.dateTime(new Date(updatedAt), { timeStyle: "medium" }) })}` : null}
      </p>
      {rooms.length === 0 ? <p className="muted">{t("admin.games.empty")}</p> : null}
      <ul className="admin-rooms">
        {rooms.map((r) => (
          <li key={r.code} className="panel admin-room">
            <div className="admin-room-head">
              <strong className="admin-code">{r.code}</strong>
              <span className={`admin-phase ${r.phase}`}>{t(`admin.games.phase.${r.phase}`)}</span>
              <span className="muted">
                {t(`games.${r.game}.name`)} · {t(`modes.${r.mode}.name`)} · {t("admin.games.level", { level: r.difficulty })}
              </span>
            </div>
            <p className="muted admin-room-meta">
              {r.startedAt != null
                ? t("admin.games.startedAt", { since: since(r.startedAt), game: r.gameNumber })
                : t("admin.games.openedAt", { since: since(r.createdAt) })}
              {r.phase === "question" || r.phase === "round-result"
                ? ` · ${t("admin.games.round", { round: r.roundIndex + 1, total: r.totalRounds ?? "∞" })}`
                : null}
              {r.question ? (
                <>
                  {" · "}
                  <span className="admin-question">{r.question}</span>
                </>
              ) : null}
            </p>
            <ul className="players">
              {r.players.map((p) => (
                <li key={p.id} className={`chip${p.alive ? "" : " out"}`}>
                  <Avatar name={p.name} />
                  <span className="nm">{p.name}</span>
                  {r.phase !== "lobby" ? <span className="pts">{p.score}</span> : null}
                  {p.isHost ? <span className="tag-mini">{t("admin.games.host")}</span> : null}
                  {p.isGuest ? <span className="tag-mini">{t("admin.games.guest")}</span> : null}
                  {!p.connected ? <span className="tag-mini ko">{t("admin.games.disconnected")}</span> : null}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  );
}
