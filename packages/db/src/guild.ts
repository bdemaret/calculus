/* Constantes des guildes, sans dépendance à Prisma : importables depuis un composant client (`@calculus/db/guild`). */

/** Membres d'une guilde au plus, chef compris. */
export const GUILD_MAX_MEMBERS = 50;
/** Invitations en attente qu'une guilde peut avoir en même temps (limite le spam). */
export const GUILD_MAX_PENDING_INVITES = 50;
export const GUILD_NAME_MIN = 3;
export const GUILD_NAME_MAX = 24;
/** Un membre est « en ligne » si le site l'a signalé il y a moins de ce délai (toutes les 15 s, toutes les 60 s en arrière-plan). */
export const GUILD_ONLINE_MS = 90_000;

/** Nettoie un nom de guilde : caractères de contrôle et chevrons retirés, espaces resserrés, 24 caractères au plus. */
export function cleanGuildName(raw: string): string {
  return raw.replace(/[\u0000-\u001f<>]/g, "").replace(/\s+/g, " ").trim().slice(0, GUILD_NAME_MAX);
}
