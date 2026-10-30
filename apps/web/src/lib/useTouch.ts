"use client";
import { useSyncExternalStore } from "react";

const COARSE = "(pointer: coarse)";
const subscribe = (onChange: () => void) => {
  const query = window.matchMedia(COARSE);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
};

/**
 * Vrai sur un écran tactile : on affiche alors le pavé numérique intégré. La réponse est juste dès le
 * premier rendu d'un composant monté après l'hydratation : un jeu qui démarre ne passe pas par sa version clavier.
 */
export function useTouch(): boolean {
  return useSyncExternalStore(subscribe, () => window.matchMedia(COARSE).matches, () => false);
}
