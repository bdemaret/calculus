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
    <div className="players" data-testid="player-chips">
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

/** Photo de profil si le joueur en a une (et qu'on a le droit de la voir), sinon l'initiale du pseudo. */
export function Avatar({ name, image, className }: { name: string; image?: string | null; className?: string }) {
  const cls = className ? `avatar ${className}` : "avatar";
  if (image) return <img className={`${cls} has-image`} src={image} alt="" width={26} height={26} />;
  return (
    <span className={cls} aria-hidden="true">
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}
