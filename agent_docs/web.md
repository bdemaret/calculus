# apps/web

Next.js 15 (App Router), React 19, Tailwind CSS 4, next-intl 4, Better Auth, `motion`, `recharts`, `colyseus.js`. Alias `@/*` → `apps/web/src/*`.

## Arborescence

```
src/
  middleware.ts              next-intl : préfixe /fr ou /en (exclut /api, /_next, fichiers)
  i18n/                      routing (locales fr, en ; défaut fr), navigation, request
  app/
    [locale]/                Toutes les pages : accueil, games (/modes y redirige), solo, online, lobby/[code],
                             report/[id], dashboard, leaderboard/[game]/[mode], player/[id], profile, friends, login, signup, forgot/reset-password,
                             legal, privacy, terms (textes légaux), feedback (retours),
                             admin/ (panel administrateur : vue d'ensemble, games, feedback, users/[id])
    api/auth/[...all]/       Handler Better Auth
    api/game-token/          Émet le JWT pour rejoindre un lobby
    api/solo-results/        Rejoue et enregistre une partie solo (connecté uniquement)
    api/friends/             GET liste, POST demande ({ handle } ou { userId }), PATCH accepter / DELETE retirer ({ userId })
    api/invites/             GET invitations reçues, POST inviter un ami ({ userId, code }), DELETE ignorer ({ id })
    api/feedback/            POST un retour ({ kind, message, contact?, page?, locale }), connecté ou invité
    api/admin/rooms/         GET parties en cours (relaie le serveur de jeu), admin seulement
    api/admin/feedback/      PATCH traité / rouvert ({ id, resolved }), DELETE ({ id }), admin seulement
    globals.css              Thème « cahier Seyès » (variables CSS)
  components/                Composants partagés (Keypad, OperatorPad, ExpressionBuilder / TileExpression, BombStage,
                             TimerBar, CalcLine, GameReportView…)
  lib/                       auth (serveur), auth-client, admin (serveur), colyseus, email, sound, storage, names, format,
                             answer (saisie → réponse selon le calcul, séparateur énoncé / solution)
messages/fr.json, en.json    Traductions
```

## Conventions

- **Pages** : composant serveur `page.tsx` (lit `params.locale`, appelle `setRequestLocale`, `generateMetadata` via `getTranslations`) qui rend un composant client `XxxClient.tsx` / `XxxView.tsx` marqué `"use client"`.
- **Navigation** : importer `Link`, `redirect`, `useRouter`, `usePathname` depuis `@/i18n/navigation`, jamais depuis `next/link` / `next/navigation`, pour garder le préfixe de langue.
- **Traductions** : aucun texte en dur dans l'UI. Toute nouvelle clé va dans **les deux** fichiers `messages/fr.json` et `messages/en.json`. Le français est la langue de référence (tutoiement, typographie française : `’`, espaces avant `: ; ! ?`, « guillemets »).
- **Auth** : `getSession()` de `@/lib/auth` côté serveur (fichier `server-only`) ; `@/lib/auth-client` côté navigateur.
  - Le pseudo est nettoyé et validé côté serveur (`databaseHooks` → `cleanName`, erreur `INVALID_NAME`) : l'API Better Auth est appelable sans passer par le formulaire.
  - Rate limit Better Auth stocké en base (`rateLimit.storage: "database"`, table `rate_limit`), actif en production seulement ; réponse 429 → `auth.tooManyRequests`. `AUTH_RATE_LIMIT_DISABLED=1` le coupe, réservé aux tests e2e.
  - En production : `BETTER_AUTH_URL` obligatoire (sinon erreur au démarrage), et sans `RESEND_API_KEY` le contenu des e-mails n'est jamais logué (il contient des liens de réinitialisation).
