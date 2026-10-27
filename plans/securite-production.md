# Audit de sécurité avant la mise en production

Audit du 27 octobre 2026, fait en lisant le code (commit `5a63c988`). Rien n'a été testé contre un site déployé. Les points sont classés par criticité ; chacun indique le scénario d'attaque, puis la correction proposée.

Pas de faille critique exploitable sans erreur de configuration. Deux points hauts sont à régler **avant** la mise en ligne, les points moyens dans les semaines qui suivent.

**État au 27 octobre 2026** : H1, H2, M6.1 et B1 sont corrigés (marqués ✅). Le reste est à faire.

## Ce qui est déjà solide

- Autorité serveur en ligne : réponse jamais envoyée avant la fin de la manche, chronométrage à la réception, une réponse par calcul, rate limit par joueur, Zod sur chaque message, `maxPayload` de 4 Ko (défaut de `ws-transport`).
- Jetons de jeu : HS256 avec issuer / audience distincts pour le jeu et l'administration, 2 h ; `onAuth` statique (rien n'est créé sans jeton valide) ; lobbys publics protégés par une clé tirée au démarrage.
- Routes API : session vérifiée partout, Zod partout, contrôle d'accès dans les requêtes (`deleteMany({ where: { id, toId } })`, `leaderGuild`, `areFriends`), verrous `FOR UPDATE` sur les guildes.
- Images : taille bornée, type lu dans la signature (pas de SVG), `nosniff`, cache privé, visibles des seuls amis ou membres de guilde ; `user.image` limité à `/api/avatar/…`.
- Aucune requête SQL brute non paramétrée, aucun `dangerouslySetInnerHTML` sur des données utilisateur, aucun lien de réinitialisation dans les logs en production, rate limit Better Auth stocké en base.
- `/report/[id]` : identifiants UUID v4, non devinables.

---

## Haute : à corriger avant la mise en ligne

### H1. Les secrets d'exemple sont acceptés en production ✅

> Corrigé : `assertProductionSecrets` (`apps/web/src/lib/env.ts`, appelé en tête de `lib/auth.ts`) et `gameTokenSecretError` (`apps/game-server/src/env.ts`, appelé au démarrage) ; le script `start` du serveur de jeu fixe `NODE_ENV=production`.

**Où** : `apps/web/src/lib/auth.ts`, `apps/game-server/src/index.ts`, `.env.example`.

Better Auth ne refuse que *son propre* secret par défaut ; avec `BETTER_AUTH_SECRET="remplace-moi-par-une-longue-chaine-aleatoire"` (valeur publique, dans le dépôt), il démarre avec un simple avertissement. Le serveur de jeu vérifie seulement que `GAME_TOKEN_SECRET` n'est pas vide. Il suffit d'un copier-coller de `.env.example` sur Vercel ou Railway :

- `BETTER_AUTH_SECRET` connu → on peut signer soi-même les cookies de session et le cache de session (`cookieCache`, lu sans passer par la base) : connexion sous n'importe quel compte, y compris administrateur.
- `GAME_TOKEN_SECRET` connu → jeton de jeu avec `sub` = l'id de n'importe quel compte : on joue des parties classées sous son nom (et on fait varier son Elo), et on forge le jeton `calculus-admin` de `/admin/rooms`.

