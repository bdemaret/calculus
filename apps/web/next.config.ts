import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

// Les variables d'environnement viennent du fichier .env à la racine du projet :
// elles sont chargées par les scripts de package.json (dotenv -e ../../.env).

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const config: NextConfig = {
  transpilePackages: ["@calculus/game-core", "@calculus/db"],
  serverExternalPackages: ["@prisma/client"],
};

export default withNextIntl(config);
