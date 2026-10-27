# Sécurité : pièges à ne pas reproduire

Relevés lors de l'audit du 27 octobre 2026. Le détail des corrections, classées par criticité, est dans `plans/securite-production.md` ; retirer une ligne d'ici quand le point est corrigé partout.

## Règles

- **Aléa côté serveur = `node:crypto`.** Une graine de partie, un code de salle, un jeton : `randomBytes` / `randomInt` / `randomUUID`, jamais `Math.random()`. Son état se retrouve à partir des valeurs qu'il a produites (codes de salle affichés), donc la graine d'une partie en ligne deviendrait prévisible et tous ses calculs avec. `randomSeed()` de game-core (`rng.ts`) repose aujourd'hui sur `Math.random` : il convient au solo, pas au serveur. *Pas encore corrigé* : `GameRoom.startGame` et `generateCode`.
- **Un secret d'exemple ne doit jamais démarrer en production.** Better Auth ne refuse que son propre secret par défaut, pas `remplace-moi-…` de `.env.example`. Les secrets actuels sont vérifiés au démarrage (`assertProductionSecrets` dans `apps/web/src/lib/env.ts`, `gameTokenSecretError` dans `apps/game-server/src/env.ts`) : tout nouveau secret doit y être ajouté.
- **Pas de droit accordé sur une adresse e-mail non vérifiée.** Les e-mails ne sont pas vérifiés à l'inscription : n'importe qui peut prendre une adresse qui n'a pas encore de compte (ou plus de compte). Les administrateurs sont donc désignés par id (`ADMIN_USER_IDS`) ; faire de même pour tout rôle ou accès futur.
- **Toute ressource créable par un inconnu a une limite.** Jeton invité, salle, connexion WebSocket, partie solo, retour : chacun doit être borné par compte ou par IP, sinon une boucle remplit la mémoire du serveur de jeu ou la base. Exemples à suivre : `createFeedback`, `MAX_PENDING_REQUESTS`, `GUILD_MAX_PENDING_INVITES`. *Manquent* : `/api/game-token`, `/api/solo-results`, connexions et salles du serveur de jeu, salle de présence.
- **Le client ne donne pas de temps.** En ligne, le serveur chronomètre ; en solo, `timeMs` vient du navigateur et n'est acceptable que parce que le solo ne compte pas pour l'Elo. Ne jamais faire entrer une donnée du solo dans un classement.
- **Chemins internes** : une regex qui accepte `/` puis n'importe quoi accepte aussi `//hote` (adresse d'un autre site). Toujours `^\/(?!\/)`, comme `?from=` de `/feedback`.
- **Messages Colyseus** : un type sans gestionnaire n'est ni limité ni ignoré en silence. Garder un `onMessage("*", () => {})` (comme `PresenceRoom`).
- **Variable d'environnement documentée = variable lue.** `WEB_ORIGIN` est présentée comme « origine autorisée » du serveur de jeu, mais aucun code ne la lit : rien ne filtre l'origine des WebSockets.
- **En-têtes HTTP** : le site n'envoie ni CSP ni `frame-ancestors`. Toute nouvelle page à action en un clic (accepter, quitter, exclure) est donc exposée au clickjacking tant que M5 n'est pas fait.

## Avant une mise en production

1. Secrets générés (`openssl rand -base64 32`), différents pour `BETTER_AUTH_SECRET` et `GAME_TOKEN_SECRET`, identiques entre Vercel et Railway pour `GAME_TOKEN_SECRET`.
2. Serveur de jeu lancé par son script `start` (qui fixe `NODE_ENV=production`, sans quoi la vérification du secret ne porte que sur sa présence).
3. `ADMIN_USER_IDS` : ids de comptes créés sur le site en ligne, jamais d'e-mails.
4. `AUTH_RATE_LIMIT_DISABLED` absent.
5. `pnpm audit --prod` : les alertes actuelles viennent d'outils de build et de test, à revoir à chaque mise à jour.
