# Plan : trois nouveaux jeux

> Document de travail : chantier terminé (§ 5). La doc durable est dans `agent_docs/` ; ce fichier peut être supprimé ou archivé.

## 0. Vocabulaire

Aujourd'hui, `GameModeId` (`battle-royale`, `speed-race`) mélange deux notions. On les sépare :

- **Jeu** (`GameId`) : *ce qu'on résout*. `standard` (calcul mental actuel), `right-count` (Le bon compte), `bomb` (La bombe), `missing` (Nombre manquant).
- **Mode** (`GameModeId`, inchangé) : *comment on gagne*. `battle-royale`, `speed-race`. Les `GameModeRules` de `modes.ts` restent valables pour tous les jeux.

| Jeu | Battle royale | Course de vitesse | Solo | « Chacun son tour » | Joueurs min. |
| --- | :-: | :-: | :-: | :-: | :-: |
| Calcul mental (`standard`) | ✓ | ✓ | ✓ | ✓ | 1 |
| Le bon compte (`right-count`) | ✓ | ✓ | ✓ | ✓ | 1 |
| Nombre manquant (`missing`) | ✓ | ✓ | ✓ | ✓ | 1 |
| La bombe (`bomb`) | ✓ | ✗ | ✗ | ✗ | 2 |

L'Elo et le classement deviennent propres à **jeu × mode × difficulté**.

---

## 1. Socle commun (à faire avant les jeux, sans changer le comportement actuel)

### 1.1 game-core

