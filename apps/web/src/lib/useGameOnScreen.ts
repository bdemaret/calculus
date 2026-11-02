"use client";
import { useLayoutEffect } from "react";

/**
 * Pendant une partie : la page repart de tout en haut et `data-playing` sur `<html>` retire l'en-tête et le
 * pied de page sur téléphone (`globals.css`), pour que le calcul tienne au-dessus du pavé sur tout écran.
 * En quittant les réglages, la page raccourcit mais resterait défilée, le calcul hors de l'écran.
 */
export function useGameOnScreen(playing: boolean) {
  useLayoutEffect(() => {
    if (!playing) return;
    const root = document.documentElement;
    root.dataset.playing = "";
    window.scrollTo(0, 0);
    return () => {
      delete root.dataset.playing;
    };
  }, [playing]);
}
