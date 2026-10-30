"use client";
import { useLayoutEffect, useRef } from "react";
import { useTouch } from "./useTouch";

/**
 * Sur téléphone, cale la section de jeu en haut de l'écran pendant le compte à rebours. La page raccourcit en
 * quittant les réglages et reste défilée tout en bas ; l'élément que suit le navigateur est alors sous la cale
 * de `PadDock`, et l'arrivée du pavé l'emmènerait en bas de page, avec le calcul hors de l'écran.
 */
export function useGameOnScreen(countdown: boolean) {
  const section = useRef<HTMLElement>(null);
  const touch = useTouch();
  useLayoutEffect(() => {
    if (countdown && touch) section.current?.scrollIntoView({ block: "start" });
  }, [countdown, touch]);
  return section;
}
