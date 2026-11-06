"use client";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { Room } from "colyseus.js";
import {
  BAG_SIZE,
  DIFFICULTIES,
  DUNGEON_FLOORS,
  ITEM_USE,
  DUNGEON_LOOT_MS,
  DUNGEON_MAX_LIVES,
  DUNGEON_POSITIONING_MS,
  DUNGEON_RESULT_MS,
  DUNGEON_ROUNDS,
  type Difficulty,
  type DungeonSnapshot,
  type DungeonSummary,
  type DungeonView,
  type FightStatus,
  type ItemId,
} from "@calculus/game-core";
import { Link, useRouter } from "@/i18n/navigation";
import { CalcLine } from "@/components/CalcLine";
import { UnlockedBlock } from "@/components/GameReportView";
import { InviteFriends } from "@/components/InviteFriends";
import { Margin, MarginNote } from "@/components/Margin";
import { PlayerTitle } from "@/components/PlayerTitle";
import { TimerBar } from "@/components/TimerBar";
import { ChestIcon, EnemyArt, Heart, ItemIcon, SealIcon, SwordsIcon } from "../DungeonArt";
import { answerFromInput } from "@/lib/answer";
import {
  JoinError,
  joinDungeon,
  keepDungeon,
  leaveDungeon,
  readCurrentDungeon,
  readDungeon,
  releaseDungeon,
  subscribeCurrentDungeon,
  subscribeDungeon,
  type DungeonState,
} from "@/lib/dungeon";
import { formatSeconds } from "@/lib/format";
import { celebrate, sfx } from "@/lib/sound";
import { local } from "@/lib/storage";
import { useGameOnScreen } from "@/lib/useGameOnScreen";

/** Page d'un donjon : salle d'attente, expédition et bilan, sur une seule connexion. */
export function DungeonClient({ code }: { code: string }) {
  const t = useTranslations();
  const router = useRouter();
  const [room, setRoom] = useState<Room | null>(null);
  const [error, setError] = useState<string | null>(null);

  const connect = useCallback(() => {
    setError(null);
    joinDungeon(code)
      .then(setRoom)
      .catch((err) => setError(err instanceof JoinError ? err.code : "generic"));
  }, [code]);

  useEffect(() => {
    connect();
    // Quitter la page quitte le donjon (sauf remontage immédiat, en développement).
    return () => releaseDungeon();
  }, [connect]);

  // Après une coupure, la reprise remplace la salle : la page la suit.
  useEffect(
    () =>
      subscribeCurrentDungeon(() => {
        const current = readCurrentDungeon();
        if (current?.roomId === code) {
          keepDungeon();
          setRoom(current);
        }
      }),
    [code],
  );

  const leave = () => {
    leaveDungeon();
    router.push("/dungeon");
  };

  if (error) {
    return (
      <section className="empty-state">
        <h2>{t("dungeon.cannotJoin", { code })}</h2>
        <p className="muted">{t(`errors.${error}`)}</p>
        <div className="actions">
          <button className="btn" type="button" onClick={connect}>
            {t("common.retry")}
          </button>
          <Link className="btn ghost" href="/dungeon">
            {t("dungeon.back")}
          </Link>
        </div>
      </section>
    );
  }
  if (!room) return <p className="status">{t("lobby.connecting")}</p>;
  return <ConnectedDungeon room={room} onLeave={leave} />;
}

function useDungeonState(room: Room): DungeonState | null {
  return useSyncExternalStore(
    (cb) => subscribeDungeon(room, cb),
    () => readDungeon(room),
    () => null,
  );
}

/** Heure locale, rafraîchie tant que `active` est vrai. */
function useNow(active: boolean, every = 200): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), every);
    return () => clearInterval(id);
  }, [active, every]);
  return now;
}

function ConnectedDungeon({ room, onLeave }: { room: Room; onLeave: () => void }) {
  const t = useTranslations();
  const state = useDungeonState(room);
  const snap = state?.snapshot ?? null;
  const me = state?.playerId ?? null;

  if (state?.left) {
    return (
      <section className="empty-state">
        <h2>{t("lobby.disconnectedTitle")}</h2>
        <p className="muted">{t("lobby.disconnectedText")}</p>
        <Link className="btn" href="/dungeon">
          {t("dungeon.back")}
        </Link>
      </section>
    );
  }
  if (!snap || !state) return <p className="status">{t("lobby.connecting")}</p>;
  if (snap.phase === "lobby") return <DungeonLobby room={room} snap={snap} state={state} me={me} onLeave={onLeave} />;
  if (snap.phase === "countdown") return <Countdown snap={snap} state={state} />;
  if (snap.phase === "finished" || !snap.game) return <DungeonFinished room={room} snap={snap} me={me} onLeave={onLeave} />;
  return <DungeonGame room={room} snap={snap} game={snap.game} state={state} me={me} onLeave={onLeave} />;
}

/* ------------------------------------------------------------------ */
/* Salle d'attente                                                       */
/* ------------------------------------------------------------------ */

