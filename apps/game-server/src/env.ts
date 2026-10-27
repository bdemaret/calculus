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
