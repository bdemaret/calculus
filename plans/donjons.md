# Plan : le mode Donjons (coopération)

> Document de travail. La doc durable ira dans `agent_docs/` (une section `dungeon` dans `game-core.md`, `game-server.md`, `web.md`, `database.md`) au fil des étapes ; ce fichier pourra ensuite être archivé.

## 0. En bref

- Mode **coopératif** de 2 à 4 joueurs, réservé aux **comptes connectés**, entrée « Donjons » du menu principal (cachée aux invités).
- Lobby **toujours privé** : on n'entre qu'avec le code ou une invitation d'un ami / membre de guilde.
- L'hôte choisit la **difficulté** (les 5 niveaux habituels) au lancement.
- **5 manches** : 4 étages d'ennemis, puis le **boss** affronté par toute l'équipe.
- **DA complètement à part** du reste du site : on doit avoir l'impression d'être dans un jeu.
- Pas d'Elo, pas de classement coop pour l'instant : une **page de bilan** (équipe + sa part à soi).

Donjons ne rentre pas dans le couple jeu × mode (`GameId` × `GameModeId`) : pas d'Elo, de la coopération, une carte, des vies. Il a donc **son propre moteur, sa propre salle et ses propres tables**, en réutilisant les briques existantes (générateur, jetons de jeu, invitations, rate limit, Zod).

---

## 1. Règles

### 1.1 La carte

- N joueurs → **N couloirs** de **4 étages** chacun, puis le boss.
- Aux manches 1 à 4, chaque couloir présente son ennemi « de front » (le premier non vaincu).
- Vaincre un ennemi ouvre l'étage suivant de son couloir.
- Un ennemi non vaincu **reste en place** : le couloir prend du retard.
- Manche 5 : le boss. Chaque couloir **non nettoyé** (ennemis restants) renforce le boss : calculs / PV en plus (valeur à régler, par exemple + 2 calculs par ennemi restant).
- Les ennemis d'un couloir montent en rang avec l'étage. La carte est tirée par `buildDungeon(seed, players, difficulty)`, déterministe.

### 1.2 Déroulé d'une manche

