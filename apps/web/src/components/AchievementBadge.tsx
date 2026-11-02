import { ACHIEVEMENTS, type AchievementTier } from "@calculus/game-core";

const ROSETTE = Array.from({ length: 24 }, (_, i) => {
  const angle = (i * Math.PI) / 12;
  const radius = i % 2 ? 22 : 27;
  return `${(28 + radius * Math.cos(angle)).toFixed(2)},${(28 + radius * Math.sin(angle)).toFixed(2)}`;
}).join(" ");

export function tierOf(achievementId: string): AchievementTier {
  return ACHIEVEMENTS.find((a) => a.id === achievementId)?.tier ?? "bronze";
}

/** Gommette d'écolier, de la couleur du palier ; grise tant que le succès n'est pas obtenu. */
export function AchievementBadge({ tier, mark = "★" }: { tier?: AchievementTier; mark?: string }) {
  return (
    <svg className="badge" data-tier={tier} viewBox="0 0 56 56" aria-hidden="true">
      <polygon points={ROSETTE} fill="currentColor" />
      <text x="28" y="34" textAnchor="middle">
        {mark}
      </text>
    </svg>
  );
}
