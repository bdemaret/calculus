# Calculus

Site de calcul mental, en solo ou jusqu'à 12 joueurs en ligne. Quatre jeux, deux modes (battle royale, course de vitesse), 5 niveaux, des comptes avec statistiques et un classement, en français et en anglais.

## Les jeux

| Jeu | Le principe | Modes | Solo |
| --- | --- | --- | :-: |
| **Calcul mental** | Un calcul, on tape son résultat. | battle royale, course de vitesse | oui |
| **Le bon compte** | Des plaques et une cible : utiliser toutes les plaques, chacune une fois, pour tomber pile sur la cible. Toujours possible. | battle royale, course de vitesse | oui |
| **Nombre manquant** | Une égalité où il manque un nombre ou un opérateur : `23 + ? = 41`, `12 ? 4 = 3`. | battle royale, course de vitesse | oui |
| **La bombe** | Chacun construit un calcul avec les mêmes plaques, puis désamorce celui d'un autre joueur. | battle royale | non (2 joueurs au moins) |

Un **jeu** dit ce qu'on résout, un **mode** dit comment on gagne : en battle royale, une erreur élimine ; en course de vitesse, le premier qui trouve marque le point. L'Elo et le classement sont propres à chaque jeu, mode et niveau.

## Ce que contient le projet

```
calculus/
  apps/
    web/            Le site (Next.js) : pages, comptes, solo, lobby, tableau de bord
    game-server/    Le serveur de jeu (Colyseus) : lobbies et parties en direct
  packages/
    game-core/      Le cœur du jeu : les quatre jeux, niveaux, règles des modes
    db/             La base de données (Prisma + PostgreSQL)
  prototype/        Le prototype jouable d'origine (un seul fichier HTML)
```

Le dossier `game-core` est utilisé à la fois par le site (mode solo) et par le serveur (parties en ligne) : un calcul suit exactement les mêmes règles partout.

## Installer et lancer sur ton ordinateur

Il te faut :