1. **Positionnement** (~20 s, ou dès que tout le monde a verrouillé) : chaque joueur debout choisit un ennemi de front. On voit en direct les choix des alliés. Plusieurs joueurs peuvent choisir le même ennemi. Sans choix à la fin du temps : ennemi attribué automatiquement (déterministe, le moins couvert).
2. **Combat** : chacun affronte **sa propre série** de calculs pour l'ennemi choisi, en parallèle des autres.
   - Il faut **100 %** de bonnes réponses : **la première erreur ou le premier temps écoulé fait échouer** le joueur (la série s'arrête pour lui).
   - L'ennemi est vaincu si **au moins un** des joueurs placés sur lui termine sa série.
   - Chaque joueur qui échoue **perd une vie**, même si un allié a vaincu l'ennemi.
3. **Butin** (~10 s) : les ennemis de rang élevé rapportent un **cœur**. Le vainqueur le donne à qui il veut (lui-même ou un allié, y compris un allié à terre). Sans choix : il le garde (s'il est au maximum de vies, il va à l'allié qui en a le moins). Si plusieurs joueurs ont vaincu le même ennemi, le cœur va au plus rapide.
4. **Bilan de manche** : ennemis vaincus, vies perdues, score, chemins ouverts (animation sur la carte).

### 1.3 Vies, défaite, victoire

- Tout le monde commence à **3 vies** (maximum à fixer, par exemple 5).
- À 0 vie, un joueur est **à terre** : il ne se positionne pas et ne combat pas, il regarde. Un cœur reçu le **relève** (il revient avec 1 vie).
- **Défaite** : aucun ennemi vaincu pendant une manche, ou toute l'équipe à terre, ou boss non vaincu.
- **Victoire** : boss vaincu.

### 1.4 Le boss

- Affronté **en même temps par toute l'équipe** debout.
- **PV communs** : chaque bonne réponse de n'importe quel joueur lui retire 1 PV. **Chrono global** pour l'équipe.
- Chaque joueur reçoit ses calculs à la chaîne (série propre à chacun, comme pour les ennemis). Une erreur coûte une vie et passe au calcul suivant ; à 0 vie, le joueur tombe et ne frappe plus. *(À valider en jeu : sans ça, une seule erreur au boss tuerait la partie.)*
- PV de base selon la difficulté et le nombre de joueurs, plus le renfort des couloirs non nettoyés (§ 1.1).
- **Affichage** : grande barre de PV du boss avec les coups de chaque joueur (couleur par joueur, dégâts qui s'envolent), chrono bien visible, phases du boss (rage à 50 %, 25 % : effet visuel, voire calculs plus durs).

### 1.5 Score

- Collectif : chaque ennemi vaincu rapporte des points selon son rang, le boss beaucoup plus, bonus pour les vies restantes et la victoire.
- Part individuelle (pour le bilan) : ennemis vaincus par soi, dégâts au boss, cœurs donnés, vies perdues, taux de réussite, temps moyen.

### 1.6 Les ennemis

Chaque ennemi a un **profil propre**, indépendant de la difficulté de la partie (le Troll pose des calculs à 3 chiffres même en Facile). La difficulté de la partie module le profil (nombre de calculs, bornes, temps), sans le remplacer.

| Ennemi | Rang | Calculs | Temps | Particularité |
| --- | :-: | --- | --- | --- |
| Elfe | 1 | très simples, série longue | très court (2 à 3 s) | rapidité |
| Troll | 2 | gros nombres (3 chiffres), `+ −` seulement, peu de calculs | long | |
| Chevalier | 2 | niveau de la partie | normal | équilibré |
| Momie | 3 | niveau de la partie | normal | calcul visible **1 s** seulement |
| *Plus tard* : Sorcière (nombre manquant), Golem (bon compte), Gobelin (beaucoup de calculs faciles), Spectre (opérateur caché) | | | | réutilisent les jeux existants |

- `EnemyDefinition` : `id`, `tier`, `calcCount(difficulty)`, `timeMs(difficulty)`, `levelFor(difficulty)` (une `LevelConfig` sur mesure : bornes et opérations), `visibleMs?` (Momie), `reward` (points, cœur ou non).
- **Fiche au survol** (à l'appui sur téléphone, le survol n'existe pas) : nom, illustration, nombre de calculs, temps par calcul, type de calculs, particularité, récompense.

---

## 2. Architecture

### 2.1 game-core : `src/dungeon/` (pur et déterministe)

| Fichier | Rôle |
| --- | --- |
| `enemies.ts` | Catalogue `ENEMIES`, `EnemyId`, `EnemyDefinition` |
| `map.ts` | `buildDungeon(seed, playerCount, difficulty)` : couloirs, ennemis par étage, PV de base du boss |
| `questions.ts` | `enemyQuestion(seed, enemyKey, playerId, index, difficulty)` : calcul d'une série (graine `seed:manche:couloir:joueur:index`), via le générateur standard avec une `LevelConfig` sur mesure |
| `engine.ts` | `DungeonEngine` : `pick(playerId, laneIndex)`, `closePositioning(now)`, `submit(playerId, value, now)`, `closeCombat()`, `giveHeart(fromId, toId)`, `closeLoot()`, boss (`bossSubmit`, PV), `isOver`, `outcome`, `summary()`. Le temps est toujours passé en paramètre |

- **Générateur** : `generateQuestion` lit aujourd'hui ses bornes dans `LEVELS[difficulty]` (`generator.ts:366`). Il faut lui permettre de recevoir une `LevelConfig` sur mesure (paramètre facultatif ; sans lui, rien ne change), sans casser les tests exhaustifs du générateur. C'est la seule modification du code existant de game-core.
- **Fait (étape 1)** : `enemies.ts`, `map.ts`, `questions.ts`, `engine.ts` (bilan par `DungeonEngine.summary()`, vue par joueur `view(id, now)`), `GenerateOptions.level`, `test/dungeon.test.ts`. Doc : `agent_docs/game-core.md` § Donjons.
- **Fait (étape 2)** : `dungeon/protocol.ts` (`DUNGEON_ROOM`, `DungeonSnapshot`, messages), `JOIN_ERRORS.accountRequired`, `DungeonRoom` + `codes.ts`, tables `DungeonRun` / `DungeonRunPlayer` et `GameInvite.kind` (migration `20261105213841_dungeons`), `saveDungeonRun` / `loadDungeonRun`, `kind` dans `POST /api/invites`. Reste pour l'étape 3 : `/admin/rooms` ne liste pas encore les donjons ; message de `JOIN_ERRORS.accountRequired` à traduire côté site.
- **Fait (étape 3)** : interface jouable sans DA (entrée, salle d'attente, carte, positionnement, combat, butin, bilan de manche, boss, fin, page de bilan, invitations, textes fr / en), essayée de bout en bout dans le navigateur avec un bot. Reste : panel admin, e2e (étape 5), DA (étape 4).
- **Fait (étape 4)** : décor « pierre, torches, parchemin » (`dungeon/layout.tsx`, `dungeon.css`, `DungeonArt.tsx`), portraits, bestiaire, carte, duel, boss animé, fin. Corrigé au passage : une reconnexion expirée retirait un joueur revenu sous le même compte (`GameRoom` et `DungeonRoom`).
- **Fait (étape 5)** : donjons dans le panel admin (`/admin/rooms` → `dungeons`, `LiveGames`, vue d'ensemble), bot de donjon e2e (`fixtures/dungeonBot.ts`) et `tests/dungeon` (9 tests).
- `protocol.ts` (étape 2) : `DungeonSnapshot` (carte, positions, vies, PV du boss, calcul en cours **de ce joueur seulement**, jamais la réponse), `DungeonClientMessages` (`pick`, `lock`, `answer`, `give-heart`, `settings`, `start`), `DungeonServerMessages` (dont `hide` pour la Momie), nouveau code `JOIN_ERRORS` `account-required`.
- Tests Vitest (`test/dungeon.test.ts`) : carte déterministe, toutes les séries de tous les ennemis à tous les niveaux valides (entiers ≥ 0, `evaluateText(q.text) === q.answer`, opérations du profil seulement), résolution des combats (100 %, plusieurs joueurs sur un ennemi, vies), cœurs et relève, défaite, boss (PV communs, renfort).

### 2.2 game-server : `DungeonRoom` (salle `"dungeon"`)

- `static onAuth` : même vérification de jeton que `GameRoom`, puis refus des invités (`sub` qui commence par `guest_`) avec `account-required`.
- `setPrivate(true)` dans `onCreate` : entrée par `joinById` seulement. 4 places au plus ; `start` refusé sous 2 joueurs connectés.
- Phases : `lobby → countdown → positioning → combat → loot → round-result → … → boss → finished`.
- Snapshots personnalisés (comme la bombe) : chacun ne reçoit que **son** calcul en cours. Réponses et séries des autres seulement en `round-result` (on voit la progression des alliés : « 3/5 », pas leurs calculs).
- **Momie** : le serveur envoie le calcul, puis `hide` après `visibleMs`, et le site le masque. Un client trafiqué peut le garder affiché : acceptable en coopération sans classement (noté dans `security.md`).
- Chronométrage à la réception (+ `LATENCY_GRACE_MS`), une réponse par calcul, timers via `this.clock`, tous les messages via `this.on` (membre + rate limit) et validés par Zod, vérification de phase et d'état (joueur debout, ennemi accessible, cœur détenu).
- Départs : un joueur parti en combat compte comme un échec ; reconnexion 30 s comme `GameRoom`. Hôte qui part : la main passe au suivant.
- Fin de partie : `persistDungeon` (erreurs loguées, jamais propagées), `clearInvites`.
- Panel admin : la salle s'inscrit dans `liveRooms` avec un résumé sans réponse.

### 2.3 web

- Menu principal : entrée « Donjons » affichée seulement avec une session.
- `/[locale]/dungeon` : créer une expédition ou rejoindre par code (redirection vers `/login` pour un invité).
- `/[locale]/dungeon/[code]` : salle d'attente (joueurs, invitations d'amis via `InviteFriends`, choix de difficulté par l'hôte), puis le jeu.
- Invitations : réutiliser `GameInvite` / `InviteNotice`, avec une colonne `kind` (`game` | `dungeon`) pour ouvrir la bonne page.
- Client Colyseus : `joinDungeon` / `createDungeon` dans `lib/colyseus.ts`, avec la même reprise automatique (`recover`).
- Écrans : carte des couloirs (chemins qui s'ouvrent), positionnement (avatars posés sur les ennemis), combat (ennemi en grand, barre de série, chrono), butin (choisir à qui donner le cœur), boss (§ 1.4), bilan.
- **DA** : feuille de style propre aux pages `dungeon` (comme `home.css`), palette et polices dédiées servies par le site, illustrations SVG/CSS des ennemis, animations sobres (`prefers-reduced-motion` respecté), lisible sur téléphone avec le pavé ancré habituel.
- Tous les textes sous `dungeon.*` dans `fr.json` **et** `en.json` (noms et descriptions des ennemis compris).
- **Bilan** : `/[locale]/dungeon/report/[id]` : issue, score d'équipe, carte finale, puis ma part (ennemis vaincus, dégâts au boss, cœurs donnés et reçus, réussite, temps moyen) et celle de chaque allié.

### 2.4 db

- `DungeonRun` : `seed`, `difficulty`, `playerCount`, `outcome` (`won` | `lost`), `roundReached`, `score`, `bossHpLeft`, `startedAt`, `endedAt`.
- `DungeonRunPlayer` : `userId` (null à la suppression du compte), `pseudo`, `livesLeft`, `enemiesDefeated`, `bossDamage`, `heartsGiven`, `heartsReceived`, `correct`, `answered`, `avgTimeMs`.
- Pas de ligne par calcul pour la V1 (le bilan n'en a pas besoin) ; à ajouter si on veut une revue calcul par calcul.
- Rien dans `Rating`, `UserStats` ni le classement. `eraseUserGames` et `legal.md` à mettre à jour.
- Migration additive (compatible avec l'ancien code, voir `architecture.md`).

---

## 3. Étapes

1. **Moteur** : `src/dungeon/` + `LevelConfig` sur mesure dans le générateur + tests Vitest.
2. **Salle serveur** : `DungeonRoom`, accès comptes seulement, code privé, rate limit, persistance.
3. **Interface jouable**, sans DA : menu, création / code, salle d'attente, carte, positionnement, combat, butin, boss, bilan.
4. **DA** : thème, illustrations, animations, fiches des ennemis, écran du boss.
5. **e2e** : partie complète à 2 bots (victoire et défaite), invité refusé, entrée sans code refusée.
6. **Doc** : sections dans `agent_docs/`, puis notes de version (`/patchnote`).

## 4. Plus tard

- Classement coop par difficulté.
- Succès et titres (premier boss, victoire sans perte de vie, relever un allié…).
- Nouveaux ennemis issus des autres jeux, événements (coffre, piège, fontaine de vie).

## 5. Points à régler en jeu

- Nombre de calculs et temps de chaque ennemi par difficulté.
- PV du boss, renfort par ennemi restant, durée du chrono du boss.
- Quels rangs donnent un cœur, maximum de vies.
- Barème du score.

---

# V2 : une vraie carte, de nouveaux ennemis, du butin

> Décidé le 6 novembre 2026. Remplace les couloirs en ligne (V1) ; tout le reste (salle, protocole, DA, bilan) est repris.

## 6. La carte

- **Un réseau de salles** tiré par la graine : une entrée, puis **4 étages** de salles reliées par des passages (chaque salle mène à 1 à 3 salles de l'étage suivant ; des branches se rejoignent, d'autres finissent en cul-de-sac). Taille selon l'équipe : environ 2 + 1,5 × joueurs salles par étage. Il y a toujours plus de salles qu'on ne peut en faire.
- **Accès** : une salle est accessible si elle touche l'entrée ou une salle réussie. À chaque manche, chaque joueur choisit une salle accessible (plusieurs joueurs sur la même salle = plusieurs chances, comme en V1).
- **Types de salle** :
  - **Ennemi** : un combat (catalogue § 7).
  - **Sceau** : un combat contre le gardien du sceau ; réussi, il **affaiblit le boss** (−20 % de ses PV, cumulable).
  - **Coffre** : **gratuit**, y entrer suffit pour prendre un objet (§ 8). Coûte quand même la manche de celui qui y va.
  - **Mimique** : vue comme un coffre ; on découvre le combat en entrant. Vaincue, elle donne un objet rare.
- **Branches** : les branches « boss » portent les sceaux et mènent à la salle du boss ; les branches « butin » finissent sur des coffres (et parfois une mimique). Une même salle peut ouvrir sur les deux.

## 7. Atteindre le boss (règle durcie)

- La salle du boss est au bout de la carte, reliée à quelques salles du **4ᵉ étage** des branches boss.
- **Il faut l'atteindre** : à la fin de la 4ᵉ manche, si aucune salle reliée au boss n'est réussie, l'expédition est **perdue** (« le boss n'a pas été atteint »).
- 4 manches pour 4 étages : il faut réussir au moins une salle du chemin à chaque manche. Pour qu'une manche ratée reste rattrapable :
  - **Raccourci du Dragon** : une salle de Dragon (élite) au 3ᵉ étage mène directement au boss ;
  - **Clé** (objet) : franchir une salle sans combat ;
  - se mettre à plusieurs sur la salle du chemin.
- **Manche 5 : le boss**, affronté par toute l'équipe (règles V1 : PV communs, chrono, une erreur coûte une vie). Ses PV de base sont réduits par les sceaux brisés ; la règle V1 « les ennemis restés debout le renforcent » disparaît.
- **Défaites** : boss pas atteint, toute l'équipe à terre, chrono du boss écoulé. La règle V1 « aucun ennemi vaincu dans la manche » disparaît (un coffre réussit toujours).

## 8. Brouillard

- On voit tout de suite le **contenu** des salles accessibles (quel ennemi, sceau, coffre).
- Les salles **juste derrière** montrent seulement leur **type** (ennemi, sceau, coffre) ; au-delà, « ? ». Une mimique se montre toujours comme un coffre.
- Les passages sont visibles dès le départ (on sait où mène quoi, pas ce qu'on y trouve) ; la salle du boss et ses accès aussi.
- L'objet **Carte** lève le brouillard pour toute l'équipe (sauf les mimiques).
- Côté serveur : `view()` n'envoie jamais le contenu d'une salle cachée (comme les réponses : rien ne fuit).

## 9. Ennemis

Repris : Elfe, Troll, Chevalier, Momie. Nouveaux :

| Ennemi | Calculs | Règle |
| --- | --- | --- |
| **Sorcière** | Nombre manquant (`23 + ? = 41`) | Série normale, 100 % |
| **Spectre** | Opérateur caché (`12 ? 4 = 3`) | Réponse = un opérateur (pavé d'opérateurs) |
| **Cyclope** | Un seul calcul énorme (4 termes, parenthèses) | Beaucoup de temps (45 s), tout ou rien |
| **Squelette archer** | Calculs simples | Le temps fond à chaque calcul (5 s, 4 s, 3 s…) |
| **Dragon** (élite) | Puissances et racines | Gardien du raccourci vers le boss ; donne un objet |
| **Hydre** | Calculs du niveau | Une erreur ne fait pas échouer : elle ajoute 2 calculs. Chrono global de la série. |
| **Horde de gobelins** | Beaucoup de petits calculs (12) | Série **commune** à tous les joueurs placés dessus : chaque bonne réponse de n'importe qui retire un gobelin. Chrono global. |
| **Mimique** | Calculs du niveau | Déguisée en coffre ; donne un objet rare |

- Moteur : un combat n'est plus forcément « une série par joueur ». Trois formes : `solo` (V1), `shared` (horde : une série pour la salle), `regrow` (hydre). Le temps peut être par calcul, dégressif (squelette) ou global (hydre, horde).
- Réponse : un nombre ou un opérateur (spectre) ; le message `answer` accepte `{ index, op }`.

## 10. Butin

- **Sac de 2 objets** par joueur. Un objet trouvé avec un sac plein : on en jette un (ou on le donne, comme les cœurs).
- Sources : coffres, mimiques (rare), Dragon, ennemis de rang 3 (comme les cœurs de la V1).
- Tirage déterministe (graine + salle), rareté selon la source.

| Objet | Effet | Quand |
| --- | --- | --- |
| **Cœur** | +1 vie (à soi ou à un allié, même à terre) | Aussitôt, ou gardé |
| **Bouclier** | Le prochain échec ne coûte pas de vie | Passif |
| **Sablier** | +50 % de temps sur sa prochaine série | Au positionnement |
| **Seconde chance** | La première erreur de la série ne fait pas échouer | Au positionnement |
| **Clé** | Franchir une salle accessible sans combat (ni points ni butin) | Au positionnement |
| **Bombe** | −3 PV au boss | Pendant le boss |
| **Plume de phénix** | Relève son porteur à 1 vie quand il tombe | Passif |
| **Bannière** | +1 vie à toute l'équipe (rare) | Au positionnement |
| **Bourse d'or** | Des points en plus au score | À la fin |
| **Carte** | Lève le brouillard | Au positionnement |

- Messages : `use-item { item, target? }`, `give-item { item, to }`, `drop-item { item }` ; tout est vérifié par le moteur (phase, sac, cible).

## 11. Étapes V2

1. **Moteur, carte** : génération du réseau (déterministe, toujours un chemin vers le boss en 4 étages, raccourci du Dragon), accès, brouillard dans `view()`, sceaux et PV du boss, nouvelles défaites. Tests Vitest (toutes graines : chemin garanti, rien de caché dans la vue).
2. **Moteur, combats** : formes `solo` / `shared` / `regrow`, temps dégressif ou global, réponse opérateur, les 8 nouveaux ennemis (profils et générateurs : nombre manquant, opérateur, gros calcul, puissances).
3. **Moteur, butin** : sac, tirages, effets, messages ; serveur et protocole.
4. **Interface** : carte en réseau (salles et passages en SVG, brouillard, coffres), sac d'objets, nouveaux portraits (Sorcière, Spectre, Cyclope, Squelette, Dragon, Hydre, Gobelins, Mimique, Sceau, Coffre), écrans de combat des nouvelles formes.
5. **Tests e2e, bots** (`dungeon:bots`, `DungeonBot`), doc.

## État de la V2 (nuit du 5 au 6 novembre 2026)

Fait : les cinq étapes du § 11. Moteur (`map.ts`, `enemies.ts`, `items.ts`, `engine.ts`, `solve.ts`), protocole et salle (`pick { room }`, réponses `{ op }`, `give-loot`, `use-item`, `give-item`, `drop-item`), base (`sealsBroken`, `itemsFound`, migration `dungeon_v2`), interface (carte en réseau, brouillard, sac, butin, 8 nouveaux portraits, icônes de salles et d'objets), bots (`dungeon:bots`, `DungeonBot`), tests (134 Vitest, e2e donjons). Choix faits sans toi, à valider en jouant : clé sans sceau ni points, horde sans sablier, coffres jamais à l'étage 1, défaite annoncée dès que le boss devient inaccessible.

## 12. Points à régler en jeu (V2)

- Taille de la carte selon le nombre de joueurs ; part de branches boss / butin.
- Affaiblissement par sceau (−20 % ?), PV de base du boss.
- Fréquence des mimiques, rareté des objets.
