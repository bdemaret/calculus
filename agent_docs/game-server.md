# apps/game-server

Serveur Colyseus 0.16 (`@colyseus/core` + `ws-transport`), lancé avec `tsx` (pas de build). Port `GAME_SERVER_PORT` ou `PORT` (défaut 2567). Route `/health` pour l'hébergeur.

| Fichier | Rôle |
| --- | --- |
| `src/index.ts` | Serveur HTTP (`/health`, `/lobbies`) + définition de la salle `"game"` + `GET /admin/rooms` (`rooms` et `dungeons` en cours pour le panel admin du site, `Authorization: Bearer <jwt>` vérifié par `verifyAdminToken`) |
| `src/GameRoom.ts` | Une salle = un lobby persistant d'une partie à l'autre |
| `src/DungeonRoom.ts` | Salle `"dungeon"` (`DUNGEON_ROOM`) : un lobby Donjons, comptes seulement (voir § DungeonRoom) |
| `scripts/dungeon-bots.mts` | `pnpm dungeon:bots [CODE] [--bots 1..3] [--difficulty 1..5] [--accuracy 0..1]` : bots de donjon pour tester à la main en local (jeton signé avec `GAME_TOKEN_SECRET` du `.env`). Sans code, un bot hôte ouvre un donjon, affiche le lien et lance dès qu'un vrai joueur entre ; avec un code, les bots entrent dans le donjon du joueur. Ils vont le plus souvent vers le boss (`roomsTowardBoss`), répondent avec `solveDungeonQuestion`, distribuent le butin, n'utilisent pas leurs objets |
| `src/codes.ts` | `generateCode` / `activeCodes` (codes de salle uniques, lobbys et donjons confondus), `liveDungeons` |
| `src/publicLobbies.ts` | Registre des lobbys publics de l'accueil (`publicLobbies`) et `PUBLIC_LOBBY_KEY` |
| `src/PresenceRoom.ts` | Salle `"presence"` (`PRESENCE_ROOM`) : chaque onglet du site la rejoint sans jeton ; diffuse `online` { count } (total de toutes les salles de présence) au plus toutes les 2 s, n'accepte aucun message |
| `src/token.ts` | `verifyGameToken` : vérifie le JWT émis par le site |
| `src/persist.ts` | `persistGame` → `saveGame` de `@calculus/db` (erreurs loguées, jamais propagées), renvoie les changements d'Elo ; `persistDungeon` → `saveDungeonRun`, renvoie l'id de l'expédition ; `clearInvites` efface les invitations vers le lobby au lancement d'une partie et à la fermeture de la salle |

## GameRoom

