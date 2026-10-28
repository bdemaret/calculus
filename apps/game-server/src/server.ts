import type { IncomingMessage, Server as HttpServer, ServerResponse } from "node:http";
import { Server } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { PRESENCE_ROOM } from "@calculus/game-core";
import { GameRoom, liveRooms } from "./GameRoom";
import { PresenceRoom } from "./PresenceRoom";
import { gameTokenSecretError, webOriginError } from "./env";
import { verifyWebSocket } from "./limits";
import { verifyAdminToken } from "./token";
import { publicLobbies } from "./publicLobbies";

/*
 * Serveur de jeu, branchable sur n'importe quel serveur HTTP : le sien (`index.ts`, processus séparé)
 * ou celui du site (`apps/web/server.ts`, un seul processus pour les deux en production).
 */

/** Message d'erreur si la configuration empêche de démarrer, null sinon. */
export function gameServerStartError(): string | null {
  return gameTokenSecretError() ?? webOriginError();
}

/**
 * Routes HTTP du serveur de jeu : santé, lobbys publics (accueil du site), parties en cours (panel admin).
 * Renvoie false si l'adresse n'en est pas une (au serveur hôte de répondre).
 * Colyseus ajoute ses propres routes (/matchmake) en se branchant sur le serveur HTTP.
 */
export function handleGameHttp(req: IncomingMessage, res: ServerResponse): boolean {
  if (req.url === "/health") {
    res.writeHead(200, { "content-type": "text/plain" });
    res.end("ok");
    return true;
  }
  if (req.url === "/lobbies" && req.method === "GET") {
    // Données publiques (n'importe qui peut rejoindre ces lobbys), sans cookie : tout site peut les lire.
    res.writeHead(200, {
      "content-type": "application/json",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
    });
    res.end(JSON.stringify(publicLobbies.list(Date.now())));
    return true;
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
    return true;
  }
  return false;
}

/**
 * Branche Colyseus sur `httpServer` (WebSockets et /matchmake) et le met à l'écoute sur `port`.
 * Le serveur HTTP doit déjà répondre aux autres adresses (`handleGameHttp`, puis son propre contenu).
 */
export async function startGameServer(httpServer: HttpServer, port: number): Promise<void> {
  const gameServer = new Server({
    // Origine du site et plafond de connexions par IP vérifiés avant d'accepter le WebSocket (`limits.ts`).
    transport: new WebSocketTransport({ server: httpServer, verifyClient: verifyWebSocket }),
  });
  gameServer.define("game", GameRoom);
  gameServer.define(PRESENCE_ROOM, PresenceRoom);
  // Arrêt : on ne recrée plus de lobby public pendant la fermeture des salles.
  gameServer.onBeforeShutdown(() => publicLobbies.stop());
  await gameServer.listen(port);
  publicLobbies.start();
}