- **Routes API** : valider le corps avec Zod (`safeParse`), répondre `{ error: "code" }` avec le bon statut HTTP.
- **Accès base** : uniquement via `@calculus/db` (fonctions exportées ou `prisma`), jamais côté client.
- **Style** : réutiliser les variables CSS de `globals.css` (`--ink`, `--paper`, `--hl`, `--margin-red`, `--font-display`, `--font-hand`…) plutôt que des couleurs en dur. Polices : Bricolage Grotesque + Caveat (Google Fonts, chargées dans `[locale]/layout.tsx`).
- **Thème clair / sombre** : les jetons sombres de `globals.css` s'appliquent selon `prefers-color-scheme`, ou via `data-theme="light|dark"` sur `<html>` quand le joueur choisit avec le bouton de `HeaderTools` (stocké dans `localStorage` `calculus:theme`, posé avant le rendu par `themeInitScript` de `@/lib/theme`). Toute nouvelle couleur doit être un jeton défini dans **les deux** blocs sombres (media query et `:root[data-theme="dark"]`), jamais une couleur en dur.
- **Jeux à l'écran** : l'accueil et `/games` listent `GAME_IDS` (nom, règles, modes jouables) ; `/games` détaille aussi les modes et les niveaux.
- **Réglages** : `SettingsForm` propose d'abord le jeu (en solo, seulement les jeux `solo`) avec ses règles (`games.<id>.long`), puis les modes de ce jeu (explication du mode masquée pour un jeu à un seul mode, comme la bombe). `SoloGame` remplace un jeu réservé au en-ligne enregistré dans `localStorage` ; le lobby grise « Lancer » sous `minPlayers`.
- **Saisie** : `CalcLine` reçoit `puzzle` ; pour un nombre manquant, la case réponse prend la place du « ? » (l'énoncé complet reste dans `data-calc` de `calc-text`), et un opérateur se tape au clavier (`+ - * x / ÷`) ou sur `OperatorPad` en tactile. `answerFromInput` / `answerKindOfPuzzle` (`lib/answer.ts`) construisent la réponse envoyée. Au bon compte, `ExpressionBuilder` remplace `CalcLine` : cible, calculs intermédiaires posés (« = » ou Entrée : la ligne devient une étape et son résultat une nouvelle plaque, en pointillés), plaques à toucher, opérateurs permis, parenthèses, total partiel en direct ; ⌫ sur une ligne vide rouvre la dernière étape. `value` est la saisie en étapes (`readSteps`), `onSubmit(expr)` reçoit l'expression complète. OK quand toutes les plaques sont utilisées et que le total vaut la cible, ou, avec `allowClosest` (en ligne, simultané, à plusieurs), pour proposer un total approché (deux Entrées : poser, puis proposer) (les symboles tapés au clavier sont réécrits : `*` → `×`). `TileExpression` reste la saisie d'une bombe. En fin de manche et dans le rapport, on affiche `solution` après `revealSeparator(game)` : `=` (calcul standard), `→` (nombre manquant), `:` (bon compte). Le rapport cache les statistiques par opération des jeux sans `operationStats`.
- **La bombe** (`BombStage.tsx`, en ligne seulement) : `BombBuild` (tirage, règles, `TileExpression` avec la valeur de la bombe en direct et la raison d'un refus, puis « Ta bombe » et « n / m bombes prêtes »), `BombAssign` (qui désamorce quoi), `BombPairList` (spectateurs), `BombResults` (fin de manche). Le désamorçage utilise `CalcLine`. `LobbyState.bombAck` garde la réponse du serveur à l'envoi. Réglage « Temps pour construire sa bombe » ; le choix simultané / chacun son tour est masqué pour un jeu sans `turns`.
- **Réglages par jeu** : choisir un jeu applique ses réglages par défaut du niveau (`GAMES[g].defaults`) ; le curseur de temps suit `GAMES[game].timeRange` ; le bouton parenthèses est masqué au bon compte.
- **Tactile** : `useTouch` décide entre saisie clavier et `Keypad` à l'écran.
- **Amis** : page `/friends` (lien depuis le profil). « Inviter à une partie » crée un lobby avec les réglages en ligne habituels puis envoie l'invitation ; dans la salle d'attente, `InviteFriends` invite d'autres amis. `InviteNotice` (sous l'en-tête, connecté uniquement) interroge `/api/invites` toutes les 15 s et propose « Rejoindre ».
- **Lobbys publics** : `PublicLobbies` (colonne de droite de l'accueil, sous les deux grands choix en dessous de 1040 px) interroge `GET /lobbies` du serveur de jeu toutes les 3 s (`fetchPublicLobbies` de `@/lib/colyseus`) et lie chaque carte à `/lobby/<code>`. Dans `LobbyClient`, `snap.isPublic` remplace « Lancer » / « Je suis prêt » par le compte à rebours (`autoStartAt`), et en fin de partie propose « Trouver un autre lobby » (retour à l'accueil) au lieu de rejouer.
- **Joueurs connectés** : `OnlineCount` (dans le layout, en bas de la marge, collé pendant le défilement) lit `subscribeOnline` / `readOnline` de `@/lib/colyseus`, qui rejoint la salle de présence tant qu'un composant écoute et retente toutes les 15 s si le serveur de jeu est injoignable (rien n'est affiché alors). Le compte est par onglet, pas par personne. Les notes de page (`Margin`) vont dans `#margin-notes`, au-dessus.
- **Elo** : `GameReportView` reçoit `ratings` (snapshot du lobby ou `loadGameReport`) et affiche « Elo : avant → après » sous le verdict et dans le classement (`EloDelta`, vert / rouge), « placement n/5 » pendant le placement, puis l'Elo dévoilé à la 5e partie. Le tableau de bord montre la grille (jeu · mode) × difficulté et la variation de chaque partie récente.
- **Classement** : `/leaderboard` redirige vers `/leaderboard/<premier jeu>/<son premier mode>` ; `/leaderboard/<jeu>` ouvre son premier mode et l'ancienne adresse `/leaderboard/<mode>` mène au jeu `standard` (difficulté conservée). Onglets par jeu puis par mode (`.board-tabs`), difficulté et recherche dans l'URL (`?difficulty=1..5&q=pseudo`, validés par Zod, valeur invalide → défaut). Colonnes : place, joueur, Elo, parties, % de victoires. Page publique ; connecté, un bloc « Ta place » montre toujours sa ligne (place sur le nombre de classés, lien vers sa ligne `#board-me` s'il est dans le top), ou l'avancée de son placement.
- **Profil public** : `/player/[id]`, ouvert en cliquant un pseudo du classement. Ne montre que ce que le classement rend déjà public (pseudo, et pour chaque jeu × mode × difficulté classé : place, Elo, parties, % de victoires), via `getPlayerProfile`. Bouton d'ami selon le lien (`FriendshipState`) : ajouter (`POST { userId }`), annuler, accepter / refuser, ou « vous êtes amis » ; visiteur → lien de connexion.
- **Textes légaux** : `/legal` (mentions légales), `/privacy` (confidentialité), `/terms` (CGU), rendus par `LegalPage` depuis `legal.<doc>.sections` des messages (`t.raw` : paragraphes, ou tableaux = listes ; marqueurs `{publisher}` / `{contact}` remplis depuis `@/lib/legal`). Liens dans `Footer` et case obligatoire à l'inscription. Changer `LEGAL_UPDATED` à chaque modification de fond, et mettre la politique de confidentialité à jour à chaque nouvelle donnée collectée ou nouveau prestataire.
- **Suppression de compte** : `user.deleteUser` de Better Auth (mot de passe demandé dans le profil). `beforeDelete` appelle `eraseUserGames` (db) : parties solo supprimées, pseudo vidé dans les parties en ligne (`GameReportView` affiche alors `report.deletedPlayer`) ; le reste part en cascade.
- **Retours** : `/feedback` (bouton sur l'accueil et lien dans `Footer`, `?from=<chemin>&kind=bug|idea` facultatifs), ouvert aux invités. `POST /api/feedback` : Zod, champ piège `website` (doit rester vide), chemin interne seulement, limite horaire en base (`createFeedback` : 10 par compte, 60 pour l'ensemble des invités, aucune IP enregistrée). Les constantes partagées avec le formulaire client sont dans `@calculus/db/feedback` (sans Prisma).
- **Panel administrateur** : `/admin`, réservé aux comptes dont l'e-mail figure dans `ADMIN_EMAILS` (`isAdminEmail` / `getAdminSession` / `requireAdmin` de `@/lib/admin`). Pour les autres, les pages répondent 404 et les routes `api/admin/*` 403. **Chaque page appelle `requireAdmin()`** (le layout ne suffit pas : il n'est pas rejoué à chaque navigation). Lien « Admin » dans `Header` pour les administrateurs. Onglets : vue d'ensemble (inscrits, inscriptions par jour sur 30 jours, parties, retours à traiter), parties en cours (`LiveGames`, rafraîchi toutes les 5 s), retours (filtre à traiter / traités / tous, traiter, supprimer), comptes (recherche pseudo ou e-mail, fiche avec le `DashboardView` du joueur). Les e-mails ne sont pas vérifiés à l'inscription : créer le compte administrateur **avant** d'ajouter son adresse en production.
- **Parties en cours** : `fetchLiveRooms` signe un JWT d'une minute (`GAME_TOKEN_SECRET`, audience `calculus-admin`) et appelle `GET /admin/rooms` du serveur de jeu, à l'adresse HTTP déduite de `NEXT_PUBLIC_GAME_SERVER_URL` (`ws` → `http`, `wss` → `https`).
- **Dictée** : réglage de compte `User.voiceInput` (champ additionnel Better Auth, modifiable depuis le profil). `CalcLine` lance `useVoiceInput` (Web Speech API, pas de Firefox) qui remplit la case via `parseSpokenNumber` ; la validation reste à la touche Entrée (ou OK sur le pavé).

## Lancer / vérifier

- `pnpm dev` (racine) lance web + game-server ; le site seul : `pnpm --filter @calculus/web dev` (config `.claude/launch.json` : `web`, port 3000).
- Tester le multijoueur seul : une fenêtre normale + une fenêtre privée, créer un lobby dans l'une, rejoindre avec le code dans l'autre.
