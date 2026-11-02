"use client";
import { useTranslations } from "next-intl";
import { TITLES } from "@calculus/game-core";

/** Titre porté par un joueur, sous son pseudo. */
export function PlayerTitle({ title }: { title: string | null }) {
  const t = useTranslations("titles");
  const definition = TITLES.find((d) => d.id === title);
  if (!definition) return null;
  return (
    <span className="player-title" data-rarity={definition.rarity}>
      {t(definition.id)}
    </span>
  );
}
