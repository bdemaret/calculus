import { Cinzel } from "next/font/google";
import type { ReactNode } from "react";
import "./dungeon.css";

// Police gravée des donjons, téléchargée au build et servie par le site, chargée sur ces pages seulement.
const engraved = Cinzel({ subsets: ["latin"], variable: "--font-cinzel", preload: false });

/** Toutes les pages des donjons vivent dans le même décor : pierre, torches et parchemin (`dungeon.css`). */
export default function DungeonLayout({ children }: { children: ReactNode }) {
  return <div className={`dungeon-world ${engraved.variable}`}>{children}</div>;
}
