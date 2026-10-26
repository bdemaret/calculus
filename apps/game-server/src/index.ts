import { createServer } from "node:http";
import { Server } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { GameRoom } from "./GameRoom";

// GAME_SERVER_PORT en local ; PORT est fourni automatiquement par les hébergeurs (Railway…).
const port = Number(process.env.GAME_SERVER_PORT ?? process.env.PORT ?? 2567);

if (!process.env.GAME_TOKEN_SECRET) {
  console.error("GAME_TOKEN_SECRET manquant. Copie .env.example en .env à la racine du projet.");
  process.exit(1);
}

// Petite route de santé pour l'hébergeur. Colyseus ajoute ses propres routes (/matchmake).
const httpServer = createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "content-type": "text/plain" });
    res.end("ok");
    return;
  }
  res.writeHead(404);
  res.end();
});

const gameServer = new Server({
  transport: new WebSocketTransport({ server: httpServer }),
});

gameServer.define("game", GameRoom);

gameServer.listen(port).then(() => {
  console.log(`Serveur de jeu prêt sur le port ${port}`);
});
