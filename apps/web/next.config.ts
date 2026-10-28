import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

// Les variables d'environnement viennent du fichier .env à la racine du projet :
// elles sont chargées par les scripts de package.json (dotenv -e ../../.env).

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const dev = process.env.NODE_ENV !== "production";

/** Origines du serveur de jeu : WebSocket et la même adresse en http(s) (matchmaking, `/lobbies`). */
function gameServerOrigins(): string[] {
  try {
    const url = new URL(process.env.NEXT_PUBLIC_GAME_SERVER_URL ?? "ws://localhost:2567");
    return [url.origin, new URL(url.href.replace(/^ws/, "http")).origin];
  } catch {
    return [];
  }
}

/**
 * Politique de contenu. Le script de thème en ligne et les scripts d'amorçage de Next demandent
 * 'unsafe-inline' (sans nonce) ; le reste ferme l'essentiel : pas d'iframe chez un autre site
 * (clickjacking), pas de plugin, pas de formulaire ni de connexion vers un hôte inconnu.
 * En développement, le site ouvert depuis le réseau local vise le serveur de jeu par l'IP de la page,
 * et le rechargement à chaud demande `eval` et un WebSocket : on y relâche `connect-src` et `script-src`.
 */
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob:",
  `connect-src 'self' ${dev ? "ws: wss: http: https:" : gameServerOrigins().join(" ")}`,
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // La dictée des réponses utilise le micro du site lui-même ; rien d'autre n'est demandé.
  { key: "Permissions-Policy", value: "camera=(), geolocation=(), microphone=(self), payment=(), usb=()" },
  ...(dev ? [] : [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }]),
];

const config: NextConfig = {
  // Les tests e2e lancent leur propre serveur à côté de `pnpm dev` : dossier de build séparé.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  transpilePackages: ["@calculus/game-core", "@calculus/db"],
  serverExternalPackages: ["@prisma/client"],
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default withNextIntl(config);
