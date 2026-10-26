# packages/db

Prisma 6 + PostgreSQL. Schéma : `packages/db/prisma/schema.prisma`. Client et requêtes métier : `packages/db/src/index.ts`.

## Modèles

- **Comptes (gérés par Better Auth, ne pas renommer les champs)** : `User`, `Session`, `Account`, `Verification`, `RateLimit` (compteurs du rate limit, partagés entre instances serverless). Tables en minuscules via `@@map`.
- **Parties** : `Game` (réglages JSON + colonnes dénormalisées `game` (défaut `standard`), `mode`, `difficulty`, `turnStyle`, `seed`) → `GamePlayer` (`playerKey` = id utilisé en jeu, `userId` null pour un invité) → `Question` (`tags` : `add|sub|mul|div|paren` ; `solution` et `puzzle` propres au jeu, null avant les jeux ; `forPlayerKey` / `authorPlayerKey` quand chacun a son calcul, unicité `[gameId, position, forPlayerKey]`) → `Answer` (`value` si la réponse est un nombre, sinon `text` ; les deux null si temps écoulé).
- **Elo** : `Rating` (clé `userId` + `game` + `mode` + `difficulty`, `rating` et `games`), créé à la première partie classée. `GamePlayer.ratingBefore` / `ratingDelta` / `ratingGames` gardent l'effet de chaque partie (null si non classée). Pendant les 5 parties de placement, l'Elo bouge mais reste caché : `saveGame`, `loadGameReport` et `getDashboard` ne renvoient que des `RatingChange` (via `describeRatingChange`) et `rating: null`, jamais la valeur cachée. Une partie est classée si elle est en ligne et compte au moins deux comptes inscrits ; les invités sont ignorés (ni Elo, ni adversaires).
- **`UserStats`** : agrégats incrémentés par `saveGame` dans la même transaction, pour un dashboard rapide.
- **Amis** : `Friendship` (une ligne par paire, `requesterId` → `addresseeId`, statut `pending` puis `accepted`) et `GameInvite` (invitation à un lobby, une seule par paire, valable `INVITE_TTL_MS` = 10 min).

## Fonctions exportées

| Fonction | Usage |
| --- | --- |
| `prisma` | Client unique par processus (singleton global en dev) |
| `saveGame(input)` | Enregistre partie + joueurs + questions + réponses + met à jour `UserStats` et `Rating` (transaction). Renvoie `{ id, ratings }` |
| `loadGameReport(id)` | Reconstruit un `GameReport` (via `buildReport` de game-core) pour `/report/[id]`, avec l'Elo avant / après |
| `getDashboard(userId)` | Stats globales, Elo par jeu, mode et difficulté, 30 dernières parties (avec jeu et variation d'Elo), stats par opération (3000 dernières réponses des jeux dont `operationStats` est vrai : `standard`, `missing`) |
| `getLeaderboard(board, viewerId?)` | `board` = `{ game, mode, difficulty }`. Top 100 (`LEADERBOARD_SIZE`) des joueurs sortis du placement, places ex æquo « 1, 2, 2, 4 », nombre de classés, place du joueur connecté (`me`) ou parties de placement jouées (`mePlacement`). Victoires = 1re place d'une partie classée (`GamePlayer.ratingGames` non null), comptées par `groupBy` pour les joueurs affichés |
| `searchLeaderboard(board, query)` | Joueurs classés dont le pseudo contient `query` (insensible à la casse, 20 au plus), avec leur place même hors du top 100 |
| `getFriends(userId)` | Amis (avec parties, victoires, réussite), demandes reçues et envoyées |
| `sendFriendRequest(fromId, handle)` | Demande par pseudo (insensible à la casse ; `ambiguous` si plusieurs comptes) ou e-mail ; accepte directement une demande croisée |
| `acceptFriendRequest` / `removeFriendship` | Accepter ; retirer, refuser ou annuler (supprime aussi les invitations entre les deux) |
| `eraseUserGames(userId)` | Avant suppression d'un compte : supprime ses parties solo et vide son pseudo dans les parties en ligne |
| `sendGameInvite` / `getGameInvites` / `dismissGameInvite` | Invitations à un lobby, réservées aux amis acceptés |

## Migrations

- Modifier `schema.prisma`, puis `pnpm db:migrate` (= `prisma migrate dev`, demande un nom) : crée le dossier dans `prisma/migrations/` et régénère le client. Committer la migration.
- Production : `pnpm --filter @calculus/db migrate:deploy`.
- Ne jamais éditer une migration déjà appliquée ; en créer une nouvelle.
- Base locale : `pnpm db:up` (Docker, Postgres 17, port **5433**, user/mdp/base `calculus`). `pnpm db:studio` pour inspecter. Classement de test : `pnpm --filter @calculus/db seed:leaderboard [--me <e-mail>]` (230 faux joueurs `seed-…`, ~9 500 parties classées au code `SEEDLB` simulées avec l'Elo de game-core ; `--me` ajoute un vrai compte aux parties), `--clean` pour tout retirer. `pnpm lancer --reset` efface tout.
- Le client est généré au `postinstall` et par la tâche Turbo `generate` (dépendance de `dev` et `typecheck`).
