# Workflow de développement

## Commandes (depuis la racine)

| Commande | Effet |
| --- | --- |
| `pnpm lancer` | Tout-en-un : prépare `.env`, démarre la base Docker, installe, migre, lance `dev` (`--reset` efface la base, `--no-dev` s'arrête avant de lancer) |
| `pnpm dev` | Web (3000) + serveur de jeu (2567) via Turbo |
| `pnpm test` | Tests Vitest de game-core |
| `pnpm e2e` / `e2e:ui` | Tests Playwright (voir `agent_docs/e2e.md`) |
| `pnpm typecheck` | `tsc --noEmit` sur tous les paquets |
| `pnpm build` | Build de production |
| `pnpm db:up` / `db:migrate` / `db:studio` | Base locale |

Filtrer un paquet : `pnpm --filter @calculus/<web|game-server|game-core|db> <script>`.

Gestionnaire de paquets : **pnpm 10** uniquement (`corepack enable`). Node ≥ 20.9 (22 recommandé). Les paquets à scripts de build autorisés sont listés dans `pnpm-workspace.yaml` (`onlyBuiltDependencies`).

## Avant de rendre la main

1. `pnpm typecheck`
2. `pnpm test` si `packages/game-core` a été touché (ajouter un test pour toute nouvelle règle).
3. `pnpm e2e` si un parcours joueur a changé (ajouter ou adapter le test e2e correspondant).
4. Changement d'UI : vérifier dans le navigateur (`.claude/launch.json` → `web`), en `fr` **et** `en`, et sur largeur mobile.
5. Changement de schéma : migration créée et committée.

## Style de code

- Commentaires, messages de log et textes d'erreur internes en **français**, comme le reste du code ; identifiants en anglais.
- Commentaires JSDoc courts (`/** … */`) sur les fonctions et champs exportés, expliquant le *pourquoi*.
- Pas de `any` ; préférer `unknown` + validation (Zod ou `sanitizeSettings`) pour tout ce qui vient de l'extérieur.
- Constantes de réglage en `SCREAMING_SNAKE_CASE` en tête de fichier, avec un commentaire indiquant l'unité.

## Git

- Ne jamais committer `.env`, `node_modules/`, `.next/`, `.turbo/`, `dist/`, `*.tsbuildinfo` (déjà dans `.gitignore`).
- Pas de commit ni de push sans demande explicite.

## Feuille de route (pas encore fait)

- Mode entraînement ciblé sur les points faibles
- Classements publics
- Nouveaux modes de jeu