- **Phases** (`RoomPhase`) : `lobby → countdown (3 s) → question → round-result → … → finished`. `round-result` dure `rules.resultMs` du mode (battle royale 2,2 s, course de vitesse `SPEED_RACE_RESULT_MS` = 4 s) : `lastRound` (calcul, bonne réponse, qui a marqué) part à tous, les réponses et la saisie (`typing`) sont ignorées jusqu'à la manche suivante. À la bombe, chaque manche commence par `build` (jusqu'à `buildTime`, ou dès que tous les joueurs en lice ont envoyé leur bombe) puis `assign` (`ASSIGN_MS` = 3 s, on montre qui désamorce quoi) avant `question`.
- **Panel administrateur** : `adminSummary()` utilise un instantané vu par personne (`snapshot("")`) : à la bombe, aucune bombe n'y figure.
- **Snapshots personnalisés** : `broadcastSnapshot` envoie à chaque membre son propre `snapshot(id)`. À la bombe, `question` est le tirage pendant `build`, puis la bombe de ce joueur seulement (null pour un spectateur) ; `bomb` donne qui a construit, sa propre bombe et les paires (sans les bombes). Les bombes et leurs valeurs n'arrivent qu'en `round-result` (`lastRound.bombs`).
- **Message `bomb`** (`bombSchema` : `roundIndex`, `expr` ≤ 64) : seulement en phase `build`, une fois par joueur ; réponse `bomb-ack` (acceptée avec le texte et la valeur, ou refusée avec la raison).
- **Autorité serveur** : questions générées côté serveur, chronométrage à la réception (+ `LATENCY_GRACE_MS` = 150 ms), une seule réponse par joueur et par calcul, réponse jamais incluse dans le snapshot avant la fin de manche.
- **Authentification** : `static onAuth` vérifie le jeton pendant le matchmaking, donc avant de créer une salle ou de réserver une place (sans jeton valide, rien n'est créé). Les vérifications propres à la salle (`in-progress`, `duplicate`, `full`) sont dans `onJoin`.
- **Salles privées** : `setPrivate(true)` dans `onCreate` ; on n'entre qu'avec le code (`joinById`), jamais par `join("game")`.
- **Anti-abus** : tous les messages passent par `this.on(type, handler)`, qui vérifie que l'expéditeur est membre et applique `MAX_MESSAGES_PER_SECOND` = 20 par joueur, tous types confondus. Chaque message est ensuite validé par un schéma Zod (`answerSchema` : `value` | `expr` | `op`, la forme attendue par le jeu étant vérifiée par le moteur ; `readySchema` ; `typingSchema` : chiffres, symbole d'opérateur ou expression, 64 caractères au plus ; `kickSchema`) ou `sanitizeSettings`. Tout nouveau message doit suivre ce modèle.
- **État envoyé** : un `RoomSnapshot` complet (`broadcastSnapshot()`) après chaque changement, plutôt que le state synchronisé de Colyseus.
- **Départs à la bombe** : pendant `build`, partie finie → manche annulée et `finish()` ; sinon, si tous ceux qui restent ont construit, on passe à `assign`.
- **Joueurs minimum** : `start` et `replay-same` sont refusés sous `GAMES[game].minPlayers` joueurs connectés (message `error` `not-enough-players` à l'hôte ; le site grise aussi le bouton).
- **Hôte** : si l'hôte part, la main passe au membre arrivé le plus tôt (`members` est une `Map` ordonnée par arrivée).
- **Reconnexion** : 30 s (`RECONNECT_SECONDS`). Un absent retiré entre-temps (lancement d'une partie, retour au lobby) n'est plus retiré une seconde fois à l'expiration : `onLeave` vérifie que `members.get(id)` est toujours le même membre, sinon un joueur revenu sous le même compte serait exclu ; une reprise sur une place disparue est refermée. Même règle dans `DungeonRoom`. Le site reprend sa place tout seul (`recover` dans `apps/web/src/lib/colyseus.ts`) après une fermeture non voulue, ou après 10 s sans réponse à son `hello` envoyé toutes les 4 s (WebSocket mort sans fermeture sur un réseau de téléphone) ; l'état et la saisie restent à l'écran.
- **Titre** : lu dans le jeton par `verifyGameToken` (validé contre `TITLE_IDS`), gardé sur le membre, diffusé dans `LobbyPlayer.title`.
- **Elo et succès** : une fois la partie enregistrée, `finish()` place les changements d'Elo dans `RoomSnapshot.ratings`, les succès débloqués dans `RoomSnapshot.unlocks`, et rediffuse (sauf si une autre partie a commencé entre-temps). Une partie non classée n'a pas d'Elo mais peut débloquer des succès.
- **Administration** : chaque salle s'inscrit dans `liveRooms` (retirée dans `onDispose`) ; `adminSummary()` résume la salle à partir du snapshot (code, phase, réglages, joueurs, calcul affiché), jamais la réponse.
- **Rejouer** : `replay-same` relance avec les mêmes réglages ; `replay-new` ramène au lobby.
- **Lobbys publics** : `publicLobbies` (démarré après `listen`) garde `PUBLIC_LOBBY_COUNT` salles créées par `matchMaker.createRoom("game", { publicKey: PUBLIC_LOBBY_KEY, settings })`. La clé est un UUID tiré au démarrage : un navigateur ne peut pas créer de lobby public. Une salle publique n'a pas d'hôte (`hostId` vide, donc `settings` / `start` / `kick` / `replay-*` sont sans effet), garde `autoDispose = false` pendant l'attente et publie sa fiche (`publishLobby`) à chaque arrivée ou départ. Elle se lance dès qu'elle est pleine ou au bout de `PUBLIC_LOBBY_DURATION_MS` (`autoStart`) ; sans joueur connecté à ce moment, elle est fermée. Dans les deux cas, `release` la retire de la liste et un nouveau lobby tiré au hasard la remplace. `GET /lobbies` renvoie la liste (`PublicLobbyList`, CORS ouvert : données publiques, sans cookie).
- Timers : toujours via `this.clock.setTimeout` (stockés dans `this.timer`), jamais `setTimeout` global.

## DungeonRoom

- **Accès** : `static onAuth` = `checkMatchmake` + jeton, puis refus des invités (`JOIN_ERRORS.accountRequired` = 4403). Toujours privée (`setPrivate(true)`), entrée par `joinById(code)`. 2 à 4 joueurs (`DUNGEON_MIN_PLAYERS` vérifié au `start`, sinon `error` `not-enough-players`). Comptée avec les lobbys dans `MAX_GAME_ROOMS`. Listée dans `/admin/rooms` (champ `dungeons`, `adminSummary()` → `AdminDungeonSummary`, vu par personne : aucun calcul).
- **Succès** : `persistDungeon` renvoie `{ id, unlocks }` ; `finish()` les place dans `DungeonSnapshot.runId` / `unlocks` et rediffuse (sauf si une autre expédition a commencé entre-temps).
- **Phases** : `lobby → countdown (3 s) →` celles de `DungeonEngine` (`positioning → combat → loot → round-result → … → boss → finished`). La salle ne garde qu'un timer : après chaque changement, `step()` relit `engine.nextDeadline()` (fin de phase, calcul le plus pressé, chrono du boss) et se réveille 1 ms après ; `onDeadline` applique `closePositioning`, `expire` + `closeCombat`, `closeLoot`, `advance` ou `expire` selon la phase. `advanceIfReady` clôt en avance (tous verrouillés, toutes les séries finies, butin donné). Toute modification du moteur passe par `step()`.
- **Messages** (tous via `this.on`, Zod `.strict()`) : `hello`, `settings` `{ difficulty }` (hôte, lobby), `start`, `kick`, `back-to-lobby` (hôte, fin), `pick` `{ room }` (clé « étage-rang »), `lock`, `answer` `{ index, value }` ou `{ index, op }` (refusé si `index` n'est pas le calcul en cours du joueur, `engine.questionIndex`), `give-loot` `{ to }`, `use-item` `{ item, target? }` (passe par `step()` : une bombe peut finir l'expédition, une clé ouvre une salle), `give-item` `{ item, to }`, `drop-item` `{ item }`. Une action refusée par le moteur renvoie `error` `refused`. `"*"` ignoré.
- **Snapshots** : `DungeonSnapshot` propre à chaque membre (`engine.view(id, now)` : son calcul seulement, sans réponse ; l'énoncé d'une momie vide passé son délai). Le site masque aussi l'énoncé lui-même à `startedAt + visibleMs` (aucun message `hide`).
- **Temps** : chronométré à la réception ; `graceMs` = `LATENCY_GRACE_MS` (150 ms) passé au moteur.
- **Départs** : reconnexion 30 s comme `GameRoom` ; départ définitif en jeu → `engine.leave` (série ratée), pendant le compte à rebours → retiré de l'expédition. Hôte qui part : le suivant.
- **Fin** : `summary` dans le snapshot, puis `persistDungeon` et `runId` (rediffusé si la salle n'a pas changé de partie). Invitations effacées au lancement et à la fermeture (`clearInvites`).

## Ajouter un message réseau

1. Déclarer son type dans `ClientMessages` / `ServerMessages` (`packages/game-core/src/protocol.ts`).
2. `this.on(...)` (jamais `this.onMessage` directement : membre + rate limit) dans `GameRoom`, avec validation Zod + vérification de rôle (hôte ?) et de phase.
3. Côté client : `apps/web/src/lib/colyseus.ts` / `LobbyClient.tsx`.
