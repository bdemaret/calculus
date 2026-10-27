/** Façons d'afficher une division dans les énoncés : « 12 ÷ 4 » ou une barre de fraction. */
export const DIVISION_DISPLAYS = ["standard", "fraction"] as const;
export type DivisionDisplay = (typeof DIVISION_DISPLAYS)[number];

export function isDivisionDisplay(v: unknown): v is DivisionDisplay {
  return typeof v === "string" && (DIVISION_DISPLAYS as readonly string[]).includes(v);
}