function DungeonLobby({
  room,
  snap,
  state,
  me,
  onLeave,
}: {
  room: Room;
  snap: DungeonSnapshot;
  state: DungeonState;
  me: string | null;
  onLeave: () => void;
}) {
  const t = useTranslations();
  const [copied, setCopied] = useState<"code" | "link" | null>(null);
  const isHost = snap.hostId === me;
  const present = snap.members.filter((m) => m.connected).length;
  const enough = present >= snap.minPlayers;
  const now = useNow(!!state.lastError, 500);
  const refusedStart = state.lastError?.code === "not-enough-players" && now - state.lastError.at < 4000;

  const copy = async (what: "code" | "link") => {
    const text = what === "code" ? snap.code : window.location.href;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      setTimeout(() => setCopied(null), 1600);
    } catch {
      window.prompt?.(text);
    }
  };

  const setDifficulty = (difficulty: Difficulty) => {
    local.set("dungeon", { difficulty });
    room.send("settings", { difficulty });
  };

  return (
    <section className="lobby dungeon-lobby">
      <Margin>
        <MarginNote value={t("dungeon.lobbyMargin")} />
      </Margin>
      <div className="stack">
        <h1>{t("dungeon.lobbyTitle")}</h1>
        <div>
          <p className="muted">{t("lobby.code")}</p>
          <div className="actions">
            <div className="code-boxes" aria-label={t("lobby.codeAria", { code: snap.code })}>
              {[...snap.code].map((c, i) => (
                <span key={i}>{c}</span>
              ))}
            </div>
            <button className="btn ghost" type="button" onClick={() => copy("code")}>
              {copied === "code" ? t("lobby.copied") : t("lobby.copy")}
            </button>
            <button className="link-btn" type="button" onClick={() => copy("link")}>
              {copied === "link" ? t("lobby.linkCopied") : t("lobby.copyLink")}
            </button>
          </div>
        </div>

        <div className="stack" style={{ gap: 8 }}>
          <h3>
            {t("lobby.players", {
              count: snap.members.length,
              max: snap.maxPlayers,
            })}
          </h3>
          <div className="slots">
            {Array.from({ length: snap.maxPlayers }, (_, i) => {
              const m = snap.members[i];
              if (!m)
                return (
                  <div className="slot empty" key={`e${i}`}>
                    {t("lobby.free")}
                  </div>
                );
              return (
                <div className="slot filled" key={m.id} style={m.connected ? undefined : { opacity: 0.5 }}>
                  <Token name={m.name} seat={i} />
                  <span className="slot-name">
                    <span className="nm">{m.name}</span>
                    <PlayerTitle title={m.title} />
                  </span>
                  {m.isHost ? (
                    <span className="host">{t("lobby.host")}</span>
                  ) : isHost ? (
                    <button
                      className="link-btn"
                      type="button"
                      style={{ marginLeft: "auto", fontSize: 13 }}
                      onClick={() => room.send("kick", { playerId: m.id })}
                    >
                      {t("lobby.kick")}
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>

        {snap.members.length < snap.maxPlayers ? (
          <InviteFriends code={snap.code} presentIds={snap.members.map((m) => m.id)} kind="dungeon" />
        ) : null}
      </div>

      <div className="stack">
        <h3>{t("dungeon.difficulty")}</h3>
        <div className="dungeon-levels" role="radiogroup" aria-label={t("dungeon.difficulty")}>
          {DIFFICULTIES.map((d) => (
            <button
              key={d}
              type="button"
              role="radio"
              aria-checked={snap.settings.difficulty === d}
              className={`dungeon-level${snap.settings.difficulty === d ? " on" : ""}`}
              disabled={!isHost}
              onClick={() => setDifficulty(d)}
            >
              <span className="dungeon-level-n">{d}</span> {t(`levels.${d}`)}
            </button>
          ))}
        </div>
      </div>

      <div className="lobby-dock">
        <div className="actions">
          {isHost ? (
            <button className="btn" type="button" disabled={!enough} onClick={() => room.send("start", {})}>
              {t("dungeon.start")}
            </button>
          ) : null}
          <button className="btn ghost" type="button" onClick={onLeave}>
            {t("dungeon.leave")}
          </button>
        </div>
        <p className="note">
          {!enough || refusedStart
            ? t("dungeon.notEnough", { count: snap.minPlayers })
            : isHost
              ? t("dungeon.hostHint")
              : t("lobby.waitingHost")}
        </p>
      </div>
    </section>
  );
}

function Countdown({ snap, state }: { snap: DungeonSnapshot; state: DungeonState }) {
  const t = useTranslations();
  const now = useNow(true, 100);
  useGameOnScreen(true);
  const deadline = snap.deadline !== null ? snap.deadline - state.clockOffset : now;
  const left = Math.max(1, Math.ceil((deadline - now) / 1000));
  useEffect(() => sfx.tick(), [left]);
  return (
    <section className="game dungeon-game">
      <p className="status">
        {t("dungeon.entering", {
          level: t(`levels.${snap.settings.difficulty}`),
        })}
      </p>
      <div className="game-row">
        <span className="count" key={left}>
          {left}
        </span>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Expédition                                                            */
/* ------------------------------------------------------------------ */

function DungeonGame({
  room,
  snap,
  game,
  state,
  me,
  onLeave,
}: {
  room: Room;
  snap: DungeonSnapshot;
  game: DungeonView;
  state: DungeonState;
  me: string | null;
  onLeave: () => void;
}) {
  const t = useTranslations();
  useGameOnScreen(true);
  const [inspected, setInspected] = useState<string | null>(null);
  const [keyMode, setKeyMode] = useState(false);
  const meP = game.players.find((p) => p.id === me) ?? null;
  const roomOf = (key: string | undefined | null) => game.rooms.find((r) => r.key === key) ?? null;
  const nameOf = (id: string) => game.players.find((p) => p.id === id)?.name ?? "?";
  const lastPhase = useRef("");

  useEffect(() => {
    const key = `${game.phase}:${game.round}`;
    if (key === lastPhase.current) return;
    lastPhase.current = key;
    if (game.phase === "positioning" || game.phase === "boss") sfx.go();
    if (game.phase !== "positioning") setKeyMode(false);
  }, [game.phase, game.round]);

  // Fiche montrée sous la carte : la salle survolée, sinon celle qu'on affronte ou qu'on a choisie.
  const myRoom = roomOf(meP?.fight?.roomKey ?? meP?.pick);
  const shown = roomOf(inspected) ?? myRoom;
  const phaseTotal = game.phase === "positioning" ? DUNGEON_POSITIONING_MS : game.phase === "loot" ? DUNGEON_LOOT_MS : DUNGEON_RESULT_MS;
  const localDeadline = snap.deadline !== null ? snap.deadline - state.clockOffset : null;
  const exploring = game.phase !== "boss";
  const roundLabel = exploring
    ? t("dungeon.roundOf", {
        n: Math.min(game.round + 1, DUNGEON_FLOORS),
        total: DUNGEON_FLOORS,
      })
    : t("dungeon.bossRound");

  const onRoom = (key: string) => {
    if (keyMode) {
      room.send("use-item", { item: "key", target: key });
      setKeyMode(false);
      return;
    }
    room.send("pick", { room: key });
  };

  return (
    <section className="game dungeon-game" data-testid="dungeon-game" data-phase={game.phase}>
      <Margin>
        <MarginNote value={`${game.round + 1}/${DUNGEON_ROUNDS}`} label={t("game.round")} />
        <MarginNote value={<span className="grade">{game.score}</span>} label={t("dungeon.score")} />
      </Margin>
      <header className="dungeon-hud">
        <span className="dungeon-round">{roundLabel}</span>
        <span className="dungeon-phase">{t(`dungeon.phase.${game.phase}`)}</span>
        {exploring ? (
          <span className={`dungeon-goal${game.bossReached ? " reached" : ""}`}>
            {game.bossReached ? t("dungeon.goalReached") : t("dungeon.goal")}
          </span>
        ) : null}
        {game.sealsTotal > 0 ? (
          <span className="dungeon-seals" title={t("dungeon.sealsHint")}>
            <SealIcon />{" "}
            {t("dungeon.seals", {
              broken: game.sealsBroken,
              total: game.sealsTotal,
            })}
          </span>
        ) : null}
        {meP ? <Lives lives={meP.lives} /> : null}
      </header>
      {state.reconnecting ? <p className="status">{t("lobby.reconnecting")}</p> : null}

      {game.phase === "positioning" || game.phase === "loot" || game.phase === "round-result" ? (
        <TimerBar deadline={localDeadline} totalMs={phaseTotal} />
      ) : null}

      {/* En combat, le calcul passe avant la carte : il doit rester sous les yeux (et au-dessus du pavé sur téléphone). */}
      {game.phase === "combat" ? <CombatStage room={room} game={game} state={state} me={me} target={myRoom} /> : null}

      {game.phase === "boss" ? (
        <BossStage room={room} game={game} state={state} me={me} />
      ) : (
        <>
          <DungeonMap
            game={game}
            me={me}
            canPick={game.phase === "positioning" && !!meP?.standing && (!meP.locked || keyMode)}
            keyMode={keyMode}
            onPick={onRoom}
            onInspect={setInspected}
          />
          {shown ? <RoomCard room={shown} /> : <p className="note">{t("dungeon.inspectHint")}</p>}
        </>
      )}

      {game.phase === "positioning" ? (
        <div className="dungeon-panel">
          {keyMode ? (
            <p className="dungeon-keymode">{t("dungeon.keyMode")}</p>
          ) : !meP?.standing ? (
            <p>{t("dungeon.downWatching")}</p>
          ) : meP.locked ? (
            <p>{t("dungeon.locked")}</p>
          ) : (
            <div className="actions">
              <button className="btn" type="button" disabled={meP.pick === null} onClick={() => room.send("lock", {})}>
                {t("dungeon.lock")}
              </button>
              <span className="note">{meP.pick === null ? t("dungeon.pickHint") : t("dungeon.lockHint")}</span>
            </div>
          )}
        </div>
      ) : null}

      {meP && !meP.gone ? <BagBar room={room} game={game} me={meP} keyMode={keyMode} setKeyMode={setKeyMode} /> : null}
      {game.phase === "loot" ? <LootStage room={room} game={game} me={me} roomOf={roomOf} /> : null}
      {game.phase === "round-result" && game.lastRound ? <RoundResult game={game} roomOf={roomOf} nameOf={nameOf} me={me} /> : null}

      <TeamList game={game} me={me} roomOf={roomOf} />
      <div className="actions">
        <button className="link-btn" type="button" onClick={onLeave}>
          {t("game.quit")}
        </button>
      </div>
    </section>
  );
}

function Lives({ lives, max = DUNGEON_MAX_LIVES }: { lives: number; max?: number }) {
  const t = useTranslations("dungeon");
  // Au moins trois cases : les vies perdues se voient (cœurs vides) ; au-delà, seulement les cœurs gagnés.
  const shown = Math.min(max, Math.max(lives, 3));
  return (
    <span className={`dungeon-lives${lives <= 0 ? " down" : ""}`} role="img" aria-label={t("livesAria", { count: lives })}>
      {Array.from({ length: shown }, (_, i) => (
        <Heart key={i} empty={i >= lives} />
      ))}
    </span>
  );
}

/** Pion d'un joueur : l'initiale sur la couleur de sa place (ordre d'arrivée). */
function Token({ name, seat }: { name: string; seat: number }) {
  return (
    <span className="dg-token" data-seat={seat % 4} aria-hidden="true">
      {name.trim().slice(0, 1).toUpperCase() || "?"}
    </span>
  );
}

type RoomV = DungeonView["rooms"][number];

/** L'image d'une salle selon ce qu'on en sait : portrait, coffre, sceau, lames croisées (ennemi dans l'ombre) ou rien. */
function RoomFace({ room }: { room: RoomV }) {
  if (room.visibility === "hidden") return <span className="room-unknown">?</span>;
  if (room.kind === "chest") return <ChestIcon />;
  if (room.visibility === "type") return room.kind === "seal" ? <SealIcon /> : <SwordsIcon />;
  return (
    <span className="room-face">
      {room.enemy ? <EnemyArt enemy={room.enemy} /> : null}
      {room.kind === "seal" ? <SealIcon className="badge" /> : null}
    </span>
  );
}

/** Nom d'une salle selon le brouillard. */
function useRoomName() {
  const t = useTranslations("dungeon");
  return (room: RoomV) =>
    room.visibility === "hidden"
      ? t("kinds.unknown")
      : room.kind === "chest"
        ? t("kinds.chest")
        : room.visibility === "type"
          ? t(`kinds.${room.kind === "seal" ? "seal" : "enemy"}`)
          : room.enemy
            ? t(`enemies.${room.enemy}.name`)
            : t("kinds.chest");
}

/** Lignes de la carte : la salle du boss en haut (0), puis les étages 4 à 1. */
const MAP_ROWS = DUNGEON_FLOORS + 1;
const rowOf = (floor: number) => MAP_ROWS - floor;
/** Hauteur d'une ligne dans le repère du SVG (largeur 100). */
const ROW_UNITS = 20;

/**
 * Position d'une salle dans le repère du SVG : `x` de la carte, et un léger décalage vertical propre à la salle
 * (toujours le même) pour que les étages ne forment pas une grille trop sage.
 */
function roomPoint(room: { key: string; floor: number; x: number }): {
  x: number;
  y: number;
} {
  const index = Number(room.key.split("-")[1] ?? 0);
  const jitter = (((index * 7 + room.floor * 3) % 4) - 2) * 0.05; // de −0,1 à +0,05 ligne : le nom reste dans sa bande
  return { x: room.x * 100, y: (rowOf(room.floor) + 0.5 + jitter) * ROW_UNITS };
}

/** Couloir courbe entre deux salles (une courbe en S, verticale aux deux bouts). */
function corridor(a: { x: number; y: number }, b: { x: number; y: number }): string {
  const my = (a.y + b.y) / 2;
  return `M ${a.x} ${a.y} C ${a.x} ${my}, ${b.x} ${my}, ${b.x} ${b.y}`;
}

/**
 * La carte : salles rondes reliées par des couloirs courbes, étages en bandes, la porte du boss en haut.
 * Les couloirs entre deux salles encore dans le noir restent à peine visibles (ils encombraient la carte).
 */
function DungeonMap({
  game,
  me,
  canPick,
  keyMode,
  onPick,
  onInspect,
}: {
  game: DungeonView;
  me: string | null;
  canPick: boolean;
  keyMode: boolean;
  onPick: (key: string) => void;
  onInspect: (key: string | null) => void;
}) {
  const t = useTranslations("dungeon");
  const name = useRoomName();
  const seatOf = (id: string) => game.players.findIndex((p) => p.id === id);
  const byKey = new Map(game.rooms.map((r) => [r.key, r]));
  const boss = { x: 50, y: 0.5 * ROW_UNITS };
  const lit = (r: RoomV) => r.cleared || r.accessible;
  const paths: { key: string; d: string; state: string }[] = [];
  for (const r of game.rooms) {
    const from = roomPoint(r);
    for (const k of r.links) {
      const to = byKey.get(k);
      if (!to) continue;
      const state =
        r.cleared && to.cleared
          ? "walked"
          : r.cleared || (r.floor === 1 && lit(r))
            ? "open"
            : r.visibility === "hidden" && to.visibility === "hidden"
              ? "lost"
              : "dark";
      paths.push({
        key: `${r.key}>${k}`,
        d: corridor(from, roomPoint(to)),
        state,
      });
    }
    if (r.bossLink) {
      const state = r.cleared ? "boss-open" : r.visibility === "hidden" ? "lost" : "boss";
      paths.push({ key: `${r.key}>boss`, d: corridor(from, boss), state });
    }
  }
  // Les couloirs éclairés par-dessus les autres.
  const order = ["lost", "dark", "boss", "open", "walked", "boss-open"];
  paths.sort((a, b) => order.indexOf(a.state) - order.indexOf(b.state));
  return (
    <div className="dungeon-map" data-testid="dungeon-map" style={{ ["--rows" as string]: MAP_ROWS }}>
      {/* Le terrain : tout y est placé en %, avec une marge en bas pour les noms du premier étage. */}
      <div className="dungeon-map-field">
        {Array.from({ length: DUNGEON_FLOORS }, (_, i) => i + 1).map((floor) => (
          <div
            key={floor}
            className="dungeon-floor-band"
            data-floor={floor}
            style={{
              top: `${(rowOf(floor) / MAP_ROWS) * 100}%`,
              height: `${100 / MAP_ROWS}%`,
            }}
            aria-hidden="true"
          >
            <span>{t("floor", { n: floor })}</span>
          </div>
        ))}
        <svg className="dungeon-paths" viewBox={`0 0 100 ${MAP_ROWS * ROW_UNITS}`} preserveAspectRatio="none" aria-hidden="true">
          {paths.map((p) => (
            <g key={p.key} data-state={p.state}>
              <path className="corridor" d={p.d} vectorEffect="non-scaling-stroke" />
              <path className="trail" d={p.d} vectorEffect="non-scaling-stroke" />
            </g>
          ))}
        </svg>
        <div
          className={`dungeon-boss-room${game.bossReached ? " in-sight" : ""}`}
          style={{ left: "50%", top: `${(0.5 / MAP_ROWS) * 100}%` }}
        >
          <span className="dungeon-boss-gate">
            <EnemyArt enemy="boss" />
          </span>
          <span className="dungeon-boss-label">{t("boss.name")}</span>
        </div>
        {game.rooms.map((r) => {
          const here = game.players.filter((p) => p.fight?.roomKey === r.key || (game.phase === "positioning" && p.pick === r.key));
          const mine = here.some((p) => p.id === me);
          const pickable = canPick && r.accessible;
          const state = r.cleared ? "cleared" : r.accessible ? "front" : `fog-${r.visibility}`;
          const at = roomPoint(r);
          return (
            <button
              key={r.key}
              type="button"
              className={`dungeon-cell ${state}${mine ? " mine" : ""}${pickable ? " pickable" : ""}${keyMode && r.accessible ? " key-target" : ""}`}
              style={{
                left: `${at.x}%`,
                top: `${(at.y / (MAP_ROWS * ROW_UNITS)) * 100}%`,
              }}
              data-testid="dungeon-cell"
              data-state={state}
              data-kind={r.kind ?? "unknown"}
              data-room={r.key}
              aria-pressed={mine}
              aria-disabled={!pickable}
              aria-label={`${name(r)}, ${t("floor", { n: r.floor })}${r.cleared ? `, ${t("defeated")}` : ""}`}
              onMouseEnter={() => onInspect(r.key)}
              onMouseLeave={() => onInspect(null)}
              onFocus={() => onInspect(r.key)}
              onBlur={() => onInspect(null)}
              onClick={() => {
                onInspect(r.key);
                if (pickable) onPick(r.key);
              }}
            >
              <span className="dungeon-cell-disc">
                <RoomFace room={r} />
              </span>
              {r.visibility !== "hidden" ? <span className="dungeon-cell-name">{name(r)}</span> : null}
              {r.cleared ? (
                <span className="dungeon-cell-stamp" aria-hidden="true">
                  ✓
                </span>
              ) : null}
              {here.length ? (
                <span className="dungeon-cell-players">
                  {here.map((p) => (
                    <Token key={p.id} name={p.name} seat={seatOf(p.id)} />
                  ))}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Fiche d'une salle : ce qu'elle contient (selon le brouillard), ce qu'elle pose, ce qu'elle rapporte. */
function RoomCard({ room }: { room: RoomV }) {
  const t = useTranslations("dungeon");
  const locale = useLocale();
  const name = useRoomName();
  const known = room.visibility === "known";
  const desc =
    room.visibility === "hidden"
      ? t("kinds.unknownDesc")
      : room.kind === "chest"
        ? t("kinds.chestDesc")
        : !known
          ? t(room.kind === "seal" ? "kinds.sealShadowDesc" : "kinds.enemyDesc")
          : room.enemy
            ? t(`enemies.${room.enemy}.desc`)
            : t("kinds.chestDesc");
  return (
    <div className="dungeon-card" data-kind={room.kind ?? "unknown"}>
      <RoomFace room={room} />
      <div className="dungeon-card-body">
        <p className="dungeon-card-title">
          {name(room)} {known && room.tier ? <span className="dg-stars">{"★".repeat(room.tier)}</span> : null}
        </p>
        <p className="dungeon-card-floor">
          {t("floor", { n: room.floor })}
          {room.bossLink ? ` · ${t("kinds.bossDoor")}` : ""}
        </p>
        <p>{desc}</p>
        {known && room.kind === "seal" ? <p className="dungeon-card-seal">{t("kinds.sealDesc")}</p> : null}
        {known && room.enemy && room.count !== null && room.timeMs !== null ? (
          <ul className="dungeon-card-facts">
            {room.form === "shared" ? (
              <li>
                {t("cardHorde", {
                  count: room.count,
                  time: formatSeconds(room.totalMs ?? 0, locale),
                })}
              </li>
            ) : room.form === "regrow" ? (
              <li>
                {t("cardHydra", {
                  count: room.count,
                  time: formatSeconds(room.totalMs ?? 0, locale),
                })}
              </li>
            ) : (
              <li>
                {t("cardSeries", {
                  count: room.count,
                  time: formatSeconds(room.timeMs, locale),
                })}
              </li>
            )}
            {room.visibleMs !== null ? (
              <li>
                {t("cardVisible", {
                  time: formatSeconds(room.visibleMs, locale),
                })}
              </li>
            ) : null}
            {room.points ? <li>{t("cardPoints", { points: room.points })}</li> : null}
            {room.loot ? <li>{t("cardLoot")}</li> : null}
          </ul>
        ) : null}
      </div>
    </div>
  );
}

/** Coup porté ou raté au dernier accusé du serveur : sert à animer le portrait (`hit`, `miss`), une fois par réponse. */
function useStrike(state: DungeonState): "hit" | "miss" | null {
  const [strike, setStrike] = useState<"hit" | "miss" | null>(null);
  const seen = useRef<DungeonState["lastAck"]>(null);
  useEffect(() => {
    const ack = state.lastAck;
    if (!ack || ack === seen.current) return;
    seen.current = ack;
    setStrike(ack.correct ? "hit" : "miss");
    const id = setTimeout(() => setStrike(null), 450);
    return () => clearTimeout(id);
  }, [state.lastAck]);
  return strike;
}

/** Saisie d'une réponse au calcul en cours (série d'un ennemi ou boss) : un nombre, ou un opérateur face au spectre. */
function AnswerLine({ room, game, state, target }: { room: Room; game: DungeonView; state: DungeonState; target: RoomV | null }) {
  const t = useTranslations("dungeon");
  const q = game.question;
  const [value, setValue] = useState("");
  const [sentFor, setSentFor] = useState<string | null>(null);
  const key = q ? `${game.phase}:${game.round}:${q.index}:${q.text}:${q.count}` : "";
  // Momie : l'énoncé disparaît `visibleMs` après le début du calcul, même avant le prochain snapshot.
  const visibleMs = game.phase === "combat" ? (target?.visibleMs ?? null) : null;
  const now = useNow(visibleMs !== null, 100);
  const hidden = !!q && (q.hidden || (visibleMs !== null && now >= q.startedAt - state.clockOffset + visibleMs));
  const lastAck = useRef<string | null>(null);

  useEffect(() => {
    setValue("");
  }, [key]);
  useEffect(() => {
    setSentFor(null);
  }, [room]);
  useEffect(() => {
    const ack = state.lastAck;
    if (!ack) return;
    const id = `${ack.index}:${ack.correct}:${ack.done}:${key}`;
    if (id === lastAck.current) return;
    lastAck.current = id;
    if (ack.correct) sfx.ok();
    else sfx.ko();
  }, [state.lastAck, key]);

  if (!q) return null;
  const submit = () => {
    const answer = answerFromInput(value, q.answerKind);
    if (!answer || sentFor === key) return;
    setSentFor(key);
    room.send("answer", { index: q.index, ...answer });
  };
  return (
    <div className={`dungeon-answer${hidden ? " hidden-calc" : ""}`} data-testid="dungeon-answer" data-index={q.index}>
      {q.deadline !== null && q.timerMs !== null ? <TimerBar deadline={q.deadline - state.clockOffset} totalMs={q.timerMs} /> : null}
      <CalcLine
        text={hidden ? t("hiddenCalc") : q.text}
        puzzle={hidden ? undefined : q.puzzle}
        value={value}
        onChange={setValue}
        onSubmit={submit}
        disabled={sentFor === key}
      />
      {hidden ? <p className="note">{t("mummyHint")}</p> : null}
    </div>
  );
}

function CombatStage({
  room,
  game,
  state,
  me,
  target,
}: {
  room: Room;
  game: DungeonView;
  state: DungeonState;
  me: string | null;
  target: RoomV | null;
}) {
  const t = useTranslations("dungeon");
  const strike = useStrike(state);
  const meP = game.players.find((p) => p.id === me);
  const fight = meP?.fight;
  if (!fight || !target) return <p className="dungeon-panel dungeon-aside">{t("downWatching")}</p>;
  if (!target.enemy) return <p className="dungeon-panel dungeon-aside">{t("chestTaken")}</p>;
  const pool = game.pools.find((p) => p.roomKey === fight.roomKey);
  const status =
    fight.status === "fighting"
      ? pool
        ? t("hordeLeft", { n: pool.remaining, count: pool.total })
        : target.form === "regrow"
          ? t("hydraLeft", { n: Math.max(0, fight.count - fight.index) })
          : t("progress", {
              n: Math.min(fight.index + 1, fight.count),
              count: fight.count,
            })
      : fight.status === "won"
        ? t("seriesWon")
        : t("seriesFailed");
  return (
    <div className="dungeon-panel dungeon-combat" data-testid="dungeon-combat" data-status={fight.status}>
      <div className={`dungeon-duel${strike ? ` ${strike}` : ""}`} data-enemy={target.enemy}>
        <EnemyArt enemy={target.enemy} />
        <div className="dungeon-duel-info">
          <p className="dungeon-duel-name">{t(`enemies.${target.enemy}.name`)}</p>
          <Progress done={pool ? pool.total - pool.remaining : fight.index} count={pool ? pool.total : fight.count} status={fight.status} />
          <p className="dungeon-duel-progress">{status}</p>
        </div>
      </div>
      {fight.status === "fighting" ? <AnswerLine room={room} game={game} state={state} target={target} /> : null}
    </div>
  );
}

/** Les calculs de la série, comme la vie de l'ennemi : chaque bonne réponse en brise un. */
function Progress({ done, count, status }: { done: number; count: number; status: FightStatus }) {
  return (
    <div className="dungeon-progress" aria-hidden="true">
      {Array.from({ length: Math.min(count, 24) }, (_, i) => (
        <span key={i} className={i < done ? "broken" : i === done && status === "failed" ? "ko" : ""} />
      ))}
    </div>
  );
}

/** Le sac : deux objets ; on les utilise, on les passe à un allié ou on les jette. */
function BagBar({
  room,
  game,
  me,
  keyMode,
  setKeyMode,
}: {
  room: Room;
  game: DungeonView;
  me: DungeonView["players"][number];
  keyMode: boolean;
  setKeyMode: (on: boolean) => void;
}) {
  const t = useTranslations("dungeon");
  const allies = game.players.filter((p) => p.id !== me.id && !p.gone && p.bag.length < BAG_SIZE);
  const positioning = game.phase === "positioning";
  const canUse = (item: ItemId) =>
    (ITEM_USE[item] === "positioning" && positioning) || (ITEM_USE[item] === "boss" && game.phase === "boss");
  return (
    <div className="dungeon-bag" data-testid="dungeon-bag">
      <p className="dungeon-bag-title">
        {t("bag.title")}
        {me.buffs.hourglass ? <span className="dungeon-buff">{t("bag.buffHourglass")}</span> : null}
        {me.buffs.secondChance ? <span className="dungeon-buff">{t("bag.buffSecondChance")}</span> : null}
      </p>
      <ul className="dungeon-bag-slots">
        {Array.from({ length: BAG_SIZE }, (_, i) => {
          const item = me.bag[i];
          if (!item)
            return (
              <li key={`empty${i}`} className="empty">
                {t("bag.empty")}
              </li>
            );
          return (
            <li key={`${item}${i}`} className="filled">
              <ItemIcon item={item} />
              <span className="dungeon-bag-text">
                <strong>{t(`items.${item}.name`)}</strong>
                <span>{t(`items.${item}.desc`)}</span>
              </span>
              <span className="dungeon-bag-actions">
                {canUse(item) ? (
                  item === "key" ? (
                    <button className="btn" type="button" onClick={() => setKeyMode(!keyMode)}>
                      {keyMode ? t("bag.cancel") : t("bag.use")}
                    </button>
                  ) : (
                    <button className="btn" type="button" onClick={() => room.send("use-item", { item })}>
                      {t("bag.use")}
                    </button>
                  )
                ) : ITEM_USE[item] === "passive" ? (
                  <span className="note">{t("bag.passive")}</span>
                ) : null}
                {positioning
                  ? allies.map((a) => (
                      <button key={a.id} className="link-btn" type="button" onClick={() => room.send("give-item", { item, to: a.id })}>
                        {t("bag.give", { name: a.name })}
                      </button>
                    ))
                  : null}
                <button className="link-btn" type="button" onClick={() => room.send("drop-item", { item })}>
                  {t("bag.drop")}
                </button>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function LootStage({ room, game, me, roomOf }: { room: Room; game: DungeonView; me: string | null; roomOf: (k: string) => RoomV | null }) {
  const t = useTranslations("dungeon");
  const mine = game.loot.find((l) => l.holderId === me && l.givenTo === null && !l.lost);
  const nameOf = (id: string) => game.players.find((p) => p.id === id)?.name ?? "?";
  const name = useRoomName();
  const fits = (p: DungeonView["players"][number], item: ItemId) =>
    !p.gone && (item === "heart" ? p.lives < DUNGEON_MAX_LIVES : p.bag.length < BAG_SIZE);
  return (
    <div className="dungeon-panel dungeon-loot-panel">
      {mine ? (
        <>
          <div className="dungeon-loot-item">
            <ItemIcon item={mine.item} />
          </div>
          <p className="dungeon-loot-title">
            {t("lootFound", {
              item: t(`items.${mine.item}.name`),
              room: roomOf(mine.roomKey) ? name(roomOf(mine.roomKey)!) : "?",
            })}
          </p>
          <p>{t(`items.${mine.item}.desc`)}</p>
          <div className="actions">
            {game.players
              .filter((p) => fits(p, mine.item))
              .map((p) => (
                <button
                  key={p.id}
                  className={p.id === me ? "btn" : "btn ghost"}
                  type="button"
                  onClick={() => room.send("give-loot", { to: p.id })}
                >
                  {p.id === me ? t("lootKeep") : t("lootGive", { name: p.name })}
                  {mine.item === "heart" ? <Lives lives={p.lives} /> : null}
                </button>
              ))}
          </div>
          <p className="note">{t("lootHint")}</p>
        </>
      ) : null}
      <ul className="dungeon-loot">
        {game.loot.map((l) => (
          <li key={l.roomKey}>
            <ItemIcon item={l.item} />{" "}
            {l.givenTo
              ? l.givenTo === l.holderId
                ? t("lootKept", {
                    name: nameOf(l.holderId),
                    item: t(`items.${l.item}.name`),
                  })
                : t("lootGiven", {
                    name: nameOf(l.holderId),
                    to: nameOf(l.givenTo),
                    item: t(`items.${l.item}.name`),
                  })
              : l.lost
                ? t("lootLost", { item: t(`items.${l.item}.name`) })
                : t("lootPending", { name: nameOf(l.holderId) })}
          </li>
        ))}
      </ul>
    </div>
  );
}

function RoundResult({
  game,
  roomOf,
  nameOf,
  me,
}: {
  game: DungeonView;
  roomOf: (k: string) => RoomV | null;
  nameOf: (id: string) => string;
  me: string | null;
}) {
  const t = useTranslations("dungeon");
  const name = useRoomName();
  const last = game.lastRound;
  if (!last) return null;
  return (
    <div className="dungeon-panel dungeon-round-result">
      <p className="dungeon-banner">{t("roundCleared", { count: last.cleared.length, points: last.points })}</p>
      {last.sealsBroken ? <p className="dungeon-seal-news">{t("sealsBrokenNews", { count: last.sealsBroken })}</p> : null}
      {game.bossReached ? <p className="dungeon-seal-news">{t("goalReached")}</p> : null}
      <ul className="dungeon-results">
        {last.fights.map((f) => {
          const r = roomOf(f.roomKey);
          return (
            <li key={f.playerId} className={`${f.playerId === me ? "me " : ""}${f.status}`}>
              {r?.enemy ? <EnemyArt enemy={r.enemy} /> : <ChestIcon />}
              <span>
                <strong>{nameOf(f.playerId)}</strong> → {r ? name(r) : "?"} :{" "}
                {f.status === "won" ? (
                  <span className="ok">{r?.enemy ? t("seriesWon") : t("chestOpened")}</span>
                ) : (
                  <span className="ko">
                    {t("failedAt", { n: f.reached + 1, count: f.count })}
                    {f.failure
                      ? ` · ${f.failure.text} → ${f.failure.solution}${f.failure.given === null ? ` (${t("timeUp")})` : ` (${f.failure.given})`}`
                      : ""}
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Coups portés au boss, déduits de la hausse des dégâts de chaque joueur entre deux snapshots. */
function useBossHits(game: DungeonView): { id: number; seat: number; x: number; amount: number }[] {
  const [hits, setHits] = useState<{ id: number; seat: number; x: number; amount: number }[]>([]);
  const previous = useRef<Map<string, number> | null>(null);
  const counter = useRef(0);
  useEffect(() => {
    const before = previous.current;
    const now = new Map(game.players.map((p) => [p.id, p.bossDamage]));
    previous.current = now;
    if (!before) return;
    const fresh: { id: number; seat: number; x: number; amount: number }[] = [];
    game.players.forEach((p, seat) => {
      const gained = p.bossDamage - (before.get(p.id) ?? p.bossDamage);
      if (gained > 0)
        fresh.push({
          id: ++counter.current,
          seat,
          x: 20 + ((counter.current * 37) % 60),
          amount: gained,
        });
    });
    if (!fresh.length) return;
    setHits((h) => [...h, ...fresh].slice(-12));
    const ids = new Set(fresh.map((f) => f.id));
    setTimeout(() => setHits((h) => h.filter((x) => !ids.has(x.id))), 900);
  }, [game.players]);
  return hits;
}

function BossStage({ room, game, state, me }: { room: Room; game: DungeonView; state: DungeonState; me: string | null }) {
  const t = useTranslations("dungeon");
  const hits = useBossHits(game);
  const strike = useStrike(state);
  const boss = game.boss;
  const meP = game.players.find((p) => p.id === me);
  if (!boss) return null;
  const ratio = boss.maxHp > 0 ? boss.hp / boss.maxHp : 0;
  // Le boss enrage à mi-vie, puis s'affole sous le quart.
  const mood = ratio <= 0.25 ? "frenzy" : ratio <= 0.5 ? "rage" : "calm";
  const total = Math.max(
    1,
    game.players.reduce((s, p) => s + p.bossDamage, 0),
  );
  return (
    <div className="dungeon-boss" data-testid="dungeon-boss" data-mood={mood}>
      <div className={`dungeon-boss-stage${strike === "hit" ? " hit" : ""}`}>
        <EnemyArt enemy="boss" />
        {hits.map((h) => (
          <span key={h.id} className="dg-hit" data-seat={h.seat % 4} style={{ left: `${h.x}%` }} aria-hidden="true">
            −{h.amount}
          </span>
        ))}
      </div>
      <p className="dungeon-boss-name">{t("boss.name")}</p>
      {game.sealsBroken > 0 ? <p className="dungeon-seal-news">{t("bossWeakened", { count: game.sealsBroken })}</p> : null}
      <div
        className="dungeon-hp"
        role="meter"
        aria-valuemin={0}
        aria-valuemax={boss.maxHp}
        aria-valuenow={boss.hp}
        aria-label={t("boss.hpAria")}
        style={{ ["--segments" as string]: boss.maxHp }}
      >
        <span style={{ transform: `scaleX(${Math.max(0, ratio)})` }} />
      </div>
      <p className="dungeon-boss-hp">{t("boss.hp", { hp: Math.max(0, boss.hp), max: boss.maxHp })}</p>
      <TimerBar deadline={boss.endsAt - state.clockOffset} totalMs={boss.endsAt - boss.startedAt} />
      {meP?.standing && game.question ? (
        <AnswerLine room={room} game={game} state={state} target={null} />
      ) : (
        <p className="dungeon-aside">{t("downWatching")}</p>
      )}
      {/* Part de chacun dans les coups portés, à la couleur de sa place. */}
      <div className="dungeon-damage-bar" aria-hidden="true">
        {game.players.map((p, seat) => (
          <span key={p.id} data-seat={seat % 4} style={{ flexGrow: p.bossDamage / total }} />
        ))}
      </div>
      <ul className="dungeon-damage">
        {game.players.map((p, seat) => (
          <li key={p.id}>
            <Token name={p.name} seat={seat} /> {p.name} : {t("boss.damage", { count: p.bossDamage })}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** L'équipe : vies, sac, salle affrontée, avancée de la série. */
function TeamList({ game, me, roomOf }: { game: DungeonView; me: string | null; roomOf: (k: string) => RoomV | null }) {
  const t = useTranslations("dungeon");
  const name = useRoomName();
  return (
    <ul className="dungeon-team">
      {game.players.map((p, seat) => {
        const r = p.fight ? roomOf(p.fight.roomKey) : null;
        return (
          <li key={p.id} className={`${p.id === me ? "me" : ""}${p.standing ? "" : " down"}`}>
            <Token name={p.name} seat={seat} />
            <span className="nm">{p.name}</span>
            <Lives lives={p.lives} />
            {p.bag.length ? (
              <span className="dungeon-team-bag" aria-label={p.bag.map((i) => t(`items.${i}.name`)).join(", ")}>
                {p.bag.map((i, k) => (
                  <ItemIcon key={k} item={i} />
                ))}
              </span>
            ) : null}
            {p.gone ? <span className="muted">{t("gone")}</span> : null}
            {game.phase === "positioning" ? (
              <span className="muted">{p.locked ? t("teamLocked") : p.pick !== null ? t("teamPicked") : t("teamChoosing")}</span>
            ) : p.fight && r && game.phase === "combat" ? (
              <span className="muted">
                {name(r)} ·{" "}
                {p.fight.status === "fighting"
                  ? `${p.fight.index}/${p.fight.count}`
                  : p.fight.status === "won"
                    ? t("seriesWon")
                    : t("seriesFailed")}
              </span>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

/* ------------------------------------------------------------------ */
/* Fin de l'expédition                                                   */
/* ------------------------------------------------------------------ */

function DungeonFinished({ room, snap, me, onLeave }: { room: Room; snap: DungeonSnapshot; me: string | null; onLeave: () => void }) {
  const t = useTranslations();
  const router = useRouter();
  const celebrated = useRef<number | null>(null);
  const summary = snap.summary;
  const isHost = snap.hostId === me;

  useEffect(() => {
    if (!summary || celebrated.current === snap.gameNumber) return;
    celebrated.current = snap.gameNumber;
    if (summary.outcome === "won") {
      sfx.win();
      void celebrate();
    } else sfx.out();
  }, [summary, snap.gameNumber]);

  // Les succès arrivent une fois l'expédition enregistrée, juste après l'écran de fin.
  const myUnlocks = (me && snap.unlocks?.[me]) || [];
  const hasUnlocks = myUnlocks.length > 0;
  useEffect(() => {
    if (hasUnlocks) sfx.unlock();
  }, [hasUnlocks]);
  const others = (summary?.players ?? []).flatMap((p) =>
    p.id === me ? [] : (snap.unlocks?.[p.id] ?? []).map((u) => ({ key: `${p.id}:${u.achievementId}`, name: p.name, id: u.achievementId })),
  );

  if (!summary) return <p className="status">{t("lobby.connecting")}</p>;
  return (
    <section className="dungeon-end">
      <Margin>
        <MarginNote value={t("game.end")} />
      </Margin>
      {/* Le bilan s'affiche tout de suite, les suites juste sous le résultat. */}
      <DungeonSummaryView summary={summary} me={me}>
        <div className="actions dungeon-end-actions">
          {/* Rejouer ramène toute l'équipe dans la salle d'attente : l'hôte seul relance. */}
          <button
            className="btn"
            type="button"
            disabled={!isHost}
            title={isHost ? undefined : t("dungeon.end.waitHost")}
            onClick={() => room.send("back-to-lobby", {})}
          >
            {t("dungeon.end.again")}
          </button>
          <button className="btn ghost" type="button" onClick={onLeave}>
            {t("dungeon.end.toDungeons")}
          </button>
          <button
            className="btn ghost"
            type="button"
            onClick={() => {
              leaveDungeon();
              router.push("/");
            }}
          >
            {t("dungeon.end.toHome")}
          </button>
        </div>
        <p className="note">{isHost ? t("dungeon.end.hostHint") : t("dungeon.end.waitHost")}</p>
        {hasUnlocks ? <UnlockedBlock unlocks={myUnlocks} /> : null}
        {others.length ? (
          <ul className="others-unlocks">
            {others.map(({ key, name, id }) => (
              <li key={key}>{t("report.playerUnlocked", { name, achievement: t(`achievements.${id}.name`) })}</li>
            ))}
          </ul>
        ) : null}
      </DungeonSummaryView>
    </section>
  );
}

/** Bilan d'une expédition : celui de l'équipe, puis sa part à soi et celle de chacun. Partagé avec la page de bilan. */
export function DungeonSummaryView({ summary, me, children }: { summary: DungeonSummary; me: string | null; children?: React.ReactNode }) {
  const t = useTranslations("dungeon");
  const locale = useLocale();
  const mine = summary.players.find((p) => p.id === me);
  const won = summary.outcome === "won";
  return (
    <div className="stack dungeon-summary" data-testid="dungeon-summary" data-outcome={won ? "won" : "lost"}>
      <div className="dungeon-end-hero">
        <EnemyArt enemy="boss" />
        <h1>{won ? t("end.won") : t("end.lost")}</h1>
      </div>
      {!won && summary.lossReason ? <p className="lede">{t(`end.reason.${summary.lossReason}`)}</p> : null}
      {children}
      <div className="dungeon-stats">
        <Stat label={t("end.score")} value={summary.score} />
        <Stat label={t("end.level")} value={t("end.levelValue", { n: summary.difficulty })} />
        <Stat label={t("end.rounds")} value={`${summary.roundsPlayed}/${DUNGEON_ROUNDS}`} />
        <Stat label={t("end.enemies")} value={summary.enemiesDefeated} />
        <Stat label={t("end.seals")} value={summary.sealsBroken} />
        {summary.bossMaxHp !== null ? (
          <Stat label={t("end.boss")} value={`${summary.bossMaxHp - (summary.bossHp ?? 0)}/${summary.bossMaxHp}`} />
        ) : null}
      </div>
      {mine ? (
        <div className="panel">
          <h2 className="h3">{t("end.mine")}</h2>
          <div className="dungeon-stats">
            <Stat label={t("end.points")} value={mine.points} />
            <Stat label={t("end.enemies")} value={mine.enemiesDefeated} />
            <Stat label={t("end.bossDamage")} value={mine.bossDamage} />
            <Stat label={t("end.items")} value={mine.itemsFound} />
            <Stat label={t("end.hearts")} value={`${mine.heartsGiven} / ${mine.heartsReceived}`} />
            <Stat label={t("end.accuracy")} value={`${mine.correct}/${mine.answered}`} />
            <Stat label={t("end.avgTime")} value={mine.avgTimeMs !== null ? formatSeconds(mine.avgTimeMs, locale) : "—"} />
          </div>
        </div>
      ) : null}
      <table className="dungeon-table">
        <thead>
          <tr>
            <th>{t("end.player")}</th>
            <th>{t("end.points")}</th>
            <th>{t("end.enemies")}</th>
            <th>{t("end.bossDamage")}</th>
            <th>{t("end.livesLeft")}</th>
            <th>{t("end.accuracy")}</th>
          </tr>
        </thead>
        <tbody>
          {summary.players.map((p) => (
            <tr key={p.id} className={p.id === me ? "me" : undefined}>
              <td>{p.name || t("end.deleted")}</td>
              <td>{p.points}</td>
              <td>{p.enemiesDefeated}</td>
              <td>{p.bossDamage}</td>
              <td>{p.lives}</td>
              <td>
                {p.correct}/{p.answered}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="dungeon-stat">
      <span className="dungeon-stat-value">{value}</span>
      <span className="dungeon-stat-label">{label}</span>
    </div>
  );
}
