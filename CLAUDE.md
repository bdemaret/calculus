# Calculus

Site de calcul mental en solo ou jusqu'à 12 joueurs en ligne (battle royale, course de vitesse), 5 niveaux, comptes avec statistiques, en français et en anglais.

Monorepo pnpm + Turborepo, TypeScript strict :
- `apps/web` : Next.js 15 (App Router, next-intl, Better Auth, Tailwind 4)
- `apps/game-server` : Colyseus 0.16 (parties en ligne, autorité serveur)
- `packages/game-core` : règles du jeu pures et déterministes, partagées par le site et le serveur
- `packages/db` : Prisma + PostgreSQL

## Commandes essentielles

```bash
pnpm lancer      # tout-en-un : .env, base Docker, install, migrations, dev
pnpm dev         # web :3000 + serveur de jeu :2567
pnpm typecheck   # à lancer avant de rendre la main
pnpm test        # tests Vitest de game-core
pnpm db:migrate  # après toute modification de schema.prisma
```

## Règles à ne jamais enfreindre

- **game-core reste pur et déterministe** : un calcul ne dépend que de `(seed, index, settings)`, le temps est passé en paramètre. Pas de `Math.random()`, `Date.now()`, réseau ou DOM dedans.
- **Le serveur décide** : en ligne, la bonne réponse n'est jamais envoyée avant la fin de la manche ; en solo, `/api/solo-results` rejoue la partie à partir de la graine. Ne jamais faire confiance au client.
- **Toute entrée externe est validée** (Zod, `sanitizeSettings`), et chaque message Colyseus passe par le rate limit.
- **Aucun texte UI en dur** : clés dans `apps/web/messages/fr.json` **et** `en.json`. Navigation via `@/i18n/navigation`.
- Code commenté en français, identifiants en anglais. Pas de commit/push sans demande.

## Documentation détaillée

Lire le fichier pertinent dans `agent_docs/` avant de travailler sur une zone :

| Fichier | Quand le lire |
| --- | --- |
| [agent_docs/architecture.md](agent_docs/architecture.md) | Vue d'ensemble, flux solo / en ligne, variables d'environnement, déploiement |
| [agent_docs/game-core.md](agent_docs/game-core.md) | Générateur, niveaux, modes, `GameEngine`, protocole réseau, ajout d'un mode |
| [agent_docs/game-server.md](agent_docs/game-server.md) | `GameRoom`, phases, anti-triche, ajout d'un message réseau |
| [agent_docs/web.md](agent_docs/web.md) | Pages, i18n, auth, routes API, conventions UI et thème |
| [agent_docs/database.md](agent_docs/database.md) | Schéma Prisma, `saveGame` / `getDashboard`, migrations |
| [agent_docs/workflow.md](agent_docs/workflow.md) | Commandes, vérifications avant de rendre la main, style de code, feuille de route |

Le `README.md` reste la doc destinée aux humains (installation, mise en ligne).
