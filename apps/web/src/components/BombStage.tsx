"use client";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import type { Room } from "colyseus.js";
import { bombValue, type BombPuzzle, type RoomSnapshot, type RoundResultPayload } from "@calculus/game-core";
import type { LobbyState } from "@/lib/colyseus";
import { TileExpression } from "./ExpressionBuilder";

const nameIn = (snap: RoomSnapshot) => (id: string) => snap.players.find((p) => p.id === id)?.name ?? "?";

/** La bombe, construction : le tirage commun, les règles, la saisie, puis l'attente des autres. */
export function BombBuild({ room, snap, state, me }: { room: Room; snap: RoomSnapshot; state: LobbyState; me: string | null }) {
  const t = useTranslations("game.bomb");
  const [value, setValue] = useState("");
  const q = snap.question;
  const puzzle = q?.puzzle.game === "bomb" ? (q.puzzle as BombPuzzle) : null;
  // Nouveau tirage : on repart d'une saisie vide.
  useEffect(() => setValue(""), [q?.index]);
  if (!q || !puzzle) return null;

  const meP = snap.players.find((p) => p.id === me);
  const players = snap.players.filter((p) => p.alive && p.connected);
  const built = snap.bomb?.built ?? [];
  const mine = snap.bomb?.mine ?? null;
  const checked = value.trim() ? bombValue(puzzle, value) : null;
  const ack = state.bombAck?.roundIndex === q.index ? state.bombAck : null;
  const canBuild = !!meP?.alive && !mine;

  return (
    <div className="bomb-stage">
      <p className="bomb-rules" data-testid="bomb-rules">
        {t("rules", { min: puzzle.minTiles, max: puzzle.maxResult })} · {puzzle.parentheses ? t("parenYes") : t("parenNo")}
      </p>
      {canBuild ? (
        <TileExpression
          tiles={puzzle.tiles}
          operations={puzzle.operations}
          parentheses={puzzle.parentheses}
          value={value}
          onChange={setValue}
          onSubmit={() => room.send("bomb", { roundIndex: q.index, expr: value })}
          total={checked && "value" in checked ? checked.value : null}
          ready={!!checked && "value" in checked}
          hint={checked && "error" in checked ? t(`errors.${checked.error}`) : ack && !ack.accepted && ack.reason ? t(`errors.${ack.reason}`) : null}
          focusKey={q.text}
          header={
            <p className="count-target">
              <span className="count-label">{t("buildTitle")}</span>
              <span className="calc" data-testid="calc-text" data-calc={q.text}>
                {q.text}
              </span>
            </p>
          }
        />
      ) : (
        <div className="stack">
          <p className="calc long" data-testid="calc-text" data-calc={q.text}>
            {q.text}
          </p>
          {mine ? (
            <p className="callout" data-testid="bomb-mine">
              {t("sent", { bomb: mine })}
            </p>
          ) : null}
        </div>
      )}
      <p className="muted" aria-live="polite">
        {t("ready", { count: built.length, total: players.length })}
      </p>
    </div>
  );
}

/** La bombe, attribution : qui désamorce la bombe de qui (avant le désamorçage). */
export function BombAssign({ snap, me }: { snap: RoomSnapshot; me: string | null }) {
  const t = useTranslations("game.bomb");
  const nameOf = nameIn(snap);
  const pairs = snap.bomb?.pairs ?? [];
  const sent = pairs.find((p) => p.authorId === me);
  const received = pairs.find((p) => p.defuserId === me);
  return (
    <div className="bomb-stage" data-testid="bomb-assign">
      {received ? <p className="calc long">{t("youDefuse", { name: nameOf(received.authorId) })}</p> : null}
      {sent ? <p className="callout">{t("yourBombGoes", { name: nameOf(sent.defuserId) })}</p> : null}
      {!received ? <BombPairList snap={snap} /> : null}
    </div>
  );
}

/** Les paires de la manche (pour les spectateurs), sans les bombes. */
export function BombPairList({ snap }: { snap: RoomSnapshot }) {
  const t = useTranslations("game.bomb");
  const nameOf = nameIn(snap);
  return (
    <ul className="bomb-list">
      {(snap.bomb?.pairs ?? []).map((p) => (
        <li key={p.defuserId}>{t("pair", { author: nameOf(p.authorId), defuser: nameOf(p.defuserId) })}</li>
      ))}
    </ul>
  );
}

/** La bombe, fin de manche : chaque bombe, son auteur, son désamorceur et ce qu'il a répondu. */
export function BombResults({ snap, last }: { snap: RoomSnapshot; last: RoundResultPayload }) {
  const t = useTranslations("game.bomb");
  const nameOf = nameIn(snap);
  return (
    <ul className="bomb-list" data-testid="bomb-results">
      {(last.bombs ?? []).map((b) => {
        const a = last.answers.find((x) => x.playerId === b.defuserId);
        return (
          <li key={b.defuserId} className={a?.correct ? "ok" : "ko"}>
            <span className="nm">{t("pair", { author: nameOf(b.authorId), defuser: nameOf(b.defuserId) })}</span>{" "}
            <span className="val">
              {b.text} = {b.answer}
            </span>{" "}
            <span>{a?.correct ? t("defused") : a?.value == null ? t("exploded") : t("explodedWith", { value: a.value })}</span>
            {b.fallback ? <span className="muted"> · {t("fallback")}</span> : null}
          </li>
        );
      })}
    </ul>
  );
}
