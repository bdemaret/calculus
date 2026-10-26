# Tests e2e (Playwright)

Paquet `apps/e2e` (`@calculus/e2e`). Lancer depuis la racine : `pnpm e2e` (ou `pnpm e2e:ui`). Première fois : `pnpm --filter @calculus/e2e e2e:install` pour télécharger Chromium et Firefox.

## Environnement isolé

- Playwright démarre lui-même le site sur **:3100** et le serveur de jeu sur **:2667** (`webServer` dans `playwright.config.ts`), donc `pnpm dev` peut rester ouvert à côté.
- Base dédiée `calculus_e2e` sur le Postgres Docker (port 5433) ; `E2E_DATABASE_URL` pour en changer. Le projet `setup` (`tests/global.setup.ts`) applique les migrations, vide la base, puis compile les pages une à une (en `next dev`, des compilations simultanées renvoient parfois des 500).
- Variables d'environnement et secrets de test : `env.ts` (jamais le `.env` de la racine). Le rate limit de Better Auth y est coupé (`AUTH_RATE_LIMIT_DISABLED`) : tous les tests s'inscrivent depuis la même IP.
- Next écrit dans `.next-e2e` (`NEXT_DIST_DIR`, lu par `apps/web/next.config.ts`). `next dev` réécrit alors `apps/web/next-env.d.ts` ; `global-teardown.ts` le remet comme avant.
- En CI (`CI=1`) : `next build` + `next start`, 2 workers, 2 relances.

## Projets

| Projet | Contenu |
| --- | --- |
| `setup` | Base et préchauffage |
| `chromium` | Tous les tests sauf `*.mobile.spec.ts` |
| `mobile` (Pixel 7, tactile) | `*.mobile.spec.ts` : pavé intégré |
| `firefox` | `tests/smoke/` seulement |

## Arborescence

```
env.ts                ports, base, secrets de test
fixtures/test.ts      `test` étendu : fixture `user` (compte neuf, navigateur connecté), signUp, newUser, presetSolo
fixtures/i18n.ts      t() / tr() : libellés lus dans apps/web/messages/*.json
fixtures/oracle.ts    lit le calcul affiché (data-testid="calc-text") et le résout avec evaluateText de game-core
fixtures/db.ts        lectures Prisma : jeton de réinitialisation, parties enregistrées
fixtures/bot.ts       Bot : faux joueur colyseus.js (jeton invité via /api/game-token), piloté par une politique par calcul
fixtures/online.ts    `test` pour le multijoueur : host(), guest() (navigateur isolé), bots(), botHost(), tout fermé à la fin
pages/answer.ts       answerRound(page, "right" | "wrong" | "timeout") : une manche, solo ou en ligne
pages/                SoloPage, LobbyPage (create, joinWithCode, open, slot, play, rankingRow…), AuthPages
tests/smoke|solo|auth|online
```

## Conventions

- **Sélecteurs** : `getByRole` / `getByLabel` avec les libellés de `t("clé")`, jamais de texte en dur. `data-testid` seulement là où il n'y a pas de rôle accessible (`calc-text`, `report-verdict`, `report-elo`, `elo-grid`, `lobby-slots`, `player-chips`).
- **Un compte neuf par test** (`newUser()` génère un e-mail unique) : pas d'état partagé, les tests tournent en parallèle.
- **Répondre juste** : `expectedAnswer(page)`, sans fuite côté serveur. Répondre faux : `réponse + 1`.
- **Parties courtes** : `presetSolo(page, {...})` pose les réglages dans `localStorage` avant le chargement (5 manches, niveau 1 par défaut).
- Pas de `networkidle` (le websocket de `next dev` reste ouvert) ni de `waitForTimeout` pour attendre un état : utiliser les `expect` web-first.
- Un test qui ne tourne que sur téléphone : suffixe `.mobile.spec.ts`.
- **Multijoueur** : un vrai navigateur par joueur dont on vérifie l'écran (`host`, `guest`), des bots pour les adversaires au comportement imposé (`bot.play(({ index }) => index === 1 ? "right" : "idle")`) ou pour remplir un lobby. Les bots répondent dès réception du calcul, sauf `delayMs` ; `typeFirst` envoie la saisie chiffre par chiffre (« chacun son tour »).
- Réglages en ligne : `preset(name, settings)` pose `calculus:name` et `calculus:online` ; `onlineSettings()` donne 5 manches de niveau 1.

## Couverture

Faits : smoke (fr/en, redirection, calcul de l'accueil, `/health`, aucune erreur JS sur les pages publiques, Firefox compris) ; solo (sans faute, erreur, temps écoulé, battle royale, quitter, réglages appliqués et gardés, dernière opération, niveau 5, partie connectée rejouée par le serveur et visible dans le tableau de bord, pavé tactile) ; comptes (inscription, déconnexion, connexion, mauvais mot de passe, e-mail pris, mot de passe oublié et réinitialisé, jeton invalide, pages protégées, pseudo, dictée) ; en ligne (créer et rejoindre par code ou par lien, pseudo demandé, compte connecté, code trop court, pseudo manquant, règles réservées à l'hôte et synchronisées, « prêt » remis à zéro, quitter, 12 joueurs ; course de vitesse simultanée et chacun son tour avec saisie visible ; battle royale : élimination, personne ne sort, spectateur ; rejouer la même partie ou changer les règles ; partie enregistrée et visible dans le tableau de bord ; partie à 12 ; Elo : placement caché entre deux comptes neufs, puis fin du placement contre un classé qui ne gagne rien) ; protections du serveur de jeu (création sans jeton refusée, lobby introuvable sans code, rafale de messages limitée) ; pseudo validé par l'API d'inscription et de profil ; amis (demande par e-mail et par pseudo, erreurs, acceptation, invitation reçue en bandeau puis lobby rejoint, page protégée).

À faire : robustesse et anti-triche (codes `JOIN_ERRORS`, hôte qui part, exclusion, reconnexion, snapshots sans réponse, `/api/solo-results` falsifié, rate limit de Better Auth), interface (changement de langue, thème, dictée simulée).
