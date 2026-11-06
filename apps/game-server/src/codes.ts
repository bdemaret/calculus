import { randomInt } from "node:crypto";
import { CODE_ALPHABET, CODE_LENGTH } from "@calculus/game-core";
import type { DungeonRoom } from "./DungeonRoom";

/** Codes des salles ouvertes (lobbys et donjons) : un code est aussi l'id Colyseus de la salle, unique pour tout le serveur. */
export const activeCodes = new Set<string>();

/**
 * Code de salle tiré avec `node:crypto` : avec `Math.random`, les codes affichés permettraient
 * de retrouver l'état du générateur, donc de prédire les graines des parties.
 */
export function generateCode(): string {
  for (;;) {
    let code = "";
    for (let i = 0; i < CODE_LENGTH; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
    if (!activeCodes.has(code)) return code;
  }
}

/** Donjons ouverts dans ce processus (comptés dans le plafond `MAX_GAME_ROOMS` avec les lobbys). */
export const liveDungeons = new Set<DungeonRoom>();
