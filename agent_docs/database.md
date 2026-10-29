# packages/db

Prisma 6 + PostgreSQL. Schéma : `packages/db/prisma/schema.prisma`. Client et requêtes métier : `packages/db/src/index.ts`.

## Modèles

- **Comptes (gérés par Better Auth, ne pas renommer les champs)** : `User` (avec les préférences `voiceInput`, `divisionDisplay`, `showTips`, déclarées aussi dans `user.additionalFields` de `lib/auth.ts` et dans `auth-client.ts`), `Session`, `Account`, `Verification`, `RateLimit` (compteurs du rate limit, partagés entre instances serverless). Tables en minuscules via `@@map`.
- **Parties** : `Game` (réglages JSON + colonnes dénormalisées `game` (défaut `standard`), `mode`, `difficulty`, `turnStyle`, `seed`) → `GamePlayer` (`playerKey` = id utilisé en jeu, `userId` null pour un invité) → `Question` (`tags` : `add|sub|mul|div|paren` ; `solution` et `puzzle` propres au jeu, null avant les jeux ; `forPlayerKey` / `authorPlayerKey` quand chacun a son calcul : à la bombe, une ligne par désamorceur avec la bombe qu'il a reçue, le tirage dans `puzzle` ; unicité `[gameId, position, forPlayerKey]` ; `loadGameReport` regroupe les lignes d'une manche. Le statut « bombe de secours » n'est pas gardé en base) → `Answer` (`value` si la réponse est un nombre, sinon `text` ; les deux null si temps écoulé).
- **Retours** : `Feedback` (`kind` `bug|idea|other`, `message`, `contact` e-mail facultatif d'un invité, `page`, `locale`, `resolved`). `userId` passe à null à la suppression du compte.
- **Guildes** : `Guild` (`name`, `nameKey` unique : minuscules sans accents, `crest` = adresse `/api/guild/crest/<id>?v=`), `GuildMember` (clé `userId` : une guilde au plus par joueur, `role` `leader|member`, `lastSeenAt` pour en ligne / hors ligne), `GuildInvite` (une par guilde et joueur, `fromId` mis à null si le compte part), `GuildCrest` (octets du blason). `GameInvite.guildId` marque une invitation à un lobby de guilde. 50 membres au plus (`GUILD_MAX_MEMBERS`, vérifié sous verrou `FOR UPDATE` à l'acceptation), 50 invitations en attente par guilde.
- **Elo** : `Rating` (clé `userId` + `game` + `mode` + `difficulty`, `rating` et `games`), créé à la première partie classée. `GamePlayer.ratingBefore` / `ratingDelta` / `ratingGames` gardent l'effet de chaque partie (null si non classée). Pendant les 5 parties de placement, l'Elo bouge mais reste caché : `saveGame`, `loadGameReport` et `getDashboard` ne renvoient que des `RatingChange` (via `describeRatingChange`) et `rating: null`, jamais la valeur cachée. Une partie est classée si elle est en ligne et compte au moins deux comptes inscrits ; les invités sont ignorés (ni Elo, ni adversaires).
- **Activité solo** : `SoloPlay` (table `solo_play`), une ligne par partie solo commencée, invités compris (`userId` null), signalée par le navigateur via `/api/solo-activity` : début, battement toutes les 30 s, fin (`outcome` `finished`) ou abandon (`quit`) ; sans signal depuis `SOLO_PLAY_LIVE_MS` (75 s), une partie non close est « sans nouvelles ». `rounds` / `correct` viennent du client : indicatifs, jamais pour un classement. `gameId` relie la partie enregistrée par `/api/solo-results`. Lignes de plus de 90 jours (`SOLO_PLAY_RETENTION_MS`) purgées à chaque nouvelle partie ; `userId` passe à null à la suppression du compte.
- **`UserStats`** : agrégats incrémentés par `saveGame` dans la même transaction, pour un dashboard rapide.
- **Amis** : `Friendship` (une ligne par paire, `requesterId` → `addresseeId`, statut `pending` puis `accepted`) et `GameInvite` (invitation à un lobby, une par lobby et par paire, 5 au plus par paire, valable `INVITE_TTL_MS` = 10 min, effacée par le serveur de jeu dès que la partie démarre ou que le lobby ferme : `clearLobbyInvites`).

## Fonctions exportées

| Fonction | Usage |
| --- | --- |
| `prisma` | Client unique par processus (singleton global en dev) |
| `saveGame(input)` | Enregistre partie + joueurs + questions + réponses + met à jour `UserStats` et `Rating` (transaction). Renvoie `{ id, ratings }` |
| `loadGameReport(id)` | Reconstruit un `GameReport` (via `buildReport` de game-core) pour `/report/[id]`, avec l'Elo avant / après |
| `getDashboard(userId)` | Stats globales, Elo par jeu, mode et difficulté, 30 dernières parties (avec jeu et variation d'Elo), stats par opération (3000 dernières réponses des jeux dont `operationStats` est vrai : `standard`, `missing`) |
| `getLeaderboard(board, viewerId?)` | `board` = `{ game, mode, difficulty }`. Top 100 (`LEADERBOARD_SIZE`) des joueurs sortis du placement, places ex æquo « 1, 2, 2, 4 », nombre de classés, place du joueur connecté (`me`) ou parties de placement jouées (`mePlacement`). Victoires = 1re place d'une partie classée (`GamePlayer.ratingGames` non null), comptées par `groupBy` pour les joueurs affichés |
| `searchLeaderboard(board, query)` | Joueurs classés dont le pseudo contient `query` (insensible à la casse, 20 au plus), avec leur place même hors du top 100 |
| `getPlayerProfile(userId, viewerId?)` | Profil public : pseudo, places (par jeu, mode et difficulté) là où le placement est fini (place, nombre de classés, Elo, parties, victoires) et lien d'amitié avec le joueur connecté (`self`, `none`, `outgoing`, `incoming`, `friends`, null pour un visiteur) |
| `getFriends(userId)` | Amis (avec photo, parties, victoires, réussite), demandes reçues et envoyées |
| `sendFriendRequest(fromId, handle)` / `sendFriendRequestTo(fromId, userId)` | Demande par pseudo (insensible à la casse ; `ambiguous` si plusieurs comptes), e-mail ou id de compte ; accepte directement une demande croisée |
| `acceptFriendRequest` / `removeFriendship` | Accepter ; retirer, refuser ou annuler (supprime aussi les invitations entre les deux) |
| `saveAvatar(userId, data, mime)` / `deleteAvatar(userId)` | Photo de profil (table `avatar`) ; `saveAvatar` renvoie la version à mettre dans `user.image` |
| `getAvatarFor(userId, viewerId)` | Photo d'un joueur pour lui-même, un ami accepté ou un membre de sa guilde, null sinon |
| `eraseUserGames(userId)` | Avant suppression d'un compte : quitte sa guilde (`leaveGuild`), supprime ses parties solo et vide son pseudo dans les parties en ligne |
| `sendGameInvite` / `getGameInvites` / `dismissGameInvite` | Invitations à un lobby, réservées aux amis acceptés (`guildName` pour un lobby de guilde) |
| `getMyGuild(userId, now)` / `getReceivedGuildInvites` | Guilde du joueur (membres en ligne ou non, invitations, amis sans guilde à inviter) ; invitations reçues |
| `createGuild` / `renameGuild` / `inviteToGuild` / `acceptGuildInvite` / `declineGuildInvite` / `cancelGuildInvite` | Fonder, renommer (chef), inviter (tout membre, par pseudo, e-mail ou id), répondre, annuler. Renvoient un `GuildError` ou null |
| `kickGuildMember` / `transferGuildLeadership` / `leaveGuild` | Exclure, nommer chef (chef seulement) ; quitter : le chef laisse la tête au plus ancien membre, le dernier dissout la guilde |
| `saveGuildCrest` / `deleteGuildCrest` / `getGuildCrest` | Blason (chef seulement), servi à tout joueur connecté |
| `touchGuildPresence` / `sendGuildLobbyInvites` | Signal de présence ; invitations de tous les autres membres à un lobby |
| `createFeedback(input, now)` | Enregistre un retour ; false si la limite horaire est atteinte (constantes dans `src/feedback.ts`, exporté aussi en `@calculus/db/feedback` pour le client) |
| `getAdminOverview(now)` | Panel admin : inscrits (total, 7 et 30 jours, par jour), parties, retours à traiter |
| `getGamesHistory(now, days)` | Panel admin : parties enregistrées (terminées) solo et en ligne par jour (30 ou 90 jours) ou par semaine (365 jours, `GAMES_HISTORY_RANGES`) |
| `startSoloPlay` / `touchSoloPlay` / `linkSoloPlayGame` | Suivi d'activité solo (début, battement ou fin, lien vers la partie enregistrée) |
| `getAdminSoloActivity(now)` | Panel admin : parties solo en cours, 50 dernières closes ou abandonnées, compteurs sur 24 h |
| `listUsers(query, page)` / `getAdminUser(id)` | Panel admin : comptes paginés (`ADMIN_PAGE_SIZE` = 50) filtrés par pseudo ou e-mail ; fiche d'un compte |
| `listFeedback(resolved, page)` / `setFeedbackResolved` / `deleteFeedback` | Panel admin : retours |

## Migrations

- Modifier `schema.prisma`, puis `pnpm db:migrate` (= `prisma migrate dev`, demande un nom) : crée le dossier dans `prisma/migrations/` et régénère le client. Committer la migration.
- Production : `pnpm --filter @calculus/db migrate:deploy`.
- Ne jamais éditer une migration déjà appliquée ; en créer une nouvelle.
- Base locale : `pnpm db:up` (Docker, Postgres 17, port **5433**, user/mdp/base `calculus`). `pnpm db:studio` pour inspecter. Classement de test : `pnpm --filter @calculus/db seed:leaderboard [--me <e-mail>]` (230 faux joueurs `seed-…`, ~9 500 parties classées au code `SEEDLB` simulées avec l'Elo de game-core ; `--me` ajoute un vrai compte aux parties), `--clean` pour tout retirer. `pnpm lancer --reset` efface tout.
- Le client est généré au `postinstall` et par la tâche Turbo `generate` (dépendance de `dev` et `typecheck`). Après un changement de schéma, relancer `pnpm dev` : Next garde l'ancien client en mémoire.
- **Ne jamais passer soi-même `--shadow-database-url`** (à `prisma migrate diff` ou autre) : Prisma **vide** la base de travail avant de s'en servir. Une adresse fabriquée à la main (un `sed` qui ne remplace rien sur macOS) peut pointer sur la vraie base `calculus` et l'effacer, comme le 28/10/2026. Pour vérifier une migration : `pnpm db:migrate` (Prisma gère sa propre base de travail) ou `prisma migrate diff --from-url <DATABASE_URL> --to-schema-datamodel prisma/schema.prisma` (lecture seule).
- Tables présentes mais table `_prisma_migrations` absente (« Drift detected », Prisma propose un reset) : si le schéma correspond aux migrations, marquer chacune comme appliquée avec `prisma migrate resolve --applied <dossier>` plutôt que de tout effacer.
