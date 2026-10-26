import { saveGame } from "@calculus/db";
import type { GameEngine } from "@calculus/game-core";

interface PersistInput {
  code: string;
  engine: GameEngine;
  startedAt: Date;
  hostUserId: string | null;
  guestById: Map<string, boolean>;
}

/** Enregistre la partie en base. Une erreur ici ne doit jamais interrompre le jeu. */
export async function persistGame({ code, engine, startedAt, hostUserId, guestById }: PersistInput): Promise<void> {
  if (engine.history.length === 0) return;
  const userIds: Record<string, string | null> = {};
  for (const p of engine.players) userIds[p.id] = guestById.get(p.id) === false ? p.id : null;
  try {
    const id = await saveGame({
      code,
      solo: false,
      hostUserId,
      settings: engine.settings,
      seed: engine.seed,
      startedAt,
      endedAt: new Date(),
      standings: engine.standings(),
      history: engine.history,
      userIds,
    });
    console.log(`[partie] ${code} enregistrée (${id})`);
  } catch (err) {
    console.error(`[partie] ${code} : échec de l'enregistrement`, err);
  }
}
