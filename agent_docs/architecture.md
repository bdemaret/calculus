# Architecture

Monorepo pnpm + Turborepo. Tout est en TypeScript (ESM, `strict`, `noUncheckedIndexedAccess`, voir `tsconfig.base.json`).

```
apps/
  web/            Next.js 15 (App Router) : pages, comptes, solo, lobby, dashboard, routes API
  game-server/    Colyseus 0.16 : une salle = un lobby, parties en ligne en direct
packages/
  game-core/      Logique pure du jeu (aucune dépendance réseau / UI / DB)
  db/             Prisma + PostgreSQL : schéma, client, saveGame / loadGameReport / getDashboard
prototype/        Prototype HTML d'origine (référence historique, ne pas modifier)
scripts/lancer.mjs  `pnpm lancer` : .env + Docker + install + migrations + dev
```

## Dépendances entre paquets

```
game-core  ←  db  ←  web
    ↑         ↑
    └── game-server
```

- `game-core` et `db` ne sont **pas compilés** : leur `main`/`exports` pointe directement sur `src/index.ts`. Next les transpile (`transpilePackages` dans `apps/web/next.config.ts`), le serveur de jeu tourne via `tsx`.
- `game-core` est la seule source de vérité des règles : le solo (navigateur), la vérification du solo (route API) et le multijoueur (serveur) utilisent le même `GameEngine`.

## Flux principaux

### Partie en ligne

1. Le navigateur appelle `POST /api/game-token` (`apps/web/src/app/api/game-token/route.ts`) → JWT HS256 signé avec `GAME_TOKEN_SECRET` (issuer `calculus-web`, audience `calculus-game`, 2 h). Compte connecté : `sub` = id du compte ; invité : `sub` = `guest_<uuid>`.
2. `apps/web/src/lib/colyseus.ts` se connecte à `NEXT_PUBLIC_GAME_SERVER_URL` avec ce jeton.
3. `GameRoom.onAuth` (statique, pendant le matchmaking) vérifie le jeton (`apps/game-server/src/token.ts`). Erreurs de connexion : codes `JOIN_ERRORS` (`protocol.ts`).
4. Le serveur pilote tout : phases `lobby → countdown → question → round-result → … → finished`, envoie un `RoomSnapshot` complet à chaque changement (jamais la réponse avant la fin de la manche).
5. En fin de partie, `persist.ts` appelle `saveGame` (les erreurs de persistance n'interrompent jamais le jeu).

### Partie solo

1. Tourne entièrement dans le navigateur (`apps/web/src/app/[locale]/solo/SoloGame.tsx`) avec une graine.
2. Joueur connecté : envoie graine + paramètres + réponses à `POST /api/solo-results`. La route **rejoue** la partie avec `GameEngine` pour recalculer calculs et justesse, puis `saveGame`. Rien n'est cru sur parole.
3. Invité : rien n'est enregistré.

## Variables d'environnement

Un seul `.env` à la racine (modèle : `.env.example`). Chargé par `dotenv -e ../../.env` (web, db) ou `tsx --env-file` (game-server). Toute nouvelle variable doit aussi être ajoutée à `globalEnv` dans `turbo.json` et à `.env.example`.

| Variable | Utilisée par |
| --- | --- |
| `DATABASE_URL` | db (local : Postgres Docker sur le port **5433**) |
| `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` | web (Better Auth) |
| `GAME_TOKEN_SECRET` | web (signe) + game-server (vérifie) — doit être identique |
| `NEXT_PUBLIC_GAME_SERVER_URL` | web, côté navigateur (`ws://localhost:2567` en local) |
| `GAME_SERVER_PORT` / `PORT` | game-server |
| `WEB_ORIGIN` | game-server |
| `RESEND_API_KEY`, `EMAIL_FROM` | web (e-mails ; sans clé, affichés dans le terminal, sauf en production où rien n'est envoyé ni affiché) |
| `LEGAL_PUBLISHER`, `LEGAL_CONTACT_EMAIL` | web (mentions légales : éditeur, vide = particulier anonyme ; e-mail de contact affiché dans les pages légales) |
| `AUTH_RATE_LIMIT_DISABLED` | web, tests e2e uniquement (`"1"` coupe le rate limit de Better Auth) ; jamais en production |

## Déploiement

Web sur Vercel (racine `apps/web`), serveur de jeu sur Railway/Fly (`pnpm --filter @calculus/game-server start`, route `/health`), base sur Neon. Détails dans `README.md`.
