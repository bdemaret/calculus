import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

// Les variables d'environnement viennent du fichier .env à la racine du projet :
// elles sont chargées par les scripts de package.json (dotenv -e ../../.env).

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const config: NextConfig = {
  // Les tests e2e lancent leur propre serveur à côté de `pnpm dev` : dossier de build séparé.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  transpilePackages: ["@calculus/game-core", "@calculus/db"],
  serverExternalPackages: ["@prisma/client"],
};

export default withNextIntl(config);
