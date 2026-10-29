"use client";
import { useLayoutEffect } from "react";
import { useLocale } from "next-intl";
import { applyStoredTheme } from "@/lib/theme";

/** Garde le thème choisi après un changement de langue (avant l'affichage, pour éviter un flash). */
export function ThemeSync() {
  const locale = useLocale();
  useLayoutEffect(applyStoredTheme, [locale]);
  return null;
}
