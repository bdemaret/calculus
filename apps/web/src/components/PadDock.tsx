"use client";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * Ancre le pavé en bas de l'écran pendant une partie sur téléphone : ses touches ne bougent plus,
 * quelle que soit la longueur du calcul, de la réponse ou des messages au-dessus.
 * Une cale de même hauteur reste dans la page pour que rien ne passe sous le pavé.
 * Rendu dans `body` : une animation (secousse d'une erreur) sur un parent déplacerait un `position: fixed`.
 */
export function PadDock({ docked, children }: { docked: boolean; children: ReactNode }) {
  const dock = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);

  useLayoutEffect(() => {
    const el = dock.current;
    if (!docked || !el) return;
    const measure = () => setHeight(el.offsetHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [docked]);

  if (!docked) return <>{children}</>;
  return (
    <>
      <div className="pad-dock-space" style={{ height }} aria-hidden="true" />
      {createPortal(
        <div ref={dock} className="pad-dock">
          {children}
        </div>,
        document.body,
      )}
    </>
  );
}
