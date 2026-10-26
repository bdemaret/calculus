import { Room, type Client } from "@colyseus/core";

/** Intervalle minimal entre deux diffusions du compteur, en ms (évite une rafale à chaque arrivée). */
const BROADCAST_MS = 2000;
/** Au-delà, Colyseus ouvre une autre salle de présence ; le compteur reste global. */
const MAX_CLIENTS = 5000;

/** Toutes les salles de présence ouvertes, pour additionner leurs clients. */
const rooms = new Set<PresenceRoom>();

function onlineCount(): number {
  let total = 0;
  for (const room of rooms) total += room.clients.length;
  return total;
}

/**
 * Salle de présence : chaque onglet ouvert sur le site la rejoint, sans compte ni jeton.
 * Elle ne fait que diffuser le nombre de visiteurs connectés et n'accepte aucun message.
 */
export class PresenceRoom extends Room {
  maxClients = MAX_CLIENTS;

  private lastSent = -1;

  onCreate() {
    rooms.add(this);
    // Toute entrée est ignorée : rien à valider ni à limiter.
    this.onMessage("*", () => {});
    this.clock.setInterval(() => {
      const count = onlineCount();
      if (count === this.lastSent) return;
      this.lastSent = count;
      this.broadcast("online", { count });
    }, BROADCAST_MS);
  }

  onJoin(client: Client) {
    client.send("online", { count: onlineCount() });
  }

  onDispose() {
    rooms.delete(this);
  }
}
