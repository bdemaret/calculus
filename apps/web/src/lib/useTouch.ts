"use client";
import { useEffect, useState } from "react";

/** Vrai sur un écran tactile : on affiche alors le pavé numérique intégré. */
export function useTouch(): boolean {
  const [touch, setTouch] = useState(false);
  useEffect(() => {
    setTouch(window.matchMedia("(pointer: coarse)").matches);
  }, []);
  return touch;
}
