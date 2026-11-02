# Plan : gamification (succès, titres, rétention)

> Document de travail. Lot 1 (socle) livré, décrit dans `agent_docs/` ; ce fichier garde ce qui reste à faire. Le catalogue à jour est `packages/game-core/src/achievements/catalog.ts`.

## 0. Objectif et décisions

Donner aux joueurs des objectifs et des titres à afficher, sans toucher à l'Elo ni au classement.

| Sujet | Décision | Pourquoi |
| --- | --- | --- |
| Catalogue | Dans le code (`game-core`), pas en base | Typé, testé, versionné, lisible par le site et le serveur. Seuls les déblocages vont en base |
| Évaluation | Fonction pure de `game-core`, appelée par `saveGame` | Un seul point d'entrée pour le solo et le en-ligne, testable sans base, réutilisable par le rattrapage |
| Compteurs | Table générique `UserCounter` (clé texte) | Un nouveau succès cumulatif ne demande pas de migration ; `UserStats` reste tel quel pour le tableau de bord |
| Titres | Table `UserTitle` séparée des succès, avec une `source` | Un succès n'est qu'une source parmi d'autres : saison, événement, niveau, attribution manuelle s'y ajouteront sans refonte |
| Titre choisi | `User.titleId`, **pas** en `additionalFields` Better Auth | Les `additionalFields` actuels sont modifiables par le client via `updateUser` : n'importe qui s'attribuerait n'importe quel titre |
| Confiance | Tout exploit de vitesse ou de prestige exige une partie en ligne | `timeMs` vient du navigateur en solo (`security.md`) |
| Invités | Ni succès ni titres | Rien à quoi les rattacher |
| Passé | Rattrapage unique sur l'historique | Un joueur de 500 parties ne doit pas repartir de zéro |

## 1. Règles anti-triche et anti-farm

Les succès ne changent pas le classement, mais un titre affiché ne vaut que s'il est mérité. Trois failles existent dans les données actuelles :

1. **`UserStats.wins` est farmable.** Une victoire y compte dès que `multiplayer && rank === 1`, invités compris : un lobby privé avec un invité dans un second onglet donne une victoire par partie. Les succès de victoires ne comptent donc que les **parties classées** (au moins deux comptes), comme `getLeaderboard`. Jouer contre son propre second compte reste possible : c'est le même risque que pour le classement, accepté.
2. **Le solo n'a pas d'horloge fiable.** `replaySolo` vérifie les réponses, pas le temps, et un script peut poster des parties parfaites. Conséquences :
   - aucun succès de **vitesse** en solo ;
   - aucun **titre de prestige** (rareté `epic` ou `legendary`) issu de données solo ;
   - les succès solo sont des succès d'assiduité : `/api/solo-results` borne déjà à 60 parties par heure.
3. **Une partie peut être vidée de son sens.** Aujourd'hui, une partie abandonnée après une réponse compte. Une partie **solo** n'alimente les compteurs que si le joueur a répondu à au moins `ACHIEVEMENT_MIN_ANSWERED` = 3 calculs. En ligne, toute partie compte : un éliminé de la première manche a vraiment joué, et le chrono d'un lobby borne déjà le farm.

Garde-fous sur les exploits :

- Exploit lié au niveau : `difficulty >= 3` au moins, sinon les réglages les plus simples suffisent.
- « Partie parfaite » : au moins 10 manches (`MIN_ROUNDS` vaut 5).
- Réglages personnalisés : les opérations et le temps sont libres. Un exploit « réponse en moins d'une seconde » exige au moins deux opérations différentes parmi `add`, `sub`, `mul`, `div` dans `settings.operations`, et porte sur un calcul de `difficulty >= 3`.
- Ne jamais utiliser ces données pour un classement public.

## 2. Modèle de données

