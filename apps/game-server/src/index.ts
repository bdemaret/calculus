import { createServer } from "node:http";
import { Server } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { PRESENCE_ROOM } from "@calculus/game-core";
import { GameRoom, liveRooms } from "./GameRoom";
import { PresenceRoom } from "./PresenceRoom";
import { gameTokenSecretError } from "./env";
import { verifyAdminToken } from "./token";
import { publicLobbies } from "./publicLobbies";

// GAME_SERVER_PORT en local ; PORT est fourni automatiquement par les hébergeurs (Railway…).
const port = Number(process.env.GAME_SERVER_PORT ?? process.env.PORT ?? 2567);

const secretError = gameTokenSecretError();
if (secretError) {
  console.error(secretError);
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
  // Parties en cours, pour le panel administrateur du site (appel de serveur à serveur, jeton signé).
  if (req.url === "/admin/rooms" && req.method === "GET") {
    void verifyAdminToken(req.headers.authorization).then((ok) => {
      if (!ok) {
        res.writeHead(401, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "unauthorized" }));
        return;
      }
      res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
      res.end(JSON.stringify({ rooms: [...liveRooms].map((r) => r.adminSummary()), serverNow: Date.now() }));
    });
    return;
  }
  res.writeHead(404);
  res.end();
});

const gameServer = new Server({
  transport: new WebSocketTransport({ server: httpServer }),
});

gameServer.define("game", GameRoom);
gameServer.define(PRESENCE_ROOM, PresenceRoom);
// Arrêt : on ne recrée plus de lobby public pendant la fermeture des salles.
gameServer.onBeforeShutdown(() => publicLobbies.stop());

gameServer.listen(port).then(() => {
  console.log(`Serveur de jeu prêt sur le port ${port}`);
  publicLobbies.start();
});
