# packages/game-core

Logique pure, déterministe, sans I/O. Tout est réexporté par `src/index.ts`.

| Fichier | Rôle |
| --- | --- |
| `types.ts` | Types de base : `GameSettings`, `Question` (+ `solution`, `puzzle`), `PlayerAnswer`, `PlayerState`, `RoundRecord`, `Standing`, `GameId`, `GameModeId`… |
| `games/` | Les jeux : `GameDefinition` (`types.ts`), `standardGame` (`standard.ts`), `missingGame` (`missing.ts`), `GAMES` et `GAME_IDS` (`index.ts`), `answerOfRecord` pour rejouer une réponse enregistrée |
| `expression.ts` | Expressions saisies par les joueurs : `parseExpression` (stricte, `MAX_EXPRESSION_LENGTH` = 64), `evaluateStrict` (intermédiaires entiers ≥ 0, divisions exactes, opérations permises), `numbersOf`, `fitsTiles` (plaques utilisées au plus une fois), `operatorOfSymbol` (« + », « - », « x », « ÷ »… → opération) |
| `rng.ts` | RNG à graine (`createRng`, `hashSeed`, `randInt`, `pick`, `randomSeed`) |
| `levels.ts` | Les 5 niveaux (`LEVELS`, `DIFFICULTIES`, `ALL_OPERATIONS`) : bornes, opérations et temps par défaut |
| `settings.ts` | Limites (`MAX_PLAYERS` = 12, manches 5–50, temps 3–60 s, `BATTLE_ROYALE_ROUND_CAP` = 100), `defaultSettings`, `sanitizeSettings` (jeu absent → `standard`, mode non proposé par le jeu → son premier mode) |
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

## Nombre manquant (`games/missing.ts`)

- Part d'un calcul du générateur standard (mêmes niveaux, opérations, parenthèses), en cache un nombre ou un opérateur : `23 + ? = 41`, `12 ? 4 = 3`. Réglage `missingKind` : `number`, `operator` ou `mixed` (opérateur une fois sur trois) ; défaut `number` aux niveaux 1–2, `mixed` au-delà.
- **Réponse unique garantie** : opérateur rejeté si un autre convient ; nombre rejeté si une autre valeur convient dans une fenêtre de ±30 (avec un seul trou, l'égalité varie toujours dans le même sens, sauf si le trou est multiplié par zéro, ce que la fenêtre détecte).
- `check` remplace le trou et réévalue l'égalité. `puzzle` : `{ hole, tokens (avec "?"), result }`. `answer` = nombre caché, ou résultat pour un opérateur ; `solution` = ce qui manque (« 18 », « ÷ »). Tags : opérations + `hole-num` / `hole-op`.

## Ajouter un jeu

1. Créer un `GameDefinition` dans `games/<jeu>.ts` : `modes`, `solo`, `minPlayers`, `answerKind(question)`, `generate` (déterministe), `check`.
2. Ajouter l'id à `GameId` (`types.ts`), sa variante à `Puzzle` si besoin, puis à `GAMES` et `GAME_IDS` (`games/index.ts`). Un réglage propre au jeu va dans `GameSettings`, toujours présent avec une valeur par défaut (`defaultSettings`, `sanitizeSettings`).
3. Côté site : saisie adaptée (`lib/answer.ts`, `CalcLine`), affichage du `puzzle`, séparateur énoncé / solution (`revealSeparator`) ; textes `games.<id>.{name,short,long}` dans `fr.json` et `en.json` ; jeu ajouté à `OPERATION_STATS_GAMES` (db) si ses tags sont des opérations.
4. Tests dans `packages/game-core/test/` (génération exhaustive, `check`).

## Ajouter un mode de jeu

1. Créer un objet `GameModeRules` dans `modes.ts`.
2. Ajouter l'id à `GameModeId` (`types.ts`), `GAME_MODES` (`settings.ts`), `MODES` (`modes.ts`), puis aux `modes` des jeux qui le proposent.
3. Textes dans `apps/web/messages/fr.json` et `en.json` sous `modes`.
4. Test dans `packages/game-core/test/`.

## Tests

`pnpm --filter @calculus/game-core test` (Vitest, `test/game-core.test.ts`, `test/expression.test.ts`, `test/missing.test.ts`). Les tests du générateur balaient tous les niveaux × combinaisons d'opérations × parenthèses : à garder exhaustifs quand on touche `generator.ts` ou `levels.ts`.
