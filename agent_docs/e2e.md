# Tests e2e (Playwright)

Paquet `apps/e2e` (`@calculus/e2e`). Lancer depuis la racine : `pnpm e2e` (ou `pnpm e2e:ui`). Première fois : `pnpm --filter @calculus/e2e e2e:install` pour télécharger Chromium et Firefox.

## Environnement isolé

- Playwright démarre lui-même le site sur **:3100** et le serveur de jeu sur **:2667** (`webServer` dans `playwright.config.ts`), donc `pnpm dev` peut rester ouvert à côté. Pour lancer une deuxième suite en même temps (autre copie du dépôt) : `E2E_WEB_PORT`, `E2E_GAME_PORT` et `E2E_DATABASE_URL` (sinon `reuseExistingServer` réutiliserait les serveurs de l'autre copie).
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
fixtures/oracle.ts    lit le calcul affiché (data-calc de data-testid="calc-text") ; solveText donne la bonne réponse
                      (texte : nombre, symbole d'opérateur ou expression) et une fausse, y compris pour un
                      nombre manquant et le bon compte (solveur de game-core, opérations lues dans data-ops)
fixtures/db.ts        lectures Prisma : jeton de réinitialisation, parties enregistrées
fixtures/bot.ts       Bot : faux joueur colyseus.js (jeton invité via /api/game-token), piloté par une politique par calcul
                      (`acks` garde les réponses du serveur : answer-ack, answer-refused, bomb-ack) ;
                      à la bombe, envoie une bombe valide à chaque construction (`buildBombs(() => "idle" | expr)` pour changer)
fixtures/online.ts    `test` pour le multijoueur : host(), guest() (navigateur isolé), bots(), botHost(), tout fermé à la fin
pages/answer.ts       answerRound(page, "right" | "wrong" | "timeout") : une manche, solo ou en ligne, au clavier
                      ou au toucher (pavé numérique, pavé d'opérateurs, plaques du bon compte)
pages/                SoloPage, LobbyPage (create, joinWithCode, open, slot, play, rankingRow…), AuthPages
tests/smoke|solo|auth|online|friends|guild|leaderboard|learn
```

## Conventions

- **Sélecteurs** : `getByRole` / `getByLabel` avec les libellés de `t("clé")`, jamais de texte en dur. `data-testid` seulement là où il n'y a pas de rôle accessible (`calc-text`, `report-verdict`, `report-elo`, `elo-grid`, `lobby-slots`, `player-chips`, `bomb-rules`, `bomb-mine`, `bomb-assign`, `bomb-results`). `calc-text` porte l'énoncé complet dans `data-calc` (et les opérations permises dans `data-ops` au bon compte).
- **Un compte neuf par test** (`newUser()` génère un e-mail unique) : pas d'état partagé, les tests tournent en parallèle.
- **Répondre juste** : `expectedAnswer(page).answer`, sans fuite côté serveur. Répondre faux : `expectedAnswer(page).wrong` (une autre réponse de la même forme, toujours fausse : le jeu garantit l'unicité au nombre manquant ; au bon compte, une autre valeur atteinte avec les plaques).
- **Parties courtes** : `presetSolo(page, {...})` pose les réglages dans `localStorage` avant le chargement (5 manches, niveau 1 par défaut).
- Pas de `networkidle` (le websocket de `next dev` reste ouvert) ni de `waitForTimeout` pour attendre un état : utiliser les `expect` web-first.
- Un test qui ne tourne que sur téléphone : suffixe `.mobile.spec.ts`.
- **Bon compte** : `answerRound(page, "wrong")` ne valide pas à l'écran (Entrée pose l'expression comme étape) ; une expression fausse s'envoie par un bot, ou par deux Entrées en ligne à plusieurs (proposition « au plus proche »).
- **Multijoueur** : un vrai navigateur par joueur dont on vérifie l'écran (`host`, `guest`), des bots pour les adversaires au comportement imposé (`bot.play(({ index }) => index === 1 ? "right" : "idle")`) ou pour remplir un lobby. Les bots répondent dès réception du calcul, sauf `delayMs` ; `typeFirst` envoie la saisie chiffre par chiffre (« chacun son tour »).
- Réglages en ligne : `preset(name, settings)` pose `calculus:name` et `calculus:online` ; `onlineSettings()` donne 5 manches de niveau 1.

## Couverture

Faits : smoke (fr/en, redirection, calcul de l'accueil, `/health`, aucune erreur JS sur les pages publiques, Firefox compris ; page Jeux et ancienne page Modes, anciennes adresses du classement, 404 pour un mode que le jeu ne propose pas) ; solo (sans faute, erreur, temps écoulé, battle royale, quitter, réglages appliqués et gardés, dernière opération, niveau 5, partie connectée rejouée par le serveur et visible dans le tableau de bord, pavé tactile ; nombre manquant : case dans l'égalité et solution affichée, opérateur au clavier et au pavé tactile, réglages gardés, partie connectée rejouée avec les opérateurs saisis, bombe absente du solo ; bon compte : validation d'un calcul sans forcément toutes les plaques, plaque répétée refusée, étapes posées et rouvertes, opérations proposées, plaques au toucher, partie connectée rejouée avec les expressions saisies) ; comptes (inscription, déconnexion, connexion, mauvais mot de passe, e-mail pris, mot de passe oublié et réinitialisé, jeton invalide, pages protégées, pseudo, dictée) ; en ligne (créer et rejoindre par code ou par lien, pseudo demandé, compte connecté, code trop court, pseudo manquant, règles réservées à l'hôte et synchronisées, « prêt » remis à zéro, quitter, 12 joueurs ; course de vitesse simultanée et chacun son tour avec saisie visible ; nombre manquant en course de vitesse contre un bot, et en « chacun son tour » avec l'opérateur tapé visible ; bon compte en battle royale, expression fausse d'un bot éliminée ; bon compte au plus proche en course de vitesse ; bombe : lancement impossible seul, construction, attribution, désamorçage, élimination, point de l'auteur, enregistrement par destinataire, rapport rechargé depuis la base, bombe de secours et écran d'attente ; battle royale : élimination, personne ne sort, spectateur ; rejouer la même partie ou changer les règles ; partie enregistrée et visible dans le tableau de bord ; partie à 12 ; Elo : placement caché entre deux comptes neufs, puis fin du placement contre un classé qui ne gagne rien) ; lobbys publics (deux sur l'accueil, sans hôte, lancés dès qu'ils sont pleins puis remplacés ; jamais la bombe) ; protections du serveur de jeu (création sans jeton refusée, lobby introuvable sans code, rafale de messages limitée ; bombe : refus avec raison, réponse ignorée pendant la construction, une seule bombe, bombe d'un autre jamais envoyée) ; pseudo validé par l'API d'inscription et de profil ; amis (demande par e-mail et par pseudo, erreurs, acceptation, invitation reçue en bandeau puis lobby rejoint ; plusieurs invitations du même ami : trois bandeaux et le compte des autres, ignorer en fait remonter une, invitations retirées quand la partie démarre ou que le lobby ferme ; page protégée) ; guildes (fondation, invitation par e-mail d'un non-ami, pastille de l'en-tête, acceptation, droits du simple membre, deux membres en ligne, lobby de guilde reçu en bandeau puis rejoint, exclusion ; nom trop court, introuvable, déjà invité, nom pris quelle que soit la casse, dissolution au départ du dernier membre ; page protégée) ; classement (menu, onglets de jeu et de mode (la bombe : battle royale seulement), difficulté, top 100 trié, recherche hors du top avec la vraie place, bloc « Ta place » sans recherche avec parties et % de victoires, joueur en placement absent et avancée affichée ; clic sur un pseudo → profil public (place, Elo, sans e-mail), demande d'ami envoyée puis annulée, lien de connexion pour un visiteur ; données semées en base sur battle royale niveau 4, que les autres tests ne jouent pas). Techniques (`tests/learn`) : page `/learn` (une section par niveau, une carte par technique, lien vers l'entraînement) ; entraînement (calculs reconnus par `detectTechnique`, explication après une erreur, calcul suivant à la touche Entrée, réussite comptée, chrono écoulé, 404 pour une technique inconnue) ; conseils du rapport (une partie solo de 15 additions de niveau 1, où 41 % des calculs ont un conseil : le test recalcule les conseils attendus avec `detectTechnique`, puis vérifie leur nombre, le libellé, les étapes, les liens, le masquage par un invité retenu dans `localStorage` puis le réaffichage) ; « Désactiver l'aide » dans les préférences d'un compte retire les conseils du rapport.

À faire : robustesse et anti-triche (codes `JOIN_ERRORS`, hôte qui part, exclusion, reconnexion, snapshots sans réponse, `/api/solo-results` falsifié, rate limit de Better Auth), interface (changement de langue, thème, dictée simulée).
