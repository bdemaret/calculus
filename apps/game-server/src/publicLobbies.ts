import { randomBytes, randomUUID } from "node:crypto";
import { matchMaker } from "@colyseus/core";
import {
  PUBLIC_LOBBY_COUNT,
  createRng,
  randomPublicSettings,
  type PublicLobbyInfo,
  type PublicLobbyList,
} from "@calculus/game-core";

/** Délai avant de réessayer de créer un lobby public après un échec, en ms. */
const RETRY_MS = 5000;

/**
 * Clé secrète propre à ce processus : seul le serveur peut créer un lobby public.
 * Un navigateur peut passer n'importe quelle option à `create("game")`, mais pas celle-ci.
 */
export const PUBLIC_LOBBY_KEY = randomUUID();

/**
 * Registre des lobbys publics affichés sur l'accueil. Il en garde PUBLIC_LOBBY_COUNT ouverts :
 * dès qu'un lobby se lance (plein ou à la fin de l'attente) ou disparaît (personne n'est venu),
 * la salle le retire d'ici et un nouveau lobby tiré au hasard le remplace.
 */
class PublicLobbies {
  private lobbies = new Map<string, PublicLobbyInfo>();
  /** Lobbys en cours de création, pour ne pas en créer trop. */
  private creating = 0;
  private running = false;
  private retry: NodeJS.Timeout | null = null;

  start() {
    this.running = true;
    this.fill();
  }

  stop() {
    this.running = false;
    if (this.retry) clearTimeout(this.retry);
    this.retry = null;
  }

  /** Ajoute ou met à jour un lobby (appelé par la salle à chaque arrivée ou départ). */
  update(info: PublicLobbyInfo) {
    this.lobbies.set(info.code, info);
  }

  /** Retire un lobby de la liste et le remplace. Sans effet s'il n'y est plus. */
  release(code: string) {
    if (!this.lobbies.delete(code)) return;
    this.fill();
  }

  list(now: number): PublicLobbyList {
    const lobbies = [...this.lobbies.values()].sort((a, b) => a.startsAt - b.startsAt);
    return { serverNow: now, lobbies };
  }

  private fill() {
    while (this.running && this.lobbies.size + this.creating < PUBLIC_LOBBY_COUNT) {
      this.creating += 1;
      const settings = randomPublicSettings(createRng(randomBytes(16).toString("base64url")), [...this.lobbies.values()].map((l) => l.settings));
      matchMaker.createRoom("game", { publicKey: PUBLIC_LOBBY_KEY, settings }).then(
        () => {
          this.creating -= 1;
          // Un lobby a pu se lancer pendant la création : on complète si besoin.
          this.fill();
        },
        (err: unknown) => {
          this.creating -= 1;
          console.error("Création d'un lobby public impossible :", err);
          if (this.running && !this.retry) {
            this.retry = setTimeout(() => {
              this.retry = null;
              this.fill();
            }, RETRY_MS);
          }
        },
      );
    }
  }
}

export const publicLobbies = new PublicLobbies();
