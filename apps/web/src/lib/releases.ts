/**
 * Versions du site, de la plus récente à la plus ancienne : seule source du numéro de version.
 * Chaque version a ses notes dans `messages/*.json`, `changelog.notes.<releaseKey(version)>` (liste de textes).
 * Pour une mise en production : ajouter une entrée en tête et ses notes dans les deux langues.
 */
export const RELEASES = [
  { version: "1.1.0", date: "2026-10-29" },
  { version: "1.0.0", date: "2026-10-28" },
] as const satisfies readonly { version: string; date: string }[];

export type Release = (typeof RELEASES)[number];

/** Version en ligne. */
export const APP_VERSION: string = RELEASES[0].version;

/** Durée pendant laquelle la notification de nouvelle version s'affiche après une mise en production, en ms. */
export const RELEASE_NOTICE_MS = 48 * 60 * 60 * 1000;

/**
 * Heure de la mise en production : posée au build par `next.config.ts` (surchargeable par `CALCULUS_RELEASED_AT`).
 * Vide ou invalide : pas de notification.
 */
export const RELEASED_AT = process.env.NEXT_PUBLIC_RELEASED_AT ?? "";

/** Clé `localStorage` (via `local`) de la dernière version dont le joueur a vu les notes. */
export const RELEASE_SEEN_KEY = "release.seen";

/** Clé des notes d'une version : next-intl n'accepte pas de point dans une clé. */
export function releaseKey(version: string): string {
  return "v" + version.replaceAll(".", "_");
}

/** Vrai si la mise en production date de moins de 48 h et que le joueur n'a pas encore vu cette version. */
export function showsReleaseNotice(now: number, seen: string | null, releasedAt: string = RELEASED_AT): boolean {
  const at = Date.parse(releasedAt);
  if (!Number.isFinite(at) || seen === APP_VERSION) return false;
  return now >= at && now - at < RELEASE_NOTICE_MS;
}
