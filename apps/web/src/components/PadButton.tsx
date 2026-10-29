"use client";
import { useRef, type ButtonHTMLAttributes } from "react";

type Props = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onClick" | "onPointerDown" | "type"> & {
  onPress: () => void;
};

/** Délai au-delà duquel un clic n'est plus celui de l'appui précédent (appui long à la souris). */
const CLICK_AFTER_PRESS_MS = 2000;

/**
 * Touche de pavé : réagit dès que le doigt (ou la souris) se pose, sans attendre le clic.
 * Un `onClick` se perd sur téléphone quand le doigt glisse un peu (le navigateur y voit un défilement)
 * ou se relève à côté de la touche, qui s'est enfoncée de quelques pixels : la touche ne répondait pas.
 * Le clic qui suit l'appui est ignoré (pas de double saisie) ; le clavier (Entrée, Espace) passe toujours par le clic.
 */
export function PadButton({ onPress, ...rest }: Props) {
  const pressedAt = useRef<number | null>(null);
  return (
    <button
      type="button"
      {...rest}
      onPointerDown={(e) => {
        if (e.button !== 0 || rest.disabled) return;
        // Garde le focus sur la case réponse (saisie au clavier physique après un clic sur le pavé).
        e.preventDefault();
        pressedAt.current = e.timeStamp;
        onPress();
      }}
      onClick={(e) => {
        const at = pressedAt.current;
        pressedAt.current = null;
        // detail vaut 0 pour un clic au clavier : il n'a pas eu d'appui.
        if (e.detail !== 0 && at !== null && e.timeStamp - at < CLICK_AFTER_PRESS_MS) return;
        onPress();
      }}
    />
  );
}