- `types.ts`
  - `GameId = "standard" | "right-count" | "bomb" | "missing"` ; `GameSettings.game: GameId`.
  - Réglages propres à certains jeux, toujours présents avec une valeur par défaut (plus simple à valider qu'une union) : `buildTime` (bombe, s), `missingKind: "number" | "operator" | "mixed"` (nombre manquant).
  - `Question` devient générique : `text` (énoncé affichable, ou résumé pour l'historique), `answer: number` (cible / valeur attendue), plus `puzzle: Puzzle` (union discriminée par `game`, voir chaque jeu) et `solution: string` (une solution de référence lisible, montrée en fin de manche).
  - Réponse d'un joueur : `PlayerAnswer = { value: number } | { expr: string } | { op: Operation }`. `AnswerRecord` gagne `text: string | null` (expression ou opérateur saisi) à côté de `value`.
  - `OpTag` s'élargit si besoin (`"hole-num" | "hole-op"` pour le nombre manquant).
- Nouveau `games/` :
  - `games/types.ts` : interface `GameDefinition` — `id`, `modes` autorisés, `solo`, `minPlayers`, `generate(seed, index, settings): Question` (déterministe), `check(question, answer): boolean`, `publicPuzzle(question)` (ce qui part vers le client **sans** la solution), `tags(question)`.
  - `games/standard.ts` : enveloppe l'actuel `generateQuestion` (aucune régression), `check` = `value === answer`.
  - `GAMES: Record<GameId, GameDefinition>`.
- `expression.ts` (extrait de `generator.ts`, réutilisé par le bon compte et la bombe) : `parseExpression(text)` → arbre ou erreur, `evaluateStrict(tree)` (entiers ≥ 0 à **chaque** étape, division exacte), `tilesUsed(tree)` pour vérifier qu'on n'utilise que les plaques données, chacune au plus une fois. Longueur max 64 caractères, alphabet `0-9 ( ) + − × ÷ - * / x` et espaces.
- `settings.ts` : `GAMES_LIST`, `sanitizeSettings` lit `game` (défaut `standard`, donc les anciens réglages en `localStorage` et en base restent valides), puis **force la compatibilité** : mode non autorisé → premier mode du jeu, `turnStyle` forcé à `simultaneous` pour la bombe, bornes de temps par jeu (`MIN_TIME`/`MAX_TIME` deviennent un tableau par jeu : le bon compte a besoin de 30–180 s).
- `engine.ts` : `rules` reste le mode ; ajouter `game = GAMES[settings.game]`. `startRound` appelle `game.generate`. `submit(playerId, answer: PlayerAnswer, now)` appelle `game.check`. `totalRounds` inchangé.
- `report.ts` : la revue des manches affiche `solution` et le `text` de la réponse ; stats par opération calculées seulement pour `standard` et `missing` (sans objet pour les autres).
- `protocol.ts`
  - `RoomSnapshot.question` → `puzzle: PublicPuzzle | null` (union par jeu ; pour `standard` : `{ game: "standard", index, text }`).
  - `RoundResultPayload` : `solution: string`, `answers[].text`.
  - `ClientMessages.answer` : `{ questionIndex, value?: number, expr?: string, op?: Operation }`.

### 1.2 Base de données (une migration)

- `Game.game String @default("standard")` + index.
- `Rating` : clé `[userId, game, mode, difficulty]` (colonne `game` défaut `standard`), index `[game, mode, difficulty, rating]`.
- `Question` : `solution String?`, `puzzle Json?`, `forPlayerKey String @default("")`, `authorPlayerKey String?` (bombe) ; unicité `[gameId, position, forPlayerKey]`.
- `Answer.text String?`.
- `saveGame`, `getDashboard`, `getLeaderboard(game, mode, difficulty, …)`, `searchLeaderboard`, `winsOf`, `seed-leaderboard.ts` prennent `game`.

### 1.3 Serveur de jeu

- `answerSchema` devient une union Zod (`value` | `expr` max 64 | `op` enum), puis vérification que la forme correspond au jeu.
- Refus de `start` si `players < GAMES[game].minPlayers` (nouvelle erreur `not-enough-players`).
- Snapshot : `puzzle` vient de `game.publicPuzzle(...)`, jamais la solution.

### 1.4 Site

- **Choix du jeu avant le mode** : `SettingsForm` affiche d'abord des cartes « jeu » (4), puis les modes autorisés par ce jeu, puis les réglages propres au jeu. En solo, la bombe est grisée (« en ligne uniquement »).
- Page `/modes` → `/games` (garder `/modes` en redirection) : une section par jeu avec ses règles et ses modes. Lien d'en-tête « Jeux ».
- Classement : `/leaderboard/[game]/[mode]` ; `/leaderboard/[mode]` redirige vers `/leaderboard/standard/[mode]`. Onglets jeu puis mode.
- Tableau de bord : grille Elo par jeu (onglets), parties récentes avec le nom du jeu.
- `GameReportView` : affiche `solution` et la réponse texte.
- Composant de saisie choisi par jeu : `CalcLine` (nombre, existant), `OperatorPad` (4 opérateurs), `ExpressionBuilder` (plaques cliquables + opérateurs + parenthèses + effacer, total en direct, saisie clavier possible).
- i18n : `games.<id>.{name,short,long,solo}`, `settings.game`, `settings.buildTime`, `settings.missingKind.*`, textes de phase de la bombe. Dans `fr.json` **et** `en.json`.
- `/api/solo-results` : `answers[]` accepte `value | expr | op`, rejoue avec `GameEngine` (inchangé dans le principe) ; refuse `game: "bomb"`.

### 1.5 Tests du socle

- game-core : `sanitizeSettings` (jeu absent → standard, mode incompatible corrigé), `expression.ts` (plaques en double, plaque absente, division non exacte, intermédiaire négatif, texte trop long).
- e2e : tout l'existant doit passer sans modification de comportement ; adapter les URL de classement.

---

## 2. Nombre manquant (`missing`) — le plus simple, à faire en premier

**Principe** : une égalité complète où il manque un nombre ou un opérateur. `23 + ? = 41`, `? × 7 = 56`, `(7 + ?) × 3 = 36`, `12 ? 4 = 3`.

- **Génération** (`games/missing.ts`) : réutiliser `generateWithRng` (mêmes niveaux, opérations, parenthèses), puis choisir de façon déterministe le trou parmi les nombres ou les opérateurs selon `missingKind` (`mixed` : 1 sur 3 opérateur).
- **Réponse unique garantie** :
  - nombre caché : tester chaque candidat de 1 à `maxResult` (borne petite, déterministe) ; si plus d'une valeur convient, retirer un autre trou ;
  - opérateur caché : essayer les 4 opérateurs ; rejeté si plus d'un convient (`2 + 2 = 2 × 2`).
  - `check` reste une comparaison directe (`value === answer` ou `op === answer`).
- **Puzzle public** : `{ game: "missing", left: (Token | "?")[], result: number, hole: "number" | "operator" }`.
- **Saisie** : trou numérique → `CalcLine` ; trou opérateur → `OperatorPad` (clavier : `+ - * / x`).
- **Niveaux** : ceux du calcul standard ; défaut `missingKind` = `number` aux niveaux 1–2, `mixed` au-delà.
- **Tags** : opérations de l'égalité + `hole-num` / `hole-op` (stats « par type de trou » au tableau de bord).
- **Modes** : battle royale, course de vitesse, chacun son tour (la saisie visible marche telle quelle ; pour l'opérateur, `typing` accepte un symbole).
- **Tests** : balayage niveaux × opérations × parenthèses × `missingKind` (unicité, cohérence avec `evaluateText`), e2e solo + en ligne (oracle : lit `data-testid="calc-text"` et essaie les candidats).

---

## 3. Le bon compte (`right-count`)

**Principe** : des plaques (nombres) et une cible ; trouver une expression qui donne exactement la cible en utilisant toutes les plaques, chacune exactement une fois. Toujours possible.

- **Solveur** (`solver.ts`, pur) : programmation dynamique sur les sous-ensembles de plaques (≤ 6 → 64 masques) : pour chaque masque, l'ensemble des valeurs atteignables avec une expression témoin, intermédiaires entiers ≥ 0, uniquement les opérations autorisées. Mesurer le temps (objectif < 20 ms par manche côté serveur) ; plafonner les valeurs à `maxTarget` pour borner la mémoire.
- **Génération garantie** : tirer les plaques (graine), calculer l'ensemble atteignable, puis choisir la cible **parmi les valeurs atteignables** dans la plage du niveau, en exigeant un nombre minimal de plaques dans la solution la plus courte (sinon cible trop facile). La solution témoin devient `solution`. Aucun cas « impossible » par construction ; filet de sécurité comme dans `generateWithRng`.
- **Niveaux** (`RIGHT_COUNT_LEVELS`, proposition à ajuster en jouant) :

  | Niv. | Plaques | Cible | Opérations par défaut | Plaques min. | Temps |
  | --- | --- | --- | --- | --- | --- |
  | 1 | 4 parmi 1–10 | 10–50 | + − | 2 | 45 s |
  | 2 | 5 parmi 1–10 | 20–100 | + − × | 3 | 60 s |
  | 3 | 6 : 5 parmi 1–10 + 1 parmi 25/50/75/100 | 100–300 | + − × ÷ | 3 | 75 s |
  | 4 | 6 : 4 + 2 grandes | 100–999 | + − × ÷ | 4 | 90 s |
  | 5 | 6 : 4 + 2 grandes | 101–999 | + − × ÷ | 5 | 90 s |

  Les parenthèses sont toujours permises (le jeu n'a pas de sens sans) ; le réglage `parentheses` est masqué pour ce jeu.
- **Puzzle public** : `{ game: "right-count", tiles: number[], target: number, operations }`.
- **Vérification** (`check`) : `parseExpression` → plaques valides (multiensemble) → `evaluateStrict` → égal à la cible. N'importe quelle solution est acceptée.
- **Saisie** : `ExpressionBuilder` — plaques en boutons (grisées une fois utilisées), opérateurs autorisés, parenthèses, total en direct, bouton « Valider » actif seulement quand le total vaut la cible. Le serveur revérifie tout ; une expression invalide est refusée (`invalid-value`) **sans** consommer la tentative, une expression valide mais fausse compte comme une erreur.
- **Modes** : battle royale (trouver avant la fin du temps, sinon éliminé ; le temps raccourcit via `timeFactor`), course de vitesse (le premier qui trouve marque), chacun son tour (saisie visible : `typing` accepte une expression, max 64).
- **Évolution possible (hors périmètre)** : variante « le plus proche gagne » comme l'émission.
- **Tests** : solveur (cas connus), toute cible générée est atteignable et respecte « plaques min. » (balayage niveaux × opérations × N graines), `check` (plaque réutilisée, plaque inventée, division non exacte). e2e : oracle qui lit les plaques (`data-testid="tiles"`) et utilise le solveur de game-core.

---

## 4. La bombe (`bomb`) — le plus gros chantier, en dernier

**Principe** : chaque manche a deux temps. Tous reçoivent les mêmes plaques et opérateurs et **construisent** un calcul (la bombe). Puis chaque bombe est envoyée à un autre joueur, qui doit la **désamorcer** (en trouver le résultat). Battle royale uniquement, en ligne, 2 joueurs minimum.

### Déroulé d'une manche

```
countdown → build (buildTime) → assign (2,5 s) → question (timePerQuestion × timeFactor) → round-result → …
```

1. **build** : plaques et opérateurs communs (générés par la graine). Chaque survivant compose son calcul dans `ExpressionBuilder` puis envoie `bomb { roundIndex, expr }`. Une bombe envoyée est verrouillée (le joueur passe « prêt »). La phase se termine quand tous les survivants connectés ont envoyé, ou à `buildTime`.
2. **Contraintes d'une bombe valide** (`check` côté serveur) : plaques du tirage, chacune au plus une fois ; au moins `minTiles` plaques ; seulement les opérateurs donnés ; intermédiaires entiers ≥ 0 ; résultat ≤ `maxResult` du niveau.
3. **Bombe manquante ou invalide** à la fin du temps : le serveur la remplace par une **bombe de secours** générée à partir des mêmes plaques (déterministe), marquée comme telle ; l'auteur ne marque pas de point de bombe (voir décisions).
4. **assign** : attribution par un **dérangement** déterministe (graine + manche) des survivants : personne ne reçoit sa propre bombe, et on fait tourner les paires d'une manche à l'autre. À 2 joueurs, échange. Chacun voit « Tu désamorces la bombe de X ».
5. **question** : chacun résout **sa** bombe (un seul essai, saisie `CalcLine`). Se ferme quand tous ont répondu ou au temps.
6. **round-result** : chaque paire (auteur → bombe → désamorceur, réponse, verdict).

### Règles de score (battle royale)

- Désamorceur faux ou hors temps → éliminé ; juste → +1.
- Auteur dont la bombe explose → +1 (départage les éliminés d'une même manche et les ex æquo).
- Si tous les survivants échouent la même manche : personne ne sort (règle `spared` actuelle).
- Déconnexion pendant `build` : éliminé (règle actuelle), son destinataire reçoit une bombe de secours.

### Niveaux (`BOMB_LEVELS`, proposition)

| Niv. | Plaques | Opérateurs | Plaques min. | Résultat max | Parenthèses |
| --- | --- | --- | --- | --- | --- |
| 1 | 4 chiffres 1–9 | + − | 2 | 100 | non |
| 2 | 5 chiffres 1–9 | + − × | 3 | 200 | non |
| 3 | 5 : 4 chiffres + 1 nombre 10–25 | + − × ÷ | 3 | 500 | non |
| 4 | 6 : 4 chiffres + 2 nombres 10–50 | + − × ÷ | 4 | 2000 | oui |
| 5 | 6 : 3 chiffres + 3 nombres 10–99 | + − × ÷ | 4 | 20000 | oui |

`buildTime` : 15–120 s, défaut 45 s. `timePerQuestion` : temps de désamorçage (le battle royale le raccourcit).

### Impact technique propre à la bombe

- **game-core** : `RoundRecord` gagne `stage: "build" | "solve"`, `bombs: Record<authorId, { expr, fallback }>` et `personal: Record<playerId, { question: Question; authorId: string }>`. `GameEngine` : `submitBomb(playerId, expr, now)`, `closeBuild(now)` (bombes de secours + dérangement + `personal`), puis `submit` vérifie contre `personal[playerId]`. Le dérangement et les bombes de secours ne dépendent que de `(seed, index, survivants)` : déterministe et testable.
- **Mode** : `battleRoyale.resolveRound` reçoit le crédit « bombe qui explose » via un crochet du jeu (`game.resolveExtras?(engine, round)`) plutôt qu'un cas particulier dans `modes.ts`.
- **Serveur** : nouvelles phases `RoomPhase` `build` et `assign` ; nouveau message `bomb` (Zod : `expr` max 64, `roundIndex`), accepté seulement en phase `build`, par un survivant, une fois. Pendant `build`, aucune bombe n'est diffusée. Pendant `question`, **snapshot personnalisé** (`snapshotFor(playerId)`) : chacun ne reçoit que sa bombe (pas son résultat) ; les spectateurs voient la liste des paires sans résultats. Les résultats ne partent qu'en `round-result`.
- **Base** : une ligne `Question` par destinataire (`forPlayerKey`, `authorPlayerKey`), `puzzle` = plaques de la manche.
- **Site** : écran de construction (plaques, total en direct, contraintes affichées, « Envoyer ma bombe », liste des joueurs prêts), écran d'attribution, écran de désamorçage (bombe + auteur), résultat par paires. Bombe absente du solo.
- **Contenu saisi par les joueurs** : uniquement des chiffres et opérateurs (validés par l'alphabet de `parseExpression`) : aucun texte libre, donc pas de modération à prévoir.
- **Tests** : dérangement (jamais soi-même, couvre tout le monde, 2 à 12 joueurs), bombe de secours valide, validation des contraintes, cycle complet d'une manche dans `GameEngine`, `spared`. e2e : bots qui envoient une bombe imposée (`bot.bomb("7 × 8 + 3")`), joueur qui ne construit rien (bombe de secours), élimination du désamorceur, snapshot sans résultat pendant `question`.

---

## 5. Ordre de réalisation (une PR par étape)

1. ✅ **Socle** : `GameId`, `GameDefinition`, `standard` derrière l'abstraction, `expression.ts`, protocole `puzzle`, migration, classement par jeu, choix du jeu dans l'UI (un seul jeu proposé tant que les autres n'existent pas). Aucun changement visible de règles.
   Reporté aux étapes des jeux qui en ont besoin : réglages `buildTime` / `missingKind`, bornes de temps par jeu, `turnStyle` forcé, section « jeux » de l'accueil, refonte des tags du rapport.
2. ✅ **Nombre manquant** + `OperatorPad`. Différence avec le § 2 : `answerKind` est une fonction du calcul (la forme de la réponse change en « l'un ou l'autre ») et l'unicité d'un nombre caché est vérifiée sur ±30 autour de lui, pas sur toute la plage.
3. ✅ **Le bon compte** + solveur + `ExpressionBuilder`. Règle précisée en cours de route : **toutes les plaques, chacune exactement une fois** (le § 3 disait « au plus une fois ») ; il n'y a donc plus de « plaques min. » par niveau, et une expression qui oublie une plaque est irrecevable.
4. ✅ **La bombe** (réutilise `expression.ts` et la saisie à plaques `TileExpression`). Règle des plaques gardée comme au § 4 : au moins `minTiles`, chacune au plus une fois (pas toutes, contrairement au bon compte). Bombe de secours sans point pour l'auteur ; le statut « secours » n'est pas gardé en base.
5. ✅ Passe finale de documentation et de couverture e2e (README, `legal.md`, accueil et règles par jeu dans les réglages, tests des redirections, du classement par jeu, des protections de la bombe).

À chaque étape : `pnpm typecheck`, `pnpm test`, `pnpm e2e`, vérification navigateur fr/en/mobile, migration committée.

---

## 6. Plan de mise à jour de la documentation

| Fichier | Changements |
| --- | --- |
| `CLAUDE.md` | Présentation : « 4 jeux (calcul mental, le bon compte, nombre manquant, la bombe), chacun jouable en battle royale et/ou course de vitesse ». Ajouter la distinction **jeu** / **mode**. Règle « jamais la réponse avant la fin de la manche » étendue : ni solution, ni résultat d'une bombe. |
| `agent_docs/architecture.md` | Glossaire jeu / mode et tableau de compatibilité ; flux solo (3 jeux rejoués par `/api/solo-results`, bombe exclue) ; flux en ligne avec les phases `build` / `assign`. |
| `agent_docs/game-core.md` | Nouveaux fichiers (`games/*`, `expression.ts`, `solver.ts`) ; `GameDefinition` ; invariants : puzzle déterministe `(seed, index, settings)`, sauf les bombes qui viennent des joueurs (en ligne seulement) ; solution toujours vérifiée par `check` ; niveaux par jeu ; section **« Ajouter un jeu »** (définition, `GameId`, `GAMES`, réglages, saisie côté site, i18n `games.*`, tests) à côté de « Ajouter un mode » ; cycle d'une manche de la bombe. |
| `agent_docs/game-server.md` | Phases `build` et `assign` ; message `bomb` ; `answerSchema` par jeu ; `snapshotFor` (snapshot personnalisé) ; refus de démarrer sous `minPlayers` ; durées ajoutées. |
| `agent_docs/web.md` | Choix du jeu puis du mode ; page `/games` (et redirection `/modes`) ; `/leaderboard/[game]/[mode]` ; composants `ExpressionBuilder`, `OperatorPad` ; clés `games.*` ; anciens réglages en `localStorage` repris en `standard`. |
| `agent_docs/database.md` | Colonnes `Game.game`, `Rating` clé à 4 champs, `Question.solution/puzzle/forPlayerKey/authorPlayerKey`, `Answer.text` ; signatures `getLeaderboard(game, mode, difficulty)` et `searchLeaderboard` ; stats par opération limitées aux jeux concernés ; `seed-leaderboard` par jeu. |
| `agent_docs/e2e.md` | Oracles par jeu (`expectedAnswer` pour standard / manquant, solveur pour le bon compte, calcul de la bombe reçue) ; bots : `bomb()`, saisie d'expression et d'opérateur ; `data-testid` nouveaux (`tiles`, `bomb-text`, `bomb-pairs`) ; couverture faite / à faire par jeu. |
| `agent_docs/workflow.md` | Feuille de route : retirer « Nouveaux modes de jeu », ajouter les évolutions écartées (bon compte « au plus proche », bombe en solo contre l'ordinateur…). |
| `agent_docs/legal.md` | Rien de nouveau collecté ; noter que les bombes ne contiennent que des chiffres et opérateurs (pas de contenu libre à modérer). |
| `README.md` | Présentation des 4 jeux pour les humains. |

---

## 7. Décisions à valider

1. **Bombe non construite à temps** : bombe de secours sans point pour l'auteur (proposé) **ou** élimination de l'auteur ?
2. **Plaques de la bombe** : chaque plaque est un nombre, on ne peut pas coller deux chiffres pour faire « 37 » (proposé) — ou on autorise la concaténation ?
3. **Bon compte, mauvaise expression** : une expression valide mais fausse coûte la tentative (proposé, cohérent avec le calcul standard) — ou essais illimités jusqu'au temps ?
4. **Nombre manquant** : on ne cache jamais le résultat (proposé) — ou on l'ajoute comme troisième type de trou (ce qui revient au calcul standard) ?
5. **Elo** : séparé par jeu (proposé) ; les Elo actuels deviennent ceux du jeu `standard`.
