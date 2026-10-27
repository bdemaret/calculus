"use client";
import { useEffect } from "react";

/**
 * Le serveur ne voit pas `#id` : un lien `/learn#mul-by-9` sans niveau ouvrirait le niveau 1.
 * Si l'ancre désigne une technique d'un autre niveau, on recharge sur le sien : une vraie navigation,
 * pour que le navigateur défile vers la fiche et la mette en avant (`:target`).
 */
export function LearnHashRedirect({ level, levels }: { level: number; levels: Record<string, number> }) {
  useEffect(() => {
    const id = decodeURIComponent(window.location.hash.slice(1));
    const target = levels[id];
    if (!target || target === level) return;
    const url = new URL(window.location.href);
    url.searchParams.set("level", String(target));
    window.location.replace(url.toString());
  }, [level, levels]);
  return null;
}
