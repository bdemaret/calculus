"use client";
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import type { Room } from "colyseus.js";
import { GAMES, MAX_PLAYERS, type RoomSnapshot } from "@calculus/game-core";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { leaveLobby, readCurrentLobby, readRoom, subscribeCurrentLobby, subscribeRoom } from "@/lib/colyseus";
import { formatCountdown } from "@/lib/format";

/** Phases où l'on attend une partie (salle d'attente, ou rapport avant la suivante). */
const WAITING = new Set<RoomSnapshot["phase"]>(["lobby", "finished"]);

/**
 * Bandeau du lobby en cours, sur toutes les pages sauf celle du lobby : la connexion reste ouverte
 * pendant qu'on navigue, et on y est ramené dès que la partie se lance.
 */
export function LobbyBanner() {
  const room = useSyncExternalStore(subscribeCurrentLobby, readCurrentLobby, () => null);
  return room ? <CurrentLobby room={room} /> : null;
}

function CurrentLobby({ room }: { room: Room }) {
  const t = useTranslations();
  const router = useRouter();
  const pathname = usePathname();
  const state = useSyncExternalStore(
    (cb) => subscribeRoom(room, cb),
    () => readRoom(room),
    () => null,
  );
  const snap = state?.snapshot ?? null;
  const lobbyPath = `/lobby/${room.roomId}`;
  const away = pathname.toUpperCase() !== lobbyPath.toUpperCase();
  const phase = snap?.phase ?? null;
  const lastPhase = useRef(phase);

  useEffect(() => {
    const before = lastPhase.current;
    lastPhase.current = phase;
    if (!away || !phase) return;
    // La partie démarre (compte à rebours de 3 s) : retour au lobby pour ne rien manquer.
    if (before && WAITING.has(before) && !WAITING.has(phase)) router.push(lobbyPath);
    // Un lobby public ne rejoue pas : une fois parti de son rapport, on le quitte.
    else if (phase === "finished" && snap?.isPublic) leaveLobby();
  }, [phase, away, lobbyPath, router, snap?.isPublic]);

  if (!away || !snap || !state || state.left) return null;

  const me = state.playerId;
  const isHost = !!me && snap.hostId === me;
  const { game, mode, difficulty } = snap.settings;
  const connected = snap.players.filter((p) => p.connected).length;
  const enoughPlayers = connected >= GAMES[game].minPlayers;

  let status: ReactNode;
  if (!WAITING.has(snap.phase)) status = t("lobbyBanner.inProgress");
  else if (snap.phase === "finished") status = t("lobbyBanner.nextGame");
  else if (snap.isPublic) status = <AutoStart at={snap.autoStartAt} clockOffset={state.clockOffset} />;
  else if (!enoughPlayers) status = t("lobbyBanner.needPlayers", { count: GAMES[game].minPlayers });
  else status = isHost ? t("lobbyBanner.youStart") : t("lobbyBanner.waitingHost");

  return (
    <div className="lobby-banner" role="status" data-testid="lobby-banner">
      <div className="lobby-banner-info">
        <strong>{t("lobbyBanner.title", { code: snap.code })}</strong>
        <span className="muted">
          {[
            t(`games.${game}.name`),
            GAMES[game].modes.length > 1 ? t(`modes.${mode}.name`) : null,
            t("game.level", { n: difficulty }),
            t("lobby.players", { count: connected, max: MAX_PLAYERS }),
          ]
            .filter(Boolean)
            .join(" · ")}
        </span>
        <span className="lobby-banner-status">{status}</span>
      </div>
      <span className="actions">
        {isHost && snap.phase === "lobby" && !snap.isPublic ? (
          <button className="btn" type="button" disabled={!enoughPlayers} onClick={() => room.send("start", {})}>
            {t("lobby.start")}
          </button>
        ) : null}
        <Link className={isHost && snap.phase === "lobby" && !snap.isPublic ? "btn ghost" : "btn"} href={lobbyPath}>
          {t("lobbyBanner.back")}
        </Link>
        <button className="link-btn" type="button" onClick={leaveLobby}>
          {t("lobbyBanner.leave")}
        </button>
      </span>
    </div>
  );
}

/** Temps restant avant le lancement automatique d'un lobby public. */
export function AutoStart({ at, clockOffset }: { at: number | null; clockOffset: number }) {
  const t = useTranslations("lobby");
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const left = at === null ? 0 : at - clockOffset - now;
  return <span role="timer">{left > 0 ? t("autoStartIn", { time: formatCountdown(left) }) : t("autoStartSoon")}</span>;
}
