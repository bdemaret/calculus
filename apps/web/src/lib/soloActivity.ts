import type { GameSettings } from "@calculus/game-core";

/** Intervalle des battements d'une partie solo en cours (le serveur la croit abandonnée après 75 s sans signal). */
export const SOLO_ACTIVITY_PING_MS = 30_000;

export interface SoloProgress {
  rounds: number;
  correct: number;
}

/**
 * Suivi d'une partie solo pour le panel administrateur (invités compris).
 * Au mieux : une erreur réseau ne gêne jamais la partie.
 */
export class SoloActivity {
  /** Id de la partie côté serveur, connu une fois la réponse au début reçue. */
  id: string | null = null;
  private open = true;
  private readonly ready: Promise<string | null>;

  constructor(settings: GameSettings) {
    this.ready = send({ event: "start", settings })
      .then(async (res) => (res?.ok ? ((await res.json()) as { id: string }).id : null))
      .catch(() => null)
      .then((id) => (this.id = id));
  }

  ping(progress: SoloProgress) {
    if (this.open) this.signal({ event: "ping", ...progress });
  }

  /** `end` : partie allée au bout ; `quit` : abandonnée (bouton, autre page, onglet fermé). */
  close(event: "end" | "quit", progress: SoloProgress) {
    if (!this.open) return;
    this.open = false;
    this.signal({ event, ...progress });
  }

  private signal(body: object) {
    void this.ready.then((id) => {
      if (id) void send({ ...body, id });
    });
  }
}

function send(body: object): Promise<Response | null> {
  // `keepalive` : le signal part même si la page se ferme.
  return fetch("/api/solo-activity", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    keepalive: true,
  }).catch(() => null);
}
