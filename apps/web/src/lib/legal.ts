import "server-only";

/** Date de dernière mise à jour des textes légaux (à changer à chaque modification de fond). */
export const LEGAL_UPDATED = "2026-10-26";

/**
 * Coordonnées de l'éditeur, lues dans l'environnement pour ne pas les publier dans le dépôt.
 * `LEGAL_PUBLISHER` vide : éditeur particulier resté anonyme (identité confiée à l'hébergeur, art. 6-III-2 LCEN).
 */
export function legalContacts() {
  return {
    publisher: process.env.LEGAL_PUBLISHER?.trim() ?? "",
    contact: process.env.LEGAL_CONTACT_EMAIL?.trim() ?? "",
  };
}
