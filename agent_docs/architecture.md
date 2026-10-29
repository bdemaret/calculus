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

## Jeux et modes

- **Jeu** (`GameId`, `GameDefinition` dans `packages/game-core/src/games/`) : ce qu'on résout — génération du calcul, vérification de la réponse, forme de la réponse (nombre, expression ou opérateur), solo possible ou non, joueurs minimum.
- **Mode** (`GameModeId`, `GameModeRules` dans `modes.ts`) : comment on gagne — battle royale ou course de vitesse, communs à tous les jeux.
- La bombe se joue en ligne seulement (`solo: false`, 2 joueurs au moins), en battle royale, avec deux phases de plus par manche : `build` (chacun construit sa bombe) puis `assign` (qui reçoit quoi), avant `question` (chacun désamorce la bombe d'un autre).
- `GameSettings.game` vaut `standard` par défaut : les anciens réglages (navigateur, base) restent valides. Chaque jeu liste ses modes, `sanitizeSettings` remplace un mode non proposé.

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

1. Tourne entièrement dans le navigateur (`apps/web/src/app/[locale]/solo/SoloGame.tsx`) avec une graine. Bonne réponse : calcul suivant aussitôt. Erreur ou temps écoulé : phase `review`, le calcul reste avec la réponse donnée, la correction et la technique (`detectTechnique`, calcul mental, si les conseils sont affichés), jusqu'à « Suivant » ou Entrée (sur téléphone, dans un panneau posé sur le pavé ancré). La manche suivante ne démarre (`startRound(Date.now())`) qu'à ce moment : la pause ne compte ni dans le temps de réponse ni dans celui de la manche suivante.
2. Joueur connecté : envoie graine + paramètres + réponses (`SoloAnswer` : réponse et temps de chaque manche) à `POST /api/solo-results`. La route **rejoue** la partie avec `replaySolo` (game-core) pour recalculer calculs et justesse, puis `saveGame`. Rien n'est cru sur parole. Le rejeu enchaîne les manches sur une horloge fictive : les pauses entre manches n'y existent pas ; seuls `startedAt` / `endedAt` de la partie (dates affichées, aucune statistique) les incluent.
3. Invité : rien n'est enregistré.

## Variables d'environnement

Un seul `.env` à la racine (modèle : `.env.example`). Chargé par `dotenv -e ../../.env` (web, db) ou `tsx --env-file` (game-server). Toute nouvelle variable doit aussi être ajoutée à `globalEnv` dans `turbo.json` et à `.env.example`.

| Variable | Utilisée par |
| --- | --- |
| `DATABASE_URL` | db (local : Postgres Docker sur le port **5433** ; production : `$SCALINGO_POSTGRESQL_URL` de l'addon Scalingo) |
| `DIRECT_URL` | db, migrations seulement (`directUrl` de `schema.prisma`) : même valeur que `DATABASE_URL`, sauf derrière un pooler de connexions. Ajoutée au `.env` local par `pnpm lancer` |
| `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` | web (Better Auth) |
| `GAME_TOKEN_SECRET` | web (signe) + game-server (vérifie) — doit être identique, et différent de `BETTER_AUTH_SECRET` |
| `NODE_ENV` | `production` active les vérifications de démarrage : `assertProductionSecrets` (`apps/web/src/lib/env.ts`, appelé par `lib/auth.ts`) et `gameTokenSecretError` (`apps/game-server/src/env.ts`) refusent un secret vide, recopié de `.env.example` (`remplace-moi`) ou de moins de 32 caractères. Le script `start` du serveur de jeu le fixe lui-même |
| `NEXT_PUBLIC_GAME_SERVER_URL` | web, côté navigateur (`ws://localhost:2567` en local) |
| `GAME_SERVER_PORT` / `PORT` | game-server |
| `WEB_ORIGIN` | game-server : adresse(s) du site, séparées par des virgules. En production seulement, les WebSockets et le matchmaking d'une autre origine sont refusés (`limits.ts`), et le serveur refuse de démarrer sans elle |
| `RESEND_API_KEY`, `EMAIL_FROM` | web (e-mails ; sans clé, affichés dans le terminal, sauf en production où rien n'est envoyé ni affiché) |
| `LEGAL_PUBLISHER`, `LEGAL_CONTACT_EMAIL` | web (mentions légales : éditeur, vide = particulier anonyme ; e-mail de contact affiché dans les pages légales) |
| `ADMIN_USER_IDS` | web (ids des comptes administrateurs, séparés par des virgules ; vide = pas de panel admin). Jamais d'e-mails : ils ne sont pas vérifiés |
| `AUTH_RATE_LIMIT_DISABLED` | web, tests e2e uniquement (`"1"` coupe le rate limit de Better Auth et celui des routes, `lib/rateLimit.ts`) ; jamais en production |

## Déploiement

Tout chez Scalingo (région osc-fr1, France), **une seule application** (conteneur M, un seul) avec l'addon PostgreSQL. `CALCULUS_SERVICE=all` : `apps/web/server.ts` sert le site (Next en serveur personnalisé) et le serveur de jeu sur le même port ; `handleGameHttp` répond d'abord à `/health`, `/lobbies`, `/admin/rooms`, Colyseus à `/matchmake` et aux WebSockets, Next à tout le reste. Le site appelle donc le jeu à sa propre adresse, et `WEB_ORIGIN` vaut par défaut l'origine de `BETTER_AUTH_URL`. `apps/game-server/src/server.ts` est le module partagé ; `index.ts` le lance seul (développement, e2e, ou plus tard une application séparée avec `CALCULUS_SERVICE=web` / `game-server`). `scripts/scalingo.sh` construit (`scalingo-postbuild` de la racine, qui remplace le `build` Turborepo), démarre (`web` du `Procfile`) et migre (`postdeploy`). `PNPM_SKIP_PRUNING=true` garde les devDependencies (Prisma CLI, `dotenv-cli`). Le script exporte `SWC_NATIVE_BINDING_CACHE_SKIP_SECURITY_CHECK=1` : `@swc/core` (plugin next-intl, chargé avec `next.config.ts`) refuse sinon de matérialiser son binaire natif, les dossiers parents des conteneurs Scalingo étant modifiables par tous. Node : `engines` de la racine (lu par le buildpack Scalingo), `.nvmrc` en local. Domaine : DNS chez Cloudflare. Détails dans `README.md`.

- **Migrations** : appliquées uniquement par le `postdeploy` (Prisma les verrouille : deux déploiements simultanés n'en appliquent qu'un), jamais à la main depuis un poste. Le hook tourne une fois les nouveaux conteneurs démarrés, avant de leur envoyer le trafic : le nouveau code démarre donc sur l'ancien schéma, et en cas d'échec (`hook-error`) l'ancienne version continue de servir. L'ancien code tourne encore pendant la migration : elle doit rester compatible avec lui (ajouter avant d'utiliser, retirer après).
- **Une seule instance de serveur de jeu** : salles, présence et lobbys publics sont en mémoire. Chaque redéploiement (en mode combiné, celui du site aussi) coupe les parties en cours ; plusieurs instances (ou conteneurs Scalingo) demanderaient `RedisPresence`/`RedisDriver`.
- **En-têtes HTTP** (CSP, `frame-ancestors`, HSTS…) : `headers()` de `apps/web/next.config.ts`. `connect-src` est calculée depuis `NEXT_PUBLIC_GAME_SERVER_URL` au build : toute nouvelle origine appelée par le navigateur doit y être ajoutée.
