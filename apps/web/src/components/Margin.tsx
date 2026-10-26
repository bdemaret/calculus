"use client";
import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/** Écrit dans la marge rouge du cahier (manche, score…), comme les annotations d'un prof. */
export function Margin({ children }: { children: ReactNode }) {
  const [el, setEl] = useState<HTMLElement | null>(null);
  useEffect(() => setEl(document.getElementById("margin-notes")), []);
  return el ? createPortal(children, el) : null;
}

export function MarginNote({ value, label }: { value: ReactNode; label?: ReactNode }) {
  return (
    <span className="margin-note">
      {value}
      {label ? <small>{label}</small> : null}
    </span>
  );
}
