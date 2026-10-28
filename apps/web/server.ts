import { createServer } from "node:http";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import next from "next";

/*
 * Site et serveur de jeu dans un seul processus, sur un seul port (production chez Scalingo :
 * une seule application). Le serveur de jeu répond à ses routes (/health, /lobbies, /admin/rooms,
 * /matchmake et les WebSockets), Next à tout le reste. Le site appelle donc le serveur de jeu
 * à sa propre adresse : NEXT_PUBLIC_GAME_SERVER_URL = wss://<adresse du site>.
 * En développement et dans les tests e2e, les deux restent séparés (`pnpm dev`).
 */

const port = Number(process.env.PORT ?? 3000);

// Même origine pour le site et le jeu : sans WEB_ORIGIN, on autorise l'adresse du site.
// Avant d'importer le serveur de jeu, qui lit cette variable au chargement (`limits.ts`).
if (!process.env.WEB_ORIGIN && process.env.BETTER_AUTH_URL) {
  process.env.WEB_ORIGIN = new URL(process.env.BETTER_AUTH_URL).origin;
}
const { gameServerStartError, handleGameHttp, startGameServer } = await import("@calculus/game-server/server");

const startError = gameServerStartError();
if (startError) {
  console.error(startError);
  process.exit(1);
}

const app = next({ dev: false, dir: dirname(fileURLToPath(import.meta.url)) });
await app.prepare();
const handle = app.getRequestHandler();

const httpServer = createServer((req, res) => {
  if (handleGameHttp(req, res)) return;
  void handle(req, res);
});

await startGameServer(httpServer, port);
console.log(`Site et serveur de jeu prêts sur le port ${port}`);
