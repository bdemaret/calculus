import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

// Ajoute /fr ou /en à chaque adresse, selon la langue du navigateur.
export default createMiddleware(routing);

export const config = {
  matcher: "/((?!api|_next|_vercel|.*\\..*).*)",
};