**Correction (30 min)** :
1. Une fonction `assertProductionSecret(name, value)` dans `apps/web/src/lib/env.ts` et `apps/game-server/src/env.ts` (pas dans game-core, qui ne lit pas l'environnement) qui, si `NODE_ENV === "production"`, lève une erreur au démarrage quand la valeur est vide, contient `remplace-moi`, ou fait moins de 32 caractères.
2. L'appeler pour `BETTER_AUTH_SECRET` et `GAME_TOKEN_SECRET` côté site, `GAME_TOKEN_SECRET` côté serveur de jeu ; refuser aussi `BETTER_AUTH_SECRET === GAME_TOKEN_SECRET`.
3. Le serveur de jeu ne fixe pas `NODE_ENV` (lancé par `tsx`) : ajouter `NODE_ENV=production` dans le script `start` ou dans les variables Railway, et l'écrire dans le README.

### H2. Le rôle administrateur repose sur une adresse e-mail non vérifiée ✅

> Corrigé : `ADMIN_USER_IDS` et `isAdminUser(id)` remplacent `ADMIN_EMAILS` et `isAdminEmail` (`lib/admin.ts`, `Header`, liste des comptes du panel).

**Où** : `apps/web/src/lib/admin.ts` (`isAdminEmail`), `ADMIN_EMAILS`.

Les e-mails ne sont jamais vérifiés à l'inscription. Quiconque crée un compte avec une adresse de `ADMIN_EMAILS` devient administrateur. La doc demande de créer le compte *avant* de renseigner l'adresse, mais la faille revient dès que :
- l'adresse est renseignée avant la création du compte, ou contient une faute de frappe ;
- l'administrateur supprime son compte (bouton du profil) sans retirer son adresse ;
- une deuxième adresse est ajoutée pour une personne qui n'a pas encore de compte.

L'administrateur voit tous les e-mails, pseudos et statistiques des joueurs, et peut supprimer les retours : c'est une fuite de données personnelles (RGPD) en plus d'une élévation de privilège.

**Correction (1 h)** : remplacer `ADMIN_EMAILS` par `ADMIN_USER_IDS` (ids de compte, immuables et jamais réattribués). `isAdminEmail(email)` devient `isAdminUser(id)` ; mettre à jour `Header`, `getAdminSession`, `.env.example`, `turbo.json`, `architecture.md`, `web.md`, `legal.md` et les tests e2e admin. Variante si l'on tient aux e-mails : exiger `session.user.emailVerified`, ce qui suppose d'ajouter la vérification d'e-mail à l'inscription (voir M6).

---

## Moyenne : à corriger rapidement après la mise en ligne

### M1. Serveur de jeu sans limite de connexions ni de salles (déni de service)

**Où** : `apps/game-server/src/index.ts`, `GameRoom.ts`, `PresenceRoom.ts`, `apps/web/src/app/api/game-token/route.ts`.

- `POST /api/game-token` donne un jeton invité à n'importe qui, sans limite.
- Chaque connexion peut créer sa propre salle (`create("game")`) ; rien ne borne le nombre de salles ni de connexions par adresse IP.
- La salle de présence s'ouvre sans jeton, 5 000 clients par salle, puis Colyseus en ouvre une autre, sans fin.

Un script de quelques lignes ouvre des dizaines de milliers de WebSockets et de salles sur l'unique instance Railway jusqu'à épuiser sa mémoire : plus personne ne joue. Il n'y a pas de protection de ce type devant Railway par défaut.

**Correction (demi-journée)** :
1. Compteur de connexions par IP sur le serveur HTTP (événement `upgrade`, ou option `verifyClient` de `WebSocketTransport`), avec l'IP lue dans `x-forwarded-for` (fournie par Railway), par ex. 20 connexions simultanées par IP.
2. Plafond global de salles : refuser dans `GameRoom.onAuth` (code `JOIN_ERRORS` dédié) au-delà de `MAX_ROOMS` (par ex. 2 000) quand `options` demande une création.
3. Rate limit de `POST /api/game-token` par IP, avec la table `rate_limit` déjà en base (même principe que Better Auth), par ex. 30 jetons par minute.
4. `this.onMessage("*", () => {})` dans `GameRoom` : un type de message inconnu ne passe aujourd'hui ni par le rate limit ni par un gestionnaire, et Colyseus le logue à chaque fois (logs inondables).

### M2. Graine des parties en ligne prévisible

**Où** : `packages/game-core/src/rng.ts` (`randomSeed`), `GameRoom.startGame`, `generateCode`.

La graine d'une partie en ligne vaut `Math.random()` (8 caractères) + `Date.now()`. `Math.random` de V8 (xorshift128+) n'est pas cryptographique : son état se retrouve à partir de sorties observées avec des outils publics (solveurs SMT). Or le serveur expose beaucoup de sorties du même générateur : chaque code de salle (6 tirages), et un attaquant peut créer autant de salles qu'il veut avec des jetons invités. Il recrée donc l'état, crée un lobby, le lance aussitôt, prédit la graine (l'heure est donnée par `serverNow`) et connaît tous les calculs de la partie : il gagne chaque partie classée qu'il héberge. L'attaque est technique mais à la portée d'un joueur motivé par le classement.

**Correction (1 h)** : côté serveur seulement, tirer la graine avec `randomBytes(16).toString("base64url")` et le code de salle avec `randomInt` de `node:crypto`. Garder `randomSeed()` de game-core pour le solo et les lobbys publics côté navigateur, ou le faire reposer sur `crypto.getRandomValues` (disponible dans le navigateur et dans Node ≥ 20).

### M3. Elo manipulable avec plusieurs comptes

**Où** : `packages/db/src/index.ts` (`saveGame`), inscription.

Créer un compte ne demande qu'une adresse (non vérifiée) ; le rate limit de Better Auth ralentit sans empêcher. Toute partie en ligne entre deux comptes est classée, y compris dans un lobby privé. On ouvre deux onglets avec deux comptes, on perd volontairement avec l'un : l'autre monte au classement, sans limite.

**Correction (par étapes)** :
1. Vérification d'e-mail obligatoire avant la première partie classée (voir M6).
2. Ne classer une partie que si au moins deux comptes **différents par IP** y ont participé (l'IP est connue du serveur de jeu ; ne pas la stocker), ou ne classer que les lobbys publics.
3. Plafonner l'Elo gagné contre un même adversaire sur 24 h.

### M4. Enregistrement des parties solo sans limite

**Où** : `apps/web/src/app/api/solo-results/route.ts`.

Un compte peut appeler la route en boucle : chaque appel écrit une partie, jusqu'à 200 calculs et 200 réponses. Cela fait grossir la base Neon (quota, coût) et ralentit `getDashboard`. Le temps de réponse est aussi déclaré par le client (`timeMs`) : les statistiques personnelles (meilleure série, temps moyen, précision visible des amis) sont falsifiables. Ce n'est pas grave, car le solo ne compte pas pour l'Elo.

Un `startedAt` hors limites (`1e20`) donne une `Invalid Date` et une erreur 500.

**Correction (1 h)** :
1. Limite par compte (par ex. 60 parties solo par heure), comptée en base comme `createFeedback`.
2. Borner `startedAt` (entre maintenant − 3 h et maintenant), et vérifier que la somme des `timeMs` tient entre `startedAt` et l'heure de réception.

### M5. Pas d'en-têtes de sécurité HTTP

**Où** : `apps/web/next.config.ts`.

Ni `Content-Security-Policy`, ni `X-Frame-Options` / `frame-ancestors`, ni `Referrer-Policy`, ni `Permissions-Policy`. Le site peut être affiché dans une iframe d'un autre site : on fait cliquer un joueur à son insu (clickjacking : accepter une demande d'ami, quitter sa guilde, nommer un autre chef…). Sans CSP, une XSS future n'aurait aucun garde-fou.

**Correction (1 h)** : `headers()` dans `next.config.ts` :
- `X-Frame-Options: DENY` et `Content-Security-Policy: frame-ancestors 'none'` ;
- `Referrer-Policy: strict-origin-when-cross-origin` ;
- `Permissions-Policy: camera=(), geolocation=(), microphone=(self)` (la dictée utilise le micro) ;
- une CSP avec `connect-src 'self' <NEXT_PUBLIC_GAME_SERVER_URL>` et `font-src` / `style-src` pour Google Fonts (ou rien si on passe à `next/font`). Le script de thème en ligne demande un nonce ou un hash : à tester en mode rapport (`Content-Security-Policy-Report-Only`) avant de l'imposer.

### M6. Comptes : e-mail non vérifié, sessions gardées après une réinitialisation

**Où** : `apps/web/src/lib/auth.ts`.

- Sans vérification, on peut s'inscrire avec l'adresse d'autrui : le vrai titulaire ne peut plus s'inscrire (il récupère le compte par « mot de passe oublié », mais ne le sait pas forcément). C'est aussi la base de H2 et M3.
- `revokeSessionsOnPasswordReset` n'est pas activé : après un « mot de passe oublié » consécutif à un vol de compte, les sessions de l'attaquant restent valables 30 jours.

**Correction** :
1. ✅ `emailAndPassword.revokeSessionsOnPasswordReset: true`.
2. `emailVerification` de Better Auth (`sendVerificationEmail` via Resend, `requireEmailVerification: true` ou au moins exigé pour les parties classées et le panel admin). Mettre à jour `legal.privacy` si de nouvelles données sont gardées.

---

## Basse : durcissement

| # | Point | Scénario | Correction |
| --- | --- | --- | --- |
| B1 ✅ | `?from=` de `/feedback` accepte `//…` (`/^\/[\w\-/]{0,199}$/`) | `?from=//3627732462` (adresse IP en décimal) : le bouton « Retour » après l'envoi mène hors du site (redirection ouverte, un clic de plus) | Regex `^\/(?!\/)[\w\-/]{0,199}$` dans `feedback/page.tsx` et `api/feedback/route.ts` |
| B2 | `user.image` accepte `/api/avatar/<id d'un autre>` (`AVATAR_URL` dans `auth.ts`) | Par l'API Better Auth, A affiche la photo de B (usurpation visible des amis communs) | Exiger que l'id de l'adresse soit celui de la session (contexte de requête passé en second argument du hook `update.before`) |
| B3 | `cleanName` garde les caractères invisibles et de sens d'écriture (U+200B, U+202E…) | Pseudos visuellement identiques à un autre joueur dans le classement et les lobbys | Retirer `\p{Cf}` et normaliser en NFC ; faire de même dans `cleanGuildName` |
| B4 | Énumération des comptes par e-mail (`/api/friends`, `/api/guild/invites` : `not-found` / `sent`) | Savoir si une adresse est inscrite (l'inscription le dit aussi) | Accepter : c'est le comportement habituel ; sinon répondre `sent` dans tous les cas pour les e-mails |
| B5 | `pnpm audit --prod` : 14 alertes (2 critiques, 6 hautes) | Toutes viennent d'outils de build ou de test (`vitest`/`tinypool` tirés par `better-auth`, `postcss` de Next, `deepmerge-ts` de Prisma) ou de `nanoid` dans Colyseus avec des tailles fixes : aucune n'est atteignable à l'exécution | `pnpm update` régulier, `pnpm.overrides` pour `postcss` et `nanoid`, `pnpm audit` en CI |
| B6 | `docker-compose.yml` publie Postgres sur `0.0.0.0:5433` avec le mot de passe `calculus` | En développement sur un réseau public, la base locale est joignable | `"127.0.0.1:5433:5432"` |
| B7 | `WEB_ORIGIN` est documenté comme « origine autorisée » mais n'est lu nulle part | Fausse impression de protection : le serveur de jeu accepte les WebSockets et le matchmaking de n'importe quelle origine (sans gravité, l'accès passe par le jeton) | Le lire pour filtrer `Origin` à l'`upgrade` (avec M1), ou le retirer de la doc et de `.env.example` |
| B8 | Codes de salle à `Math.random` (32⁶ ≈ 10⁹), `joinById` sans limite | Deviner un code de lobby privé par force brute : environ 10⁷ essais par salle ouverte | Réglé par M1 (limite par IP) et M2 (`randomInt`) |
| B9 | Rate limit des retours invités global (60 par heure pour tous les invités) | Un robot qui contourne le champ piège bloque les retours de tous les invités pendant une heure | Limite par IP (même table que M1.3) |

## Ordre conseillé

1. ✅ Avant la mise en ligne : H1, H2, M6.1, B1.
2. Première semaine : M1, M2, M5.
3. Ensuite : M4, M6.2 puis M3, et les autres points bas.
