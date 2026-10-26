# apps/web

Next.js 15 (App Router), React 19, Tailwind CSS 4, next-intl 4, Better Auth, `motion`, `recharts`, `colyseus.js`. Alias `@/*` → `apps/web/src/*`.

## Arborescence

```
src/
  middleware.ts              next-intl : préfixe /fr ou /en (exclut /api, /_next, fichiers)
  i18n/                      routing (locales fr, en ; défaut fr), navigation, request
  app/
    [locale]/                Toutes les pages : accueil, modes, solo, online, lobby/[code],
                             report/[id], dashboard, profile, login, signup, forgot/reset-password
    api/auth/[...all]/       Handler Better Auth
    api/game-token/          Émet le JWT pour rejoindre un lobby
    api/solo-results/        Rejoue et enregistre une partie solo (connecté uniquement)
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
- **Routes API** : valider le corps avec Zod (`safeParse`), répondre `{ error: "code" }` avec le bon statut HTTP.
- **Accès base** : uniquement via `@calculus/db` (fonctions exportées ou `prisma`), jamais côté client.
- **Style** : réutiliser les variables CSS de `globals.css` (`--ink`, `--paper`, `--hl`, `--margin-red`, `--font-display`, `--font-hand`…) plutôt que des couleurs en dur. Polices : Bricolage Grotesque + Caveat (Google Fonts, chargées dans `[locale]/layout.tsx`).
- **Tactile** : `useTouch` décide entre saisie clavier et `Keypad` à l'écran.
- **Dictée** : réglage de compte `User.voiceInput` (champ additionnel Better Auth, modifiable depuis le profil). `CalcLine` lance `useVoiceInput` (Web Speech API, pas de Firefox) qui remplit la case via `parseSpokenNumber` ; la validation reste à la touche Entrée (ou OK sur le pavé).

## Lancer / vérifier

- `pnpm dev` (racine) lance web + game-server ; le site seul : `pnpm --filter @calculus/web dev` (config `.claude/launch.json` : `web`, port 3000).
- Tester le multijoueur seul : une fenêtre normale + une fenêtre privée, créer un lobby dans l'une, rejoindre avec le code dans l'autre.