```prisma
/// Succès obtenu. Le catalogue est dans game-core : `achievementId` n'est pas une clé étrangère.
model UserAchievement {
  userId        String
  user          User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  achievementId String
  unlockedAt    DateTime  @default(now())
  /// Partie qui l'a débloqué (null : succès social ou partie supprimée)
  gameId        String?
  game          Game?     @relation(fields: [gameId], references: [id], onDelete: SetNull)
  /// Null tant que le joueur ne l'a pas vu (pastille du profil) ; rempli d'office par le rattrapage
  seenAt        DateTime?

  @@id([userId, achievementId])
  @@index([achievementId])
  @@map("user_achievement")
}

/// Titre possédé, quelle que soit la façon dont il a été obtenu.
model UserTitle {
  userId     String
  user       User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  titleId    String
  /// `achievement`, puis `season`, `event`, `level`, `admin`…
  source     String
  /// Ce qui l'a donné : id du succès, de la saison…
  sourceRef  String?
  unlockedAt DateTime @default(now())

  @@id([userId, titleId])
  @@map("user_title")
}

/// Compteur cumulatif d'un joueur (`games`, `wins:bomb:battle-royale`, `bombs-exploded`…).
model UserCounter {
  userId String
  user   User   @relation(fields: [userId], references: [id], onDelete: Cascade)
  key    String
  value  Int    @default(0)

  @@id([userId, key])
  @@map("user_counter")
}
```

Sur `User` : `titleId String?` et les trois relations. Un `titleId` inconnu du catalogue (titre retiré) s'affiche comme l'absence de titre.

## 3. game-core : `achievements/`

```
packages/game-core/src/achievements/
  types.ts     AchievementDefinition, TitleDefinition, GameFacts, Rarity
  catalog.ts   ACHIEVEMENTS, ACHIEVEMENT_IDS, TITLES, TITLE_IDS
  facts.ts     factsOf(game, playerKey) → ce qu'une partie a apporté à un joueur
  evaluate.ts  countersDelta(facts), evaluateAchievements(facts, counters, owned)
```

```ts
interface AchievementDefinition {
  id: AchievementId;
  category: "journey" | "game" | "mode" | "fun" | "social";
  tier: "bronze" | "silver" | "gold" | "platinum";
  /** Caché tant qu'il n'est pas obtenu. */
  secret?: boolean;
  /** Barre de progression d'un succès cumulatif : quel compteur, jusqu'où. */
  target?: { counter: string; value: number };
  /** Exploit d'une partie, à partir de ses faits. */
  check?: (facts: GameFacts) => boolean;
  /** Titre offert (facultatif). */
  title?: TitleId;
}
```

- `GameFacts` résume une partie pour un joueur. `factsOf` la construit depuis `standings` + `history` ; le rattrapage lui passera l'historique reconstruit depuis la base, comme le fait déjà `loadGameReport`. Les exploits ne regardent jamais `RoundRecord` directement.
- Pureté : `endedAt` est un paramètre. L'heure locale des succès fun se calcule en `Europe/Paris` à partir de ce paramètre (`Intl.DateTimeFormat`, déterministe pour une date et un fuseau donnés).
- Aucun texte dans game-core. Textes : `achievements.<id>.name`, `achievements.<id>.desc`, `titles.<id>` dans `fr.json` **et** `en.json`. Un test parcourt le catalogue et vérifie que les deux fichiers ont toutes les clés.
- **Titres épicènes** : pas de « Le Virtuose » ni de « Démineur », on ne connaît pas le genre des joueurs. Formes neutres : « As du déminage », « Machine à calculer », « Terreur des tableaux ».

## 4. Enregistrement : `saveGame`

Dans la transaction existante, après les statistiques :

1. Pour chaque compte de la partie : `factsOf`, puis `countersDelta`. Une seule lecture groupée des `UserCounter` et des `UserAchievement` des joueurs (`findMany` sur `userId in`), pour rester sous le délai de 5 s de la transaction interactive, même à 12 joueurs.
2. Incrément par `upsert` (jamais d'écriture de la valeur lue : deux parties simultanées ne doivent pas s'écraser, comme pour `Rating`).
3. `evaluateAchievements` : pur, dans un `try/catch`. Un bug du catalogue doit perdre un succès, jamais une partie. Une erreur est loguée et saute cette étape.
4. `userAchievement.createMany` et `userTitle.createMany` avec `skipDuplicates`.

`SavedGame` gagne `unlocks: Record<playerKey, Unlock[]>`, où `Unlock = { achievementId, titleId? }`.

