import { createServer } from "node:http";
import { Server } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { GameRoom } from "./GameRoom";
import { publicLobbies } from "./publicLobbies";

// GAME_SERVER_PORT en local ; PORT est fourni automatiquement par les hébergeurs (Railway…).
const port = Number(process.env.GAME_SERVER_PORT ?? process.env.PORT ?? 2567);

if (!process.env.GAME_TOKEN_SECRET) {
  console.error("GAME_TOKEN_SECRET manquant. Copie .env.example en .env à la racine du projet.");
  process.exit(1);
}

// Route de santé pour l'hébergeur, et liste des lobbys publics pour l'accueil du site.
// Colyseus ajoute ses propres routes (/matchmake).
const httpServer = createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "content-type": "text/plain" });
    res.end("ok");
    return;
  }
  if (req.url === "/lobbies" && req.method === "GET") {
    // Données publiques (n'importe qui peut rejoindre ces lobbys), sans cookie : tout site peut les lire.
    res.writeHead(200, {
      "content-type": "application/json",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
    });
    res.end(JSON.stringify(publicLobbies.list(Date.now())));
    return;
  }
  res.writeHead(404);
  res.end();
});

const gameServer = new Server({
  transport: new WebSocketTransport({ server: httpServer }),
});

gameServer.define("game", GameRoom);
// Arrêt : on ne recrée plus de lobby public pendant la fermeture des salles.
gameServer.onBeforeShutdown(() => publicLobbies.stop());

gameServer.listen(port).then(() => {
  console.log(`Serveur de jeu prêt sur le port ${port}`);
  publicLobbies.start();
});
