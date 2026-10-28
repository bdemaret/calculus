import "server-only";
import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { headers } from "next/headers";
import { eraseUserGames, prisma } from "@calculus/db";
import { sendEmail } from "./email";
import { isDivisionDisplay } from "./division";
import { assertProductionSecrets } from "./env";
import { cleanName } from "./names";

// En production, l'adresse du site doit être fixée : sinon les liens des e-mails pointeraient vers localhost.
if (process.env.NODE_ENV === "production" && !process.env.BETTER_AUTH_URL) {
  throw new Error("BETTER_AUTH_URL manquant : indique l'adresse publique du site.");
}
// Importé par toute route ou page qui lit la session : les secrets sont vérifiés dès le démarrage.
assertProductionSecrets();

/** Nettoie le pseudo côté serveur (le formulaire ne suffit pas : l'API est appelable directement). */
function validName(raw: unknown): string {
  const name = typeof raw === "string" ? cleanName(raw) : "";
  if (!name) throw new APIError("BAD_REQUEST", { code: "INVALID_NAME", message: "Pseudo invalide" });
  return name;
}

/** Refuse toute valeur d'affichage des divisions inconnue (champ modifiable par l'API). */
function checkDivisionDisplay(data: Record<string, unknown>) {
  if (data.divisionDisplay !== undefined && !isDivisionDisplay(data.divisionDisplay))
    throw new APIError("BAD_REQUEST", { code: "INVALID_DIVISION_DISPLAY", message: "Affichage des divisions invalide" });
}

/** Seule une adresse posée par `/api/avatar` est acceptée : l'API Better Auth laisserait sinon mettre n'importe quelle URL. */
const AVATAR_URL = /^\/api\/avatar\/[A-Za-z0-9_-]{1,64}\?v=\d{1,15}$/;
function checkImage(data: Record<string, unknown>) {
  if (data.image !== undefined && data.image !== null && !(typeof data.image === "string" && AVATAR_URL.test(data.image)))
    throw new APIError("BAD_REQUEST", { code: "INVALID_IMAGE", message: "Photo de profil invalide" });
}

/** Adresse IPv4 privée (réseau local : 10.x, 172.16-31.x, 192.168.x). */
const PRIVATE_IPV4 = /^(10\.\d{1,3}|172\.(1[6-9]|2\d|3[01])|192\.168)\.\d{1,3}\.\d{1,3}$/;

/**
 * En développement seulement : le site ouvert depuis le réseau local (téléphone, autre poste,
 * ex. http://192.168.1.102:3000) envoie une origine différente de `BETTER_AUTH_URL`, que Better Auth
 * refuserait (« Invalid origin »). On accepte alors l'origine de la requête si elle vise une IP privée.
 */
function devLanOrigins(request?: Request): string[] {
  const origin = request?.headers.get("origin");
  if (!origin) return [];
  try {
    const url = new URL(origin);
    return url.protocol === "http:" && PRIVATE_IPV4.test(url.hostname) ? [url.origin] : [];
  } catch {
    return [];
  }
}

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
  ...(process.env.NODE_ENV !== "production" && { trustedOrigins: devLanOrigins }),
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    autoSignIn: true,
    // Après un « mot de passe oublié » (souvent un compte volé), les autres sessions sont fermées.
    revokeSessionsOnPasswordReset: true,
    async sendResetPassword({ user, url }) {
      await sendEmail({
        to: user.email,
        subject: "Calculus · nouveau mot de passe",
        text: `Bonjour ${user.name},\n\nPour choisir un nouveau mot de passe, ouvre ce lien (valable 1 heure) :\n${url}\n\nSi tu n'as rien demandé, ignore cet e-mail.`,
      });
    },
  },
  user: {
    additionalFields: {
      /** Préférence de saisie : dicter les réponses au lieu de les taper. */
      voiceInput: { type: "boolean", required: false, defaultValue: false },
      /** Préférence d'affichage : divisions « 12 ÷ 4 » (standard) ou en fraction. */
      divisionDisplay: { type: "string", required: false, defaultValue: "standard" },
      /** Préférence d'aide : conseils de technique de calcul en fin de partie. */
      showTips: { type: "boolean", required: false, defaultValue: true },
    },
    // Droit à l'effacement (RGPD) : le profil demande le mot de passe, Better Auth le vérifie.
    deleteUser: { enabled: true, beforeDelete: async (user) => eraseUserGames(user.id) },
  },
  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          checkDivisionDisplay(user);
          // Pas de photo à l'inscription : elle s'ajoute depuis le profil.
          return { data: { ...user, image: null, name: validName(user.name) } };
        },
      },
      // `name` vaut undefined quand seul un autre champ change (préférences de dictée, de divisions).
      update: {
        before: async (data) => {
          checkDivisionDisplay(data);
          checkImage(data);
          return { data: data.name !== undefined ? { ...data, name: validName(data.name) } : data };
        },
      },
    },
  },
  // Compteurs en base : en mémoire, chaque instance (ou redémarrage) aurait les siens et la limite ne tiendrait pas.
  // Désactivable seulement pour les tests e2e, qui créent des dizaines de comptes depuis la même IP.
  rateLimit: { storage: "database", enabled: process.env.AUTH_RATE_LIMIT_DISABLED === "1" ? false : undefined },
  session: {
    expiresIn: 60 * 60 * 24 * 30, // 30 jours
    cookieCache: { enabled: true, maxAge: 60 * 5 },
  },
  plugins: [nextCookies()],
});

/** Session de l'utilisateur courant (ou null), depuis un composant serveur ou une route. */
export async function getSession() {
  return auth.api.getSession({ headers: await headers() });
}