- **En ligne** : `persistGame` renvoie `{ ratings, unlocks }`, `finish()` les pose dans `RoomSnapshot.unlocks` et rediffuse, comme `ratings`. Tout le monde les voit : c'est volontaire, le lobby est le meilleur endroit pour se montrer.
- **Solo** : `/api/solo-results` renvoie `{ id, unlocks }` ; `SoloGame` devra les lire (lot 3).

Succès hors partie (amis, guilde) : `grantSocialAchievements(userIds)` relit les compteurs réels (`friendship`, `guildMember`) après une amitié acceptée (les deux joueurs), `createGuild` et `acceptGuildInvite`. Dans un `try/catch`, pour ne jamais faire échouer l'action sociale.

## 5. Titres

- **Lecture** : `getAchievements(userId)` renvoie succès, progression, titres possédés et titre choisi. Pas de requête dans le layout : uniquement là où c'est affiché.
- **Choix** : `PATCH /api/profile/title` `{ titleId: string | null }`, validé par Zod (`titleId` dans `TITLE_IDS`), rate limit, puis `setUserTitle` vérifie la possession dans `UserTitle`. Réponse `{ error: "not-owned" }` en 403 sinon.
- **En ligne** : `/api/game-token` lit le titre en base et l'ajoute au JWT (`GameTokenPayload.title`, relu par `verifyGameToken`, validé contre `TITLE_IDS`). `LobbyPlayer.title: string | null` porte l'id, traduit dans la langue de chaque joueur. Un titre changé pendant un lobby apparaît à la prochaine entrée : acceptable.
- **Affichage** : composant unique `PlayerName` (pseudo, titre dessous, en `--font-hand` et plus discret). V1 : en-tête de `/profile`, `/player/[id]`, joueurs du lobby (`PlayerChips`), classement (`getLeaderboard`, `searchLeaderboard`). Plus tard : amis, guilde, rapport. Le rapport garderait le titre porté ce jour-là, ce qui demanderait une colonne sur `GamePlayer` : pas en V1.
- **Rythme vertical** : la ligne de titre ajoute 16 ou 24 px, multiple de `--sub`. Vérifier le classement et les cartes de lobby à 375 px, et tronquer plutôt que de renvoyer à la ligne.
- **Retrait** : si une source future retire un titre (titre « tenant du titre »), remettre `User.titleId` à null dans la même transaction.

Raretés : `common`, `rare`, `epic`, `legendary`, déclinées par couleur en jetons CSS dans les deux blocs sombres de `globals.css`.

## 6. Site

- **Onglet `/profile/achievements`** (`ProfileTabs`, pastille du nombre de nouveautés) : résumé (`n / total`), filtres par catégorie, grille de badges, barre de progression sur les cumulatifs, succès secrets affichés « ??? », puis sélecteur de titre. Ouvrir l'onglet remplit `seenAt`.
- **`/player/[id]`** : titre, nombre de succès, six des paliers les plus hauts (la vraie rareté demanderait de compter tous les joueurs à chaque affichage). Le profil public ne reflétait jusqu'ici que le classement : c'est un changement à annoncer dans `legal.privacy` (§ 10).
- **Fin de partie** : bloc « Succès débloqués » dans `GameReportView` (prop `unlocks`, comme `ratings`), son discret (`lib/sound`), et mention « Titre débloqué : … » avec un lien vers le choix du titre. Pas de toast par-dessus le rapport : il est lu à ce moment-là.
- **Lobby** : ligne « X a débloqué … » sous les résultats.
- **Admin** : taux d'obtention par succès dans le panel, pour repérer ceux qui sont trop durs ou donnés à tous.

Les badges sont du SVG en ligne, sur le thème « cahier » : tampons et gommettes d'écolier, or / argent / bronze en jetons CSS.

## 7. Catalogue V1

Les seuils sont à relire avec les vraies données de production.

### Parcours (`journey`)

