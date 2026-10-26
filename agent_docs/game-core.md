# packages/game-core

Logique pure, déterministe, sans I/O. Tout est réexporté par `src/index.ts`.

| Fichier | Rôle |
| --- | --- |
| `types.ts` | Types de base : `GameSettings`, `Question` (+ `solution`, `puzzle`), `PlayerAnswer`, `PlayerState`, `RoundRecord`, `Standing`, `GameId`, `GameModeId`… |
| `games/` | Les jeux : `GameDefinition` (`types.ts`), `standardGame` (`standard.ts`), `rightCountGame` + `RIGHT_COUNT_LEVELS` (`right-count.ts`), `missingGame` (`missing.ts`), `bombGame` + `BOMB_LEVELS`, `bombValue`, `fallbackBomb`, `assignBombs` (`bomb.ts`), `GAMES` et `GAME_IDS` (`index.ts`), `answerOfRecord` pour rejouer une réponse enregistrée |
| `solver.ts` | `solveTiles(tiles, operations, maxValue)` : valeurs atteignables avec toutes les plaques, une fois chacune (programmation dynamique sur les sous-ensembles, ~10 ms pour 6 plaques) et une solution lisible pour chacune |
| `limits.ts` | Bornes communes (`MAX_PLAYERS`, manches, temps du calcul standard, temps de construction de la bombe, `BATTLE_ROYALE_ROUND_CAP`), réexportées par `settings.ts` |
| `expression.ts` | Expressions saisies par les joueurs : `parseExpression` (stricte, `MAX_EXPRESSION_LENGTH` = 64), `evaluateStrict` (intermédiaires entiers ≥ 0, divisions exactes, opérations permises), `numbersOf`, `fitsTiles` (plaques utilisées au plus une fois), `operatorOfSymbol` (« + », « - », « x », « ÷ »… → opération), `formatExpression` (arbre → texte avec le minimum de parenthèses) |
| `rng.ts` | RNG à graine (`createRng`, `hashSeed`, `randInt`, `pick`, `randomSeed`) |
| `levels.ts` | Les 5 niveaux (`LEVELS`, `DIFFICULTIES`, `ALL_OPERATIONS`) : bornes, opérations et temps par défaut |
| `settings.ts` | `defaultSettings(difficulty, mode, game)` (opérations, parenthèses et temps viennent de `GAMES[game].defaults`), `sanitizeSettings` (jeu absent → `standard`, mode non proposé par le jeu → son premier mode, temps borné par `GAMES[game].timeRange`) |
| `generator.ts` | Génération des calculs (`generateQuestion(seed, index, settings)`) + évaluateur (`evaluateText`, `evaluateTokens`, `tokenize`, `renderTokens`) ; symboles `OPERATION_SYMBOL` / `SYMBOL_OPERATION` |
| `modes.ts` | Règles des modes (`GameModeRules`, `battleRoyale`, `speedRace`, `MODES`) |
| `engine.ts` | `GameEngine` : manches, réponses, clôture, classement ; `rules` = le mode, `game` = le jeu |
| `report.ts` | `buildReport` : bilan de fin de partie (stats par joueur, par opération, revue des manches) |
| `elo.ts` | Elo multijoueur : `computeRatingChanges` (duels deux à deux selon le rang, `ELO_K` = 32 divisé par le nombre d'adversaires), `INITIAL_RATING` = 1000. Placement : pendant `PLACEMENT_GAMES` = 5 parties, Elo caché, et le joueur ne compte pas comme adversaire pour les classés. `describeRatingChange` → `RatingChange` (`rated` / `placement` / `revealed`), seule forme montrée aux joueurs |
| `protocol.ts` | Contrat réseau navigateur ↔ serveur : `RoomSnapshot`, `ClientMessages`, `ServerMessages`, `GameTokenPayload`, `JOIN_ERRORS`, codes de lobby |

## Invariants à respecter

- **Déterminisme** : un calcul dépend uniquement de `(seed, index, settings)`. Ne jamais utiliser `Math.random()` ni `Date.now()` dans game-core (sauf `randomSeed`). C'est ce qui permet au site de rejouer une partie solo pour la vérifier.
- **Le temps est un paramètre** : `GameEngine` reçoit toujours `now` (ms) ; c'est l'appelant (serveur ou route API) qui fournit l'horloge.
- **Jamais la solution côté client** : `Question.puzzle` est envoyé pendant la manche, il ne doit donc jamais contenir la solution ; `answer` et `solution` ne partent qu'en fin de manche.
- **Calculs valides** : résultats entiers, ≥ 0, et `evaluateText(q.text) === q.answer`. Les opérations demandées sont les seules utilisées ; pas de parenthèses si `parentheses: false`.
- **Entrées externes** : toujours passer par `sanitizeSettings` (ne lève jamais d'erreur, remplace toute valeur invalide).
- Symboles affichés : `+ − × ÷` (signe moins et multiplication Unicode, pas `-`/`*`).

## Cycle d'une manche (GameEngine)

```ts
const engine = new GameEngine(settings, players, seed);
const round = engine.startRound(now);          // null si partie finie
engine.submit(playerId, answer, now);          // PlayerAnswer ({ value } | { expr } | { op }) ou un nombre ; SubmitResult { accepted, correct, roundCanClose, … }
engine.closeRound();                           // applique rules.resolveRound
engine.isOver; engine.standings(); engine.history;
```

- Battle royale : `totalRounds` = `BATTLE_ROYALE_ROUND_CAP`, élimination à la première erreur ; si tous les survivants échouent en simultané, personne n'est éliminé (`round.spared`). Le temps accélère via `timeFactor`.
- Course de vitesse : le point va à la première bonne réponse. En `turnStyle: "turns"`, chaque joueur reçoit `rounds` calculs.

Une réponse d'une autre forme que `game.answerKind(question)` (la forme peut changer d'un calcul à l'autre) est refusée (`invalid-value`) sans consommer l'essai. `AnswerRecord` garde `value` (nombre) ou `text` (expression, ou symbole affiché d'un opérateur : « ÷ »).

## Le bon compte (`games/right-count.ts`)

- Des plaques et une cible : il faut **utiliser toutes les plaques, chacune exactement une fois**, avec les opérations permises (`settings.operations`) et des parenthèses (toujours permises, le réglage `parentheses` est ignoré). Intermédiaires entiers ≥ 0, divisions exactes.
- **Toujours résoluble** : on tire les plaques (`RIGHT_COUNT_LEVELS` : petites 1–10, grandes 25/50/75/100), `solveTiles` donne toutes les valeurs atteignables avec toutes les plaques, et la cible est tirée parmi celles de la plage du niveau. Si la plage est hors d'atteinte (une seule opération permise), on l'élargit, puis un tirage construit pour une seule opération sert de filet de sécurité.
- Réponse : une expression (`answerKind` = `expr`). `isValid` refuse sans consommer l'essai une expression mal formée, qui oublie, répète ou invente une plaque ; `check` compare le total à la cible. N'importe quelle solution est acceptée ; `solution` en donne une.
- **Le plus proche** : une expression recevable qui ne tombe pas pile compte comme une réponse fausse (elle consomme l'essai) mais reste une *proposition*. À la clôture (`closeRound`), en simultané et à plusieurs joueurs, si personne n'a trouvé, `closestAnswers` (`games/types.ts`, via `GameDefinition.distance`) marque `closest: true` les réponses à l'écart minimal ; les modes les traitent comme gagnantes (course de vitesse : la première arrivée des plus proches prend le point ; battle royale : les plus proches restent en vie). `player.correct` n'augmente pas. Pas de plus proche en solo ni en « chacun son tour ». `loadGameReport` recalcule `closest` à partir des expressions enregistrées (pas de colonne en base).
- **Saisie en étapes** (`steps.ts`) : `readSteps(tiles, operations, input)` lit « 75 + 2;77 × 6;… » (étapes séparées par `;`, puis la ligne en cours) : chaque étape devient un nombre disponible, `complete` donne l'expression complète (`formatExpression` de l'arbre recomposé) quand toutes les plaques sont utilisées. `commitStep` / `undoStep` / `encodeSteps` pour éditer. Seule l'expression complète part au serveur ; le texte en étapes est relayé tel quel par `typing` (`MAX_STEPS_LENGTH`).
- `text` = « 75 50 3 6 8 2 → 412 », `puzzle` = `{ tiles, target, operations }`, pas de tags (`operationStats: false`). Temps 20–180 s (`timeRange`), 45 à 90 s par défaut.

## La bombe (`games/bomb.ts`)

- Une manche en deux temps, dans le même `RoundRecord` (`stage`) :
  1. **Construction** (`stage: "build"`, durée `settings.buildTime`) : `round.question` est le tirage commun (`puzzle` : `tiles`, `operations`, `minTiles`, `maxResult`, `parentheses`). `engine.submitBomb(id, expr)` valide avec `bombValue` (plaques au plus une fois, au moins `minTiles`, opérations et parenthèses permises, résultat entier entre 0 et `maxResult` ; sinon une raison `BombError`) et garde la bombe réécrite (`formatExpression`) dans `round.bombs`. Une bombe par joueur.
  2. **Désamorçage** : `engine.closeBuild(solveAt)` donne une bombe de secours (`fallbackBomb`, déterministe) à qui n'a rien envoyé, attribue les bombes par un cycle tiré au hasard (`assignBombs` : personne ne reçoit la sienne, chacun en reçoit une), remplit `round.personal[désamorceur] = { question, authorId }` (un calcul standard) et repart le chrono à `solveAt`. `submit` vérifie contre la question de ce joueur (`engine.questionFor`).
- Points : le mode battle royale élimine les désamorceurs qui ratent (+1 à ceux qui réussissent, `spared` si tous ratent) ; `bombGame.resolveExtras` donne +1 à l'auteur d'une bombe qui explose (pas pour une bombe de secours).
- Une partie finie pendant la construction (départs) annule la manche (`closeRound` renvoie null, rien dans l'historique).
- Le rapport (`RoundReview.bombs`) et les statistiques utilisent la question de chaque joueur.
- Réglages : `buildTime` (15–120 s, 45 par défaut), temps de désamorçage 5–60 s, toujours en simultané (`turns: false`).

## Nombre manquant (`games/missing.ts`)

- Part d'un calcul du générateur standard (mêmes niveaux, opérations, parenthèses), en cache un nombre ou un opérateur : `23 + ? = 41`, `12 ? 4 = 3`. Réglage `missingKind` : `number`, `operator` ou `mixed` (opérateur une fois sur trois) ; défaut `number` aux niveaux 1–2, `mixed` au-delà.
- **Réponse unique garantie** : opérateur rejeté si un autre convient ; nombre rejeté si une autre valeur convient dans une fenêtre de ±30 (avec un seul trou, l'égalité varie toujours dans le même sens, sauf si le trou est multiplié par zéro, ce que la fenêtre détecte).
- `check` remplace le trou et réévalue l'égalité. `puzzle` : `{ hole, tokens (avec "?"), result }`. `answer` = nombre caché, ou résultat pour un opérateur ; `solution` = ce qui manque (« 18 », « ÷ »). Tags : opérations + `hole-num` / `hole-op`.

## Ajouter un jeu

1. Créer un `GameDefinition` dans `games/<jeu>.ts` : `modes`, `solo`, `minPlayers`, `turns`, `operationStats`, `timeRange`, `defaults(difficulty)`, `answerKind(question)`, `generate` (déterministe), `isValid` (facultatif), `check` et `resolveExtras` (facultatif).
2. Ajouter l'id à `GameId` (`types.ts`), sa variante à `Puzzle` si besoin, puis à `GAMES` et `GAME_IDS` (`games/index.ts`). Un réglage propre au jeu va dans `GameSettings`, toujours présent avec une valeur par défaut (`defaultSettings`, `sanitizeSettings`).
3. Côté site : saisie adaptée (`lib/answer.ts`, `CalcLine`), affichage du `puzzle`, séparateur énoncé / solution (`revealSeparator`) ; textes `games.<id>.{name,short,long}` dans `fr.json` et `en.json` ; `revealSeparator` complété.
4. Tests dans `packages/game-core/test/` (génération exhaustive, `check`).

## Ajouter un mode de jeu

1. Créer un objet `GameModeRules` dans `modes.ts`.
2. Ajouter l'id à `GameModeId` (`types.ts`), `GAME_MODES` (`settings.ts`), `MODES` (`modes.ts`), puis aux `modes` des jeux qui le proposent.
3. Textes dans `apps/web/messages/fr.json` et `en.json` sous `modes`.
4. Test dans `packages/game-core/test/`.

## Tests

`pnpm --filter @calculus/game-core test` (Vitest, `test/game-core.test.ts`, `test/expression.test.ts`, `test/missing.test.ts`, `test/right-count.test.ts`, `test/bomb.test.ts`). Les tests du générateur balaient tous les niveaux × combinaisons d'opérations × parenthèses : à garder exhaustifs quand on touche `generator.ts` ou `levels.ts`.
