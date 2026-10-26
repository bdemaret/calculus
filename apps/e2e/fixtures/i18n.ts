import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

type Messages = { [key: string]: string | Messages };
export type Locale = "fr" | "en";

const load = (locale: Locale): Messages =>
  JSON.parse(readFileSync(fileURLToPath(new URL(`../../web/messages/${locale}.json`, import.meta.url)), "utf8"));

const messages: Record<Locale, Messages> = { fr: load("fr"), en: load("en") };

/**
 * Libellé traduit, lu dans les mêmes fichiers que le site : les tests ne cassent pas
 * quand un texte change. Remplace seulement les variables simples (`{name}`), pas les pluriels ICU.
 */
export function tr(key: string, vars: Record<string, string | number> = {}, locale: Locale = "fr"): string {
  let node: string | Messages | undefined = messages[locale];
  for (const part of key.split(".")) node = typeof node === "object" ? node[part] : undefined;
  if (typeof node !== "string") throw new Error(`Clé de traduction introuvable : ${locale}.${key}`);
  return node.replace(/\{(\w+)\}/g, (m, name: string) => (name in vars ? String(vars[name]) : m));
}

export const t = (key: string, vars?: Record<string, string | number>) => tr(key, vars, "fr");
