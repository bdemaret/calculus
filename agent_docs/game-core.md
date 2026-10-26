# packages/game-core

Logique pure, déterministe, sans I/O. Tout est réexporté par `src/index.ts`.

| Fichier | Rôle |
| --- | --- |
| `types.ts` | Types de base : `GameSettings`, `Question`, `PlayerState`, `RoundRecord`, `Standing`, `GameModeId`… |
| `rng.ts` | RNG à graine (`createRng`, `hashSeed`, `randInt`, `pick`, `randomSeed`) |
| `levels.ts` | Les 5 niveaux (`LEVELS`, `DIFFICULTIES`, `ALL_OPERATIONS`) : bornes, opérations et temps par défaut |
| `settings.ts` | Limites (`MAX_PLAYERS` = 12, manches 5–50, temps 3–60 s, `BATTLE_ROYALE_ROUND_CAP` = 100), `defaultSettings`, `sanitizeSettings` |
| `generator.ts` | Génération des calculs (`generateQuestion(seed, index, settings)`) + évaluateur (`evaluateText`, `tokenize`) |
| `modes.ts` | Règles des modes (`GameModeRules`, `battleRoyale`, `speedRace`, `MODES`) |
| `engine.ts` | `GameEngine` : manches, réponses, clôture, classement |
| `report.ts` | `buildReport` : bilan de fin de partie (stats par joueur, par opération, revue des manches) |
| `elo.ts` | Elo multijoueur : `computeRatingChanges` (duels deux à deux selon le rang, `ELO_K` = 32 divisé par le nombre d'adversaires), `INITIAL_RATING` = 1000. Placement : pendant `PLACEMENT_GAMES` = 5 parties, Elo caché, et le joueur ne compte pas comme adversaire pour les classés. `describeRatingChange` → `RatingChange` (`rated` / `placement` / `revealed`), seule forme montrée aux joueurs |
| `protocol.ts` | Contrat réseau navigateur ↔ serveur : `RoomSnapshot`, `ClientMessages`, `ServerMessages`, `GameTokenPayload`, `JOIN_ERRORS`, codes de lobby |

## Invariants à respecter

- **Déterminisme** : un calcul dépend uniquement de `(seed, index, settings)`. Ne jamais utiliser `Math.random()` ni `Date.now()` dans game-core (sauf `randomSeed`). C'est ce qui permet au site de rejouer une partie solo pour la vérifier.
- **Le temps est un paramètre** : `GameEngine` reçoit toujours `now` (ms) ; c'est l'appelant (serveur ou route API) qui fournit l'horloge.
- **Calculs valides** : résultats entiers, ≥ 0, et `evaluateText(q.text) === q.answer`. Les opérations demandées sont les seules utilisées ; pas de parenthèses si `parentheses: false`.
- **Entrées externes** : toujours passer par `sanitizeSettings` (ne lève jamais d'erreur, remplace toute valeur invalide).
- Symboles affichés : `+ − × ÷` (signe moins et multiplication Unicode, pas `-`/`*`).

## Cycle d'une manche (GameEngine)

```ts
const engine = new GameEngine(settings, players, seed);
const round = engine.startRound(now);          // null si partie finie
engine.submit(playerId, value, now);           // SubmitResult { accepted, correct, roundCanClose, … }
engine.closeRound();                           // applique rules.resolveRound
engine.isOver; engine.standings(); engine.history;
```

- Battle royale : `totalRounds` = `BATTLE_ROYALE_ROUND_CAP`, élimination à la première erreur ; si tous les survivants échouent en simultané, personne n'est éliminé (`round.spared`). Le temps accélère via `timeFactor`.
- Course de vitesse : le point va à la première bonne réponse. En `turnStyle: "turns"`, chaque joueur reçoit `rounds` calculs.

## Ajouter un mode de jeu

1. Créer un objet `GameModeRules` dans `modes.ts`.
2. Ajouter l'id à `GameModeId` (`types.ts`), `GAME_MODES` (`settings.ts`), `MODES` (`modes.ts`).
3. Textes dans `apps/web/messages/fr.json` et `en.json` sous `modes`.
4. Test dans `packages/game-core/test/`.

## Tests

`pnpm --filter @calculus/game-core test` (Vitest, `test/game-core.test.ts`). Les tests du générateur balaient tous les niveaux × combinaisons d'opérations × parenthèses : à garder exhaustifs quand on touche `generator.ts` ou `levels.ts`.
