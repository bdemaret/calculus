# apps/game-server

Serveur Colyseus 0.16 (`@colyseus/core` + `ws-transport`), lancé avec `tsx` (pas de build). Port `GAME_SERVER_PORT` ou `PORT` (défaut 2567). Route `/health` pour l'hébergeur.

| Fichier | Rôle |
| --- | --- |
| `src/index.ts` | Serveur HTTP + définition de la salle `"game"` |
| `src/GameRoom.ts` | Une salle = un lobby persistant d'une partie à l'autre |
| `src/token.ts` | `verifyGameToken` : vérifie le JWT émis par le site |
| `src/persist.ts` | `persistGame` → `saveGame` de `@calculus/db` (erreurs loguées, jamais propagées), renvoie les changements d'Elo |

## GameRoom

- **Phases** (`RoomPhase`) : `lobby → countdown (3 s) → question → round-result (2,2 s) → … → finished`.
- **Autorité serveur** : questions générées côté serveur, chronométrage à la réception (+ `LATENCY_GRACE_MS` = 150 ms), une seule réponse par joueur et par calcul, réponse jamais incluse dans le snapshot avant la fin de manche.
- **Anti-abus** : `MAX_MESSAGES_PER_SECOND` = 10 par joueur ; chaque message est validé par un schéma Zod (`answerSchema`, `readySchema`, `typingSchema`, `kickSchema`) ou `sanitizeSettings`. Tout nouveau message doit suivre ce modèle.
- **État envoyé** : un `RoomSnapshot` complet (`broadcastSnapshot()`) après chaque changement, plutôt que le state synchronisé de Colyseus.
- **Hôte** : si l'hôte part, la main passe au membre arrivé le plus tôt (`members` est une `Map` ordonnée par arrivée).
- **Reconnexion** : 30 s (`RECONNECT_SECONDS`).
- **Elo** : une fois la partie enregistrée, `finish()` place les changements d'Elo dans `RoomSnapshot.ratings` et rediffuse (sauf si une autre partie a commencé entre-temps).
- **Rejouer** : `replay-same` relance avec les mêmes réglages ; `replay-new` ramène au lobby.
- Timers : toujours via `this.clock.setTimeout` (stockés dans `this.timer`), jamais `setTimeout` global.

## Ajouter un message réseau

1. Déclarer son type dans `ClientMessages` / `ServerMessages` (`packages/game-core/src/protocol.ts`).
2. `this.onMessage(...)` dans `GameRoom` avec validation Zod + `allowMessage` (rate limit) + vérification de rôle (hôte ?) et de phase.
3. Côté client : `apps/web/src/lib/colyseus.ts` / `LobbyClient.tsx`.
