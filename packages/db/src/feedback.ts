/* Constantes des retours, sans dépendance à Prisma : importables depuis un composant client (`@calculus/db/feedback`). */

export const FEEDBACK_KINDS = ["bug", "idea", "other"] as const;
export type FeedbackKindName = (typeof FEEDBACK_KINDS)[number];
/** Retours acceptés par heure : par compte, et pour l'ensemble des invités (pas d'IP enregistrée). */
export const FEEDBACK_PER_USER_PER_HOUR = 10;
export const FEEDBACK_GUESTS_PER_HOUR = 60;
export const FEEDBACK_MIN_LENGTH = 5;
export const FEEDBACK_MAX_LENGTH = 2000;
