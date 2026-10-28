# Sécurité : pièges à ne pas reproduire

Relevés lors de l'audit du 27 octobre 2026. Le détail des corrections, classées par criticité, est dans `plans/securite-production.md` ; retirer une ligne d'ici quand le point est corrigé partout.

## Règles

- **Aléa côté serveur = `node:crypto`.** Une graine de partie, un code de salle, un jeton : `randomBytes` / `randomInt` / `randomUUID`, jamais `Math.random()`. Son état se retrouve à partir des valeurs qu'il a produites (codes de salle affichés), donc la graine d'une partie en ligne deviendrait prévisible et tous ses calculs avec. `randomSeed()` de game-core (`rng.ts`) repose sur `Math.random` : il convient au solo, jamais au serveur.
- **Un secret d'exemple ne doit jamais démarrer en production.** Better Auth ne refuse que son propre secret par défaut, pas `remplace-moi-…` de `.env.example`. Les secrets actuels sont vérifiés au démarrage (`assertProductionSecrets` dans `apps/web/src/lib/env.ts`, `gameTokenSecretError` dans `apps/game-server/src/env.ts`) : tout nouveau secret doit y être ajouté.
- **Pas de droit accordé sur une adresse e-mail non vérifiée.** Les e-mails ne sont pas vérifiés à l'inscription : n'importe qui peut prendre une adresse qui n'a pas encore de compte (ou plus de compte). Les administrateurs sont donc désignés par id (`ADMIN_USER_IDS`) ; faire de même pour tout rôle ou accès futur.
- **Toute ressource créable par un inconnu a une limite.** Jeton invité, salle, connexion WebSocket, partie solo, retour : chacun doit être borné par compte ou par IP, sinon une boucle remplit la mémoire du serveur de jeu ou la base. Exemples à suivre : `createFeedback`, `MAX_PENDING_REQUESTS`, `GUILD_MAX_PENDING_INVITES`, `rateLimited` (`apps/web/src/lib/rateLimit.ts`, compteur en base, partagé entre instances et redémarrages), `limits.ts` du serveur de jeu (connexions par IP, matchmaking par IP, plafonds de salles et de présence). Toute nouvelle salle Colyseus appelle `checkMatchmake` dans son `onAuth` statique.
- **Le client ne donne pas de temps.** En ligne, le serveur chronomètre ; en solo, `timeMs` vient du navigateur et n'est acceptable que parce que le solo ne compte pas pour l'Elo. Ne jamais faire entrer une donnée du solo dans un classement.
- **Chemins internes** : une regex qui accepte `/` puis n'importe quoi accepte aussi `//hote` (adresse d'un autre site). Toujours `^\/(?!\/)`, comme `?from=` de `/feedback`.
- **Messages Colyseus** : un type sans gestionnaire n'est ni limité ni ignoré en silence. Garder un `onMessage("*", () => {})` dans chaque salle (`GameRoom`, `PresenceRoom`).
- **Variable d'environnement documentée = variable lue.** Ne jamais décrire une protection qu'aucun code n'applique (c'était le cas de `WEB_ORIGIN` jusqu'au 28 octobre 2026).
- **Adresse IP derrière un proxy** : `x-real-ip` puis le premier élément de `x-forwarded-for`. Sur Scalingo, vérifier après le premier déploiement que les journaux montrent des IP différentes (sinon tous les joueurs partagent un compteur).
- **CSP** : `script-src` garde `'unsafe-inline'` (script de thème, amorçage de Next) ; ne pas ajouter d'autre script en ligne ni d'origine externe sans mettre à jour `next.config.ts`.

## Avant une mise en production

1. Variables de `README.md` (« Mettre en ligne ») posées sur l'application Scalingo, dont `DIRECT_URL` à côté de `DATABASE_URL` (et `WEB_ORIGIN` si le serveur de jeu tourne dans une application séparée).
2. Secrets générés (`openssl rand -base64 32`), différents pour `BETTER_AUTH_SECRET` et `GAME_TOKEN_SECRET`, identiques entre le site et le serveur de jeu pour `GAME_TOKEN_SECRET`.
3. Serveur de jeu lancé par son script `start` (qui fixe `NODE_ENV=production`, sans quoi la vérification du secret ne porte que sur sa présence).
4. `ADMIN_USER_IDS` : ids de comptes créés sur le site en ligne, jamais d'e-mails.
5. `AUTH_RATE_LIMIT_DISABLED` absent.
6. `pnpm audit --prod` : les alertes actuelles viennent d'outils de build et de test, à revoir à chaque mise à jour.
