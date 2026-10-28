import { createServer } from "node:http";
import { gameServerStartError, handleGameHttp, startGameServer } from "./server";

// Serveur de jeu seul, dans son propre processus (développement, tests e2e, ou hébergement séparé du site).

// GAME_SERVER_PORT en local ; PORT est fourni automatiquement par les hébergeurs (Scalingo…).
const port = Number(process.env.GAME_SERVER_PORT ?? process.env.PORT ?? 2567);

const startError = gameServerStartError();
if (startError) {
  console.error(startError);
  process.exit(1);
}

const httpServer = createServer((req, res) => {
  if (handleGameHttp(req, res)) return;
  res.writeHead(404);
  res.end();
});

await startGameServer(httpServer, port);
console.log(`Serveur de jeu prêt sur le port ${port}`);