- **Node.js 22** (https://nodejs.org, version LTS) ;
- **Docker Desktop** (https://www.docker.com/products/docker-desktop), pour faire tourner la base de données en local. Sinon, crée une base gratuite sur https://neon.tech et colle son adresse dans `.env`.

Ensuite, dans un terminal ouvert dans le dossier `calculus`, avec Docker Desktop ouvert :

```bash
corepack enable   # une seule fois
pnpm lancer
```

`pnpm lancer` fait tout d'un coup : il prépare le fichier `.env`, démarre la base, installe les dépendances, crée les tables et lance le site. `pnpm lancer --reset` efface en plus la base locale pour repartir de zéro.

Le détail, si tu préfères faire étape par étape :

```bash
# 1. Activer pnpm (le gestionnaire de paquets du projet), une seule fois
corepack enable

# 2. Installer les dépendances
pnpm install

# 3. Créer le fichier de configuration
cp .env.example .env
#    puis ouvre .env et remplace les deux secrets par des chaînes aléatoires :
#    openssl rand -base64 32

# 4. Démarrer la base de données (Docker Desktop doit être ouvert)
pnpm db:up

# 5. Créer les tables (donne un nom à la migration quand on te le demande, par ex. « init »)
pnpm db:migrate

# 6. Lancer le site et le serveur de jeu
pnpm dev
```

Le site est alors sur http://localhost:3000 et le serveur de jeu sur le port 2567.

Pour tester une partie en ligne seul : ouvre le site dans une fenêtre normale et dans une fenêtre de navigation privée, crée un lobby dans l'une et rejoins-le avec le code dans l'autre.

### Autres commandes

| Commande | Effet |
| --- | --- |
| `pnpm test` | Lance les tests du moteur de jeu |
| `pnpm typecheck` | Vérifie le code TypeScript |
| `pnpm db:studio` | Ouvre une interface pour voir les données de la base |
| `pnpm build` | Construit le site pour la production |

## Mettre en ligne

1. **Base de données** : crée un projet sur [Neon](https://neon.tech), région Europe. Copie l'adresse de connexion.
2. **Tables** : en local, mets cette adresse dans `DATABASE_URL` puis lance `pnpm --filter @calculus/db migrate:deploy`.
3. **Serveur de jeu** : sur [Railway](https://railway.app) (ou Fly.io), crée un service depuis ton dépôt GitHub.
   - Commande d'installation : `corepack enable && pnpm install --frozen-lockfile`
   - Commande de démarrage : `pnpm --filter @calculus/game-server start`
   - Variables : `DATABASE_URL`, `GAME_TOKEN_SECRET`, `WEB_ORIGIN` (l'adresse du site). `PORT` est fourni par Railway, `NODE_ENV=production` par le script `start`.
   - Note l'adresse publique du service, par ex. `calculus-game.up.railway.app`.
4. **Site** : sur [Vercel](https://vercel.com), importe le dépôt et choisis `apps/web` comme dossier racine.
   - Variables : `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` (l'adresse du site), `GAME_TOKEN_SECRET` (le même que sur Railway), `NEXT_PUBLIC_GAME_SERVER_URL` (`wss://` + l'adresse Railway), `RESEND_API_KEY`, `EMAIL_FROM`, et `ADMIN_USER_IDS` pour le panel administrateur (id de ton compte, une fois créé sur le site en ligne).
   - Secrets : génère `BETTER_AUTH_SECRET` et `GAME_TOKEN_SECRET` avec `openssl rand -base64 32`, deux valeurs différentes. Le site et le serveur de jeu refusent de démarrer avec les valeurs de `.env.example` ou un secret trop court.
5. **E-mails** : crée une clé sur [Resend](https://resend.com) pour l'envoi des liens « mot de passe oublié ». Sans clé, ces e-mails s'affichent dans le terminal.

## Comment ça marche

- **Le serveur décide de tout pendant une partie en ligne** : il génère les calculs, chronomètre à la réception des réponses et ne montre jamais la bonne réponse avant la fin de la manche. Une seule réponse par joueur et par calcul, et 20 messages par seconde au maximum. À la bombe, chacun ne reçoit que la bombe qu'il doit désamorcer, jamais sa valeur.
- **Le mode solo** tourne entièrement dans le navigateur. Pour un joueur connecté, la partie est rejouée par le site à partir de sa « graine » avant d'être enregistrée : les calculs et la justesse des réponses ne sont jamais crus sur parole.
- **Les invités** jouent avec un pseudo, sans compte. Leurs parties ne sont pas enregistrées dans un tableau de bord.
- **Le lobby reste ouvert d'une partie à l'autre** : « Rejouer la même partie » relance avec les mêmes règles et de nouveaux calculs, « Rejouer avec d'autres paramètres » ramène tout le monde dans la salle d'attente.
- **Si l'hôte part**, la main passe au joueur arrivé le plus tôt. Un joueur déconnecté a 30 secondes pour revenir.

### Les niveaux

Pour le calcul mental et le nombre manquant :

| Niveau | Nombres | Opérations par défaut | Temps |
| --- | --- | --- | --- |
| 1 · Facile | 1 à 10 | + − | 10 s |
| 2 · Moyen | 5 à 50, tables jusqu'à 10 | + − × | 10 s |
| 3 · Difficile | 10 à 100, tables jusqu'à 12 | + − × ÷ | 12 s |
| 4 · Expert | jusqu'à 200, 3 termes | + − × ÷ et parenthèses | 15 s |
| 5 · Légende | jusqu'à 999, 3 ou 4 termes | + − × ÷ et parenthèses | 20 s |

Les réglages sont dans `packages/game-core/src/levels.ts`. Le bon compte (`RIGHT_COUNT_LEVELS`, de 4 petites plaques et une cible jusqu'à 50, à 6 plaques dont deux grandes et une cible jusqu'à 999) et la bombe (`BOMB_LEVELS`) ont leurs propres niveaux dans `packages/game-core/src/games/`.

### Ajouter un jeu

1. Dans `packages/game-core/src/games/`, crée un objet qui respecte l'interface `GameDefinition` (modes proposés, solo ou non, comment générer un calcul, comment vérifier une réponse).
2. Ajoute son identifiant au type `GameId` (`types.ts`), à `GAMES` et `GAME_IDS` (`games/index.ts`).
3. Ajoute son nom et ses règles dans `apps/web/messages/fr.json` et `en.json`, sous `games`, et la saisie qui lui convient côté site.
4. Écris un test dans `packages/game-core/test/`.

Le détail est dans `agent_docs/game-core.md`.

### Ajouter un mode de jeu

1. Dans `packages/game-core/src/modes.ts`, crée un objet qui respecte l'interface `GameModeRules` (qui peut répondre, quand la manche se termine, qui marque, quand la partie est finie, comment classer).
2. Ajoute son identifiant au type `GameModeId` (`types.ts`), à `GAME_MODES` (`settings.ts`) et à `MODES` (`modes.ts`), puis aux `modes` des jeux qui le proposent.
3. Ajoute son nom et ses explications dans `apps/web/messages/fr.json` et `en.json`, sous `modes`.
4. Écris un test dans `packages/game-core/test/`.

## Pas encore fait

- Mode entraînement ciblé sur les points faibles
- Le bon compte « au plus proche » (comme l'émission), la bombe en solo contre l'ordinateur
