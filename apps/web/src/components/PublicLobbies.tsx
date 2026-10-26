"use client";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { PUBLIC_LOBBY_DURATION_MS, type PublicLobbyInfo } from "@calculus/game-core";
import { Link } from "@/i18n/navigation";
import { fetchPublicLobbies } from "@/lib/colyseus";
import { formatCountdown } from "@/lib/format";

/** Intervalle entre deux mises à jour de la liste, en ms. */
const POLL_MS = 3000;

/**
 * Lobbys publics de l'accueil : générés par le serveur, sans hôte, ils se lancent seuls
 * au bout de deux minutes ou dès qu'ils sont pleins, puis d'autres les remplacent.
 */
export function PublicLobbies() {
  const t = useTranslations();
  const [lobbies, setLobbies] = useState<PublicLobbyInfo[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  /** Écart entre l'horloge du serveur et la nôtre, en ms. */
  const offset = useRef(0);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController();
    const load = async () => {
      try {
        const list = await fetchPublicLobbies(controller.signal);
        if (!alive) return;
        offset.current = list.serverNow - Date.now();
        setLobbies(list.lobbies);
        setFailed(false);
      } catch {
        if (alive) setFailed(true);
      }
      if (alive) timer = setTimeout(load, POLL_MS);
    };
    void load();
    return () => {
      alive = false;
      clearTimeout(timer);
      controller.abort();
    };
  }, []);

  // Compte à rebours de chaque lobby.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const serverNow = now + offset.current;

  return (
    <aside className="public-lobbies" aria-labelledby="public-lobbies-title">
      <div className="public-lobbies-head">
        <h2 id="public-lobbies-title">{t("publicLobbies.title")}</h2>
        <span className="tag">{t("publicLobbies.kicker")}</span>
      </div>
      {lobbies === null || lobbies.length === 0 ? (
        <p className="muted">{failed ? t("publicLobbies.unavailable") : t("publicLobbies.loading")}</p>
      ) : (
        <ul className="lobby-cards" data-testid="public-lobbies">
          {lobbies.map((l) => {
            const left = Math.max(0, l.startsAt - serverNow);
            const elapsed = Math.min(1, 1 - left / PUBLIC_LOBBY_DURATION_MS);
            return (
              <li key={l.code}>
                <Link className="lobby-card" href={`/lobby/${l.code}`}>
                  <span className="lobby-card-title">
                    {t(`games.${l.settings.game}.name`)} · {t(`modes.${l.settings.mode}.name`)}
                  </span>
                  <span className="lobby-card-meta">
                    {t(`settings.${l.settings.turnStyle}`)} · {t("game.level", { n: l.settings.difficulty })} · {t(`levels.${l.settings.difficulty}`)}
                  </span>
                  <span className="lobby-card-row">
                    <span className="lobby-dots" aria-hidden="true">
                      {Array.from({ length: l.maxPlayers }, (_, i) => (
                        <span key={i} className={i < l.players ? "on" : undefined} />
                      ))}
                    </span>
                    <span className="lobby-card-players">{t("lobby.players", { count: l.players, max: l.maxPlayers })}</span>
                  </span>
                  <span className="lobby-card-row">
                    <span className="lobby-card-bar" aria-hidden="true">
                      <span style={{ transform: `scaleX(${elapsed})` }} />
                    </span>
                    <span className="lobby-card-time">
                      {left > 0 ? t("publicLobbies.startsIn", { time: formatCountdown(left) }) : t("publicLobbies.starting")}
                    </span>
                  </span>
                  <span className="lobby-card-join">{t("publicLobbies.join")}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      <p className="note">{t("publicLobbies.rule")}</p>
    </aside>
  );
}