| Id | Condition | Palier | Titre |
| --- | --- | --- | --- |
| `games-1`, `-10`, `-50`, `-250`, `-1000` | Parties jouées | bronze → platine | `-250` : « Fidèle du tableau » ; `-1000` : « Pilier de la classe » |
| `wins-1`, `-10`, `-50`, `-250`, `-1000` | Parties classées gagnées | bronze → platine | `-50` : « Tête de classe » ; `-1000` : « Terreur des tableaux » |
| `correct-100`, `-1000`, `-10000`, `-100000` | Bonnes réponses | bronze → platine | `-10000` : « Machine à calculer » |
| `level-5-win` | Gagner une partie classée au niveau 5 | or | « Légende vivante » |
| `all-games` | Finir une partie de chacun des 4 jeux | argent | « Touche-à-tout » |
| `all-games-win` | Gagner une partie classée dans chaque jeu | or | « Polymathe » |
| `all-levels` | Gagner une partie classée à chacun des 5 niveaux | or | |

### Par mode (`mode`)

| Id | Mode | Condition | Palier | Titre |
| --- | --- | --- | --- | --- |
| `br-wins-10`, `-100` | Battle royale | Victoires classées | argent, or | `-100` : « Dernier debout » |
| `br-full-lobby` | Battle royale | Gagner contre au moins 4 autres comptes (les invités ne comptent pas) | or | « Seul contre tous » |
| `br-round-30` | Battle royale | Survivre à 30 manches | or | |
| `br-spared` | Battle royale | Survivre à une manche que tout le monde a ratée | bronze | |
| `sr-wins-10`, `-100` | Course de vitesse | Victoires classées | argent, or | `-100` : « Foudre de guerre » |
| `sr-shutout` | Course de vitesse | Prendre tous les points d'une partie classée (10 manches ou plus) | or | « Sans partage » |
| `sr-comeback` | Course de vitesse | Gagner après avoir eu 3 points de retard (se déduit de `scorers`) | or | « Retournement de situation » |
| `sr-flash` | Course de vitesse | Bonne réponse en moins d'1 s, en ligne, conditions du § 1 | argent | |

### Par jeu (`game`)

| Id | Jeu | Condition | Palier | Titre |
| --- | --- | --- | --- | --- |
| `streak-10`, `-25`, `-50` | Calcul mental, nombre manquant | Série de bonnes réponses (`bestStreak`) | bronze → or | `-50` : « Sans-faute » (en ligne seulement) |
| `perfect-solo` | Calcul mental | Partie solo parfaite, 10 manches, niveau 3 ou plus | argent | |
| `power-50` | Calcul mental | 50 calculs avec puissance ou racine réussis | argent | |
| `rc-exact-10`, `-100` | Bon compte | Comptes exacts | argent, or | `-100` : « Le compte est bon » |
| `rc-closest` | Bon compte | Marquer au plus proche (`closest`) | bronze | |
| `rc-all-tiles` | Bon compte | Compte exact avec toutes les plaques (`numbersOf`) | argent | |
| `missing-op-50` | Nombre manquant | 50 opérateurs retrouvés (`hole-op`) | argent | « Bouche-trou de luxe » |
| `bomb-boom-1`, `-10`, `-100` | Bombe | Bombes qui explosent (hors bombe de secours) | bronze → or | `-100` : « Main d'artificier » |
| `bomb-defuse-10`, `-100` | Bombe | Désamorçages réussis | argent, or | `-100` : « As du déminage » |
| `bomb-clean` | Bombe | Partie où toutes tes bombes explosent (3 manches ou plus) | or | |
| `bomb-unprepared` | Bombe | Gagner avec une bombe de secours dans la partie | argent, secret | |

### Pour le plaisir (`fun`, souvent secrets)

| Id | Condition | Titre |
| --- | --- | --- |
| `answer-42` | Bonne réponse égale à 42 | « Réponse à tout » |
| `night-owl` | Finir une partie entre 2 h et 5 h, heure de Paris | « Oiseau de nuit » |
| `pi-day` | Jouer le 14 mars | |
| `buzzer` | Bonne réponse à moins de 200 ms de la fin, en ligne | « Sur le fil » |
| `all-wrong` | Aucune bonne réponse sur 10 manches ou plus, en ayant répondu à toutes | « Bonnet d'âne » |
| `so-close` | Partie parfaite gâchée par la seule dernière manche | |
| `first-out-10` | Éliminé à la première manche, 10 fois | « Pas de chance » |
| `palindrome` | Bonne réponse palindrome à 3 chiffres ou plus | |

