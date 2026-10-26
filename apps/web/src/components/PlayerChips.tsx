"use client";
import { useTranslations } from "next-intl";

export interface ChipPlayer {
  id: string;
  name: string;
  score: number;
  alive: boolean;
  connected: boolean;
  /** État de la manche : a répondu, juste ou faux (si connu), ou rien. */
  state?: "answered" | "right" | "wrong" | null;
  active?: boolean;
}

export function PlayerChips({ players, meId }: { players: ChipPlayer[]; meId: string | null }) {
  const t = useTranslations("game");
  return (
    <div className="players">
      {players.map((p) => (
        <span
          key={p.id}
          className={["chip", p.id === meId ? "me" : "", !p.alive ? "out" : "", p.active ? "active" : "", p.state ?? ""].join(" ")}
          title={p.connected ? undefined : t("disconnected")}
          style={p.connected ? undefined : { opacity: 0.55 }}
        >
          <span className="avatar">{p.name.slice(0, 1).toUpperCase()}</span>
          <span className="nm" data-me={t("you")}>
            {p.name}
          </span>
          <span className="pts">{p.score}</span>
        </span>
      ))}
    </div>
  );
}

export function Avatar({ name }: { name: string }) {
  return <span className="avatar">{name.slice(0, 1).toUpperCase()}</span>;
}
