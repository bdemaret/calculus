/** « 1,2 s » en français, « 1.2 s » en anglais. */
export function formatSeconds(ms: number, locale: string): string {
  return (ms / 1000).toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + " s";
}

export function formatPercent(x: number, locale: string): string {
  return Math.round(x * 100).toLocaleString(locale) + " %";
}

/** Variation signée, ex. « +16 », « −8 » (signe moins Unicode), « 0 ». */
export function formatSigned(n: number, locale: string): string {
  const abs = Math.abs(n).toLocaleString(locale);
  return n > 0 ? `+${abs}` : n < 0 ? `−${abs}` : abs;
}
