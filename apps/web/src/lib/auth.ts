import "server-only";
import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { headers } from "next/headers";
import { eraseUserGames, prisma } from "@calculus/db";
import { sendEmail } from "./email";
import { isDivisionDisplay } from "./division";
import { cleanName } from "./names";

// En production, l'adresse du site doit être fixée : sinon les liens des e-mails pointeraient vers localhost.
if (process.env.NODE_ENV === "production" && !process.env.BETTER_AUTH_URL) {
  throw new Error("BETTER_AUTH_URL manquant : indique l'adresse publique du site.");
}

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

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    autoSignIn: true,
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
    },
    // Droit à l'effacement (RGPD) : le profil demande le mot de passe, Better Auth le vérifie.
    deleteUser: { enabled: true, beforeDelete: async (user) => eraseUserGames(user.id) },
  },
  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          checkDivisionDisplay(user);
          return { data: { ...user, name: validName(user.name) } };
        },
      },
      // `name` vaut undefined quand seul un autre champ change (préférences de dictée, de divisions).
      update: {
        before: async (data) => {
          checkDivisionDisplay(data);
          return { data: data.name !== undefined ? { ...data, name: validName(data.name) } : data };
        },
      },
    },
  },
  // Compteurs en base : en mémoire, chaque instance serverless (Vercel) aurait les siens et la limite ne tiendrait pas.
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
