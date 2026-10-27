import "server-only";

/** Longueur minimale d'un secret de production, en caractères (`openssl rand -base64 32` en donne 44). */
const MIN_SECRET_LENGTH = 32;

/**
 * Refuse de démarrer en production avec un secret vide, trop court ou recopié de `.env.example`.
 * Better Auth ne refuse que son propre secret par défaut : avec une valeur publique, on pourrait signer
 * soi-même des cookies de session ou des jetons de jeu.
 */
function assertProductionSecret(name: string, value: string | undefined) {
  if (!value || value.includes("remplace-moi") || value.length < MIN_SECRET_LENGTH)
    throw new Error(`${name} invalide : génère une valeur avec \`openssl rand -base64 32\` (${MIN_SECRET_LENGTH} caractères au moins).`);
}

/** Vérifie les secrets du site au démarrage, en production seulement. */
export function assertProductionSecrets() {
  if (process.env.NODE_ENV !== "production") return;
  assertProductionSecret("BETTER_AUTH_SECRET", process.env.BETTER_AUTH_SECRET);
  assertProductionSecret("GAME_TOKEN_SECRET", process.env.GAME_TOKEN_SECRET);
  if (process.env.BETTER_AUTH_SECRET === process.env.GAME_TOKEN_SECRET)
    throw new Error("BETTER_AUTH_SECRET et GAME_TOKEN_SECRET doivent être différents.");
}
