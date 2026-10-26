# apps/web

Next.js 15 (App Router), React 19, Tailwind CSS 4, next-intl 4, Better Auth, `motion`, `recharts`, `colyseus.js`. Alias `@/*` → `apps/web/src/*`.

## Arborescence

```
src/
  middleware.ts              next-intl : préfixe /fr ou /en (exclut /api, /_next, fichiers)
  i18n/                      routing (locales fr, en ; défaut fr), navigation, request
  app/
    [locale]/                Toutes les pages : accueil, modes, solo, online, lobby/[code],
                             report/[id], dashboard, leaderboard/[mode], profile, friends, login, signup, forgot/reset-password,
                             legal, privacy, terms (textes légaux)
    api/auth/[...all]/       Handler Better Auth
    api/game-token/          Émet le JWT pour rejoindre un lobby
    api/solo-results/        Rejoue et enregistre une partie solo (connecté uniquement)
    api/friends/             GET liste, POST demande ({ handle }), PATCH accepter / DELETE retirer ({ userId })
    api/invites/             GET invitations reçues, POST inviter un ami ({ userId, code }), DELETE ignorer ({ id })
    globals.css              Thème « cahier Seyès » (variables CSS)
  components/                Composants partagés (Keypad, TimerBar, CalcLine, GameReportView…)
  lib/                       auth (serveur), auth-client, colyseus, email, sound, storage, names, format
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
- **Tactile** : `useTouch` décide entre saisie clavier et `Keypad` à l'écran.
- **Amis** : page `/friends` (lien depuis le profil). « Inviter à une partie » crée un lobby avec les réglages en ligne habituels puis envoie l'invitation ; dans la salle d'attente, `InviteFriends` invite d'autres amis. `InviteNotice` (sous l'en-tête, connecté uniquement) interroge `/api/invites` toutes les 15 s et propose « Rejoindre ».
- **Elo** : `GameReportView` reçoit `ratings` (snapshot du lobby ou `loadGameReport`) et affiche « Elo : avant → après » sous le verdict et dans le classement (`EloDelta`, vert / rouge), « placement n/5 » pendant le placement, puis l'Elo dévoilé à la 5e partie. Le tableau de bord montre la grille mode × difficulté et la variation de chaque partie récente.
- **Classement** : `/leaderboard` redirige vers `/leaderboard/<premier mode>`. Sous-menu par mode (onglets `.board-tabs`), difficulté et recherche dans l'URL (`?difficulty=1..5&q=pseudo`, validés par Zod, valeur invalide → défaut). Colonnes : place, joueur, Elo, parties, % de victoires. Page publique ; connecté, un bloc « Ta place » montre toujours sa ligne (place sur le nombre de classés, lien vers sa ligne `#board-me` s'il est dans le top), ou l'avancée de son placement.
- **Textes légaux** : `/legal` (mentions légales), `/privacy` (confidentialité), `/terms` (CGU), rendus par `LegalPage` depuis `legal.<doc>.sections` des messages (`t.raw` : paragraphes, ou tableaux = listes ; marqueurs `{publisher}` / `{contact}` remplis depuis `@/lib/legal`). Liens dans `Footer` et case obligatoire à l'inscription. Changer `LEGAL_UPDATED` à chaque modification de fond, et mettre la politique de confidentialité à jour à chaque nouvelle donnée collectée ou nouveau prestataire.
- **Suppression de compte** : `user.deleteUser` de Better Auth (mot de passe demandé dans le profil). `beforeDelete` appelle `eraseUserGames` (db) : parties solo supprimées, pseudo vidé dans les parties en ligne (`GameReportView` affiche alors `report.deletedPlayer`) ; le reste part en cascade.
- **Dictée** : réglage de compte `User.voiceInput` (champ additionnel Better Auth, modifiable depuis le profil). `CalcLine` lance `useVoiceInput` (Web Speech API, pas de Firefox) qui remplit la case via `parseSpokenNumber` ; la validation reste à la touche Entrée (ou OK sur le pavé).

## Lancer / vérifier

- `pnpm dev` (racine) lance web + game-server ; le site seul : `pnpm --filter @calculus/web dev` (config `.claude/launch.json` : `web`, port 3000).
- Tester le multijoueur seul : une fenêtre normale + une fenêtre privée, créer un lobby dans l'une, rejoindre avec le code dans l'autre.
