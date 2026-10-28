/** Longueur minimale d'un secret de production, en caractères (`openssl rand -base64 32` en donne 44). */
const MIN_SECRET_LENGTH = 32;

/**
 * Message d'erreur si `GAME_TOKEN_SECRET` est inutilisable, null s'il convient.
 * En production, une valeur courte ou recopiée de `.env.example` permettrait de forger des jetons
 * (jouer sous l'identité de n'importe quel compte, lire `/admin/rooms`).
 */
export function gameTokenSecretError(): string | null {
  const value = process.env.GAME_TOKEN_SECRET;
  if (!value) return "GAME_TOKEN_SECRET manquant. Copie .env.example en .env à la racine du projet.";
  if (process.env.NODE_ENV === "production" && (value.includes("remplace-moi") || value.length < MIN_SECRET_LENGTH))
    return `GAME_TOKEN_SECRET invalide : génère une valeur avec \`openssl rand -base64 32\` (${MIN_SECRET_LENGTH} caractères au moins).`;
  return null;
}

/**
 * Origines autorisées à se connecter (`WEB_ORIGIN`, adresses du site séparées par des virgules),
 * ou null pour n'en filtrer aucune. Le filtre ne s'applique qu'en production : en développement,
 * le site s'ouvre aussi depuis le réseau local (téléphone), sous une autre adresse.
 */
export function allowedOrigins(): Set<string> | null {
  if (process.env.NODE_ENV !== "production") return null;
  const origins = (process.env.WEB_ORIGIN ?? "")
    .split(",")
    .map((o) => o.trim().replace(/\/$/, ""))
    .filter(Boolean);
  return new Set(origins);
}

/** Message d'erreur si `WEB_ORIGIN` manque en production (sinon aucun navigateur ne pourrait se connecter). */
export function webOriginError(): string | null {
  const origins = allowedOrigins();
  if (origins && origins.size === 0) return "WEB_ORIGIN manquant : indique l'adresse publique du site (ex. https://calculus.fr).";
  return null;
}