### Social

| Id | Condition | Palier |
| --- | --- | --- |
| `friend-1`, `friend-5` | Amis acceptés | bronze, argent |
| `guild-join` | Entrer dans une guilde | bronze |
| `guild-lead` | Être à la tête d'une guilde | bronze |

## 8. Rétention

Écartée pour le moment, à la demande du propriétaire du projet (1er novembre 2026) : pas de défi du jour, de série de jours, de saisons, de quêtes, ni de rappels dans ce chantier.

## 9. Lots de livraison

Chaque lot se livre seul. Vérifications de `workflow.md` à chaque fois.

| Lot | Contenu | Dépend de |
| --- | --- | --- |
| **1. Socle** (livré) | `achievements/` de game-core et tests ; migration ; `saveGame` ; `unlocks` dans les retours ; succès sociaux ; textes | — |
| **2. Rattrapage** | Script idempotent `pnpm --filter @calculus/db backfill:achievements` | 1 |
| **3. Succès visibles** (livré, sauf le taux d'obtention dans l'admin) | Onglet profil, `/player/[id]`, bloc de fin de partie, lobby | 1, 2 |
| **4. Titres** (livré, sans les pastilles en partie) | Route de choix, jeton, `LobbyPlayer.title`, `PlayerName` | 1 |

**Rattrapage (lot 2, fait : `packages/db/scripts/backfill-achievements.ts`, avec `--dry-run`)** : parcourt les parties par date, reconstruit les `GameFacts`, recalcule les compteurs puis les déblocages (`unlockedAt` = fin de la partie, `seenAt` rempli, pour ne pas noyer les joueurs), et rattrape aussi les succès d'amis et de guilde. `br-spared` n'est pas rattrapable : `spared` n'est pas stocké. Limites connues : les parties d'avant les jeux n'ont pas `puzzle` ni `solution`, et `eraseUserGames` a effacé des parties ; les exploits manquants se regagnent en jouant. Le script remet les compteurs à zéro avant de les recalculer, en une transaction par joueur qui verrouille sa ligne : une partie enregistrée pendant le recalcul serait sinon perdue ou comptée deux fois. En production : sauvegarde de la base avant, lancement manuel une seule fois après le déploiement du lot 1.

**Tests** : game-core (chaque `check`, frontières de chaque seuil, solo refusé pour les exploits en ligne, invités ignorés, victoires contre invité refusées) ; e2e (`pnpm e2e`) : une partie débloque un succès, le titre choisi s'affiche chez un autre joueur du lobby, un `PATCH` sur un titre non possédé répond 403.

## 10. Documentation à tenir à jour à la livraison

- `CLAUDE.md` : ligne de présentation et, si le sujet grossit, `agent_docs/gamification.md` dans la table.
- `agent_docs/game-core.md` : `achievements/`, comment ajouter un succès ou un titre.
- `agent_docs/database.md` : les trois modèles, `getAchievements`, `setUserTitle`, le script de rattrapage.
- `agent_docs/game-server.md` : `RoomSnapshot.unlocks`, titre dans le jeton.
- `agent_docs/web.md` : onglet profil, `PlayerName`, profil public.
- `agent_docs/security.md` : règle « un titre de prestige ne vient jamais de données solo », et pas d'`additionalFields` pour un droit.
- `agent_docs/legal.md` et `legal.privacy` (fr + en) : succès et titres affichés publiquement, `LEGAL_UPDATED` ; adresse e-mail et préférences si les rappels arrivent.
- `agent_docs/e2e.md` : couverture ajoutée.
- Patchnote (`/patchnote`) à chaque lot visible.

## 11. Ajouter un succès ou un titre (recette)

1. Entrée dans `ACHIEVEMENTS` (`catalog.ts`), avec `target` ou `check`. Un nouveau compteur : l'ajouter à `countersDelta`.
2. Si un titre est offert : entrée dans `TITLES`, formulation épicène.
3. Textes dans `fr.json` et `en.json`.
4. Test du cas limite. Un exploit lié au temps : en ligne seulement.
5. Si le succès doit récompenser le passé : relancer le rattrapage (ou accepter qu'il ne vaille que pour l'avenir, le plus simple pour un exploit).
