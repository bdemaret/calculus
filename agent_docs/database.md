# packages/db

Prisma 6 + PostgreSQL. Schéma : `packages/db/prisma/schema.prisma`. Client et requêtes métier : `packages/db/src/index.ts`.

## Modèles

- **Comptes (gérés par Better Auth, ne pas renommer les champs)** : `User`, `Session`, `Account`, `Verification`. Tables en minuscules via `@@map`.
- **Parties** : `Game` (réglages JSON + colonnes dénormalisées `mode`, `difficulty`, `turnStyle`, `seed`) → `GamePlayer` (`playerKey` = id utilisé en jeu, `userId` null pour un invité) → `Question` (`tags` : `add|sub|mul|div|paren`) → `Answer` (`value` null si temps écoulé).
- **`UserStats`** : agrégats incrémentés par `saveGame` dans la même transaction, pour un dashboard rapide.

## Fonctions exportées

| Fonction | Usage |
| --- | --- |
| `prisma` | Client unique par processus (singleton global en dev) |
| `saveGame(input)` | Enregistre partie + joueurs + questions + réponses + met à jour `UserStats` (transaction) |
| `loadGameReport(id)` | Reconstruit un `GameReport` (via `buildReport` de game-core) pour `/report/[id]` |
| `getDashboard(userId)` | Stats globales, 30 dernières parties, stats par opération (3000 dernières réponses) |

## Migrations

- Modifier `schema.prisma`, puis `pnpm db:migrate` (= `prisma migrate dev`, demande un nom) : crée le dossier dans `prisma/migrations/` et régénère le client. Committer la migration.
- Production : `pnpm --filter @calculus/db migrate:deploy`.
- Ne jamais éditer une migration déjà appliquée ; en créer une nouvelle.
- Base locale : `pnpm db:up` (Docker, Postgres 17, port **5433**, user/mdp/base `calculus`). `pnpm db:studio` pour inspecter. `pnpm lancer --reset` efface tout.
- Le client est généré au `postinstall` et par la tâche Turbo `generate` (dépendance de `dev` et `typecheck`).
