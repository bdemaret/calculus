# Conformité légale (RGPD, LCEN)

Site édité depuis la France, gratuit, avec des comptes : **pas de CGV** (rien n'est vendu), mais mentions légales et politique de confidentialité **obligatoires**, CGU recommandées. Ce document n'est pas un avis juridique.

## Ce qui est en place

| Élément | Où |
| --- | --- |
| Mentions légales `/legal`, confidentialité `/privacy`, CGU `/terms` (FR + EN, la version française prévaut) | `LegalPage` + `messages/*.json` → `legal.<doc>.sections` (voir `web.md`) |
| Liens en pied de page sur toutes les pages | `components/Footer.tsx` |
| Case « J'accepte les CGU » à l'inscription | `SignupForm` (`AuthForms.tsx`), attribut `required` |
| Droit à l'effacement : suppression de compte depuis le profil | `user.deleteUser` (Better Auth) + `eraseUserGames` (db) |
| Droit de rectification : pseudo modifiable | profil |
| Coordonnées de l'éditeur | `LEGAL_PUBLISHER`, `LEGAL_CONTACT_EMAIL` (`.env`, à mettre aussi sur l'application Scalingo du site), date `LEGAL_UPDATED` dans `lib/legal.ts` |
| Cookies : seulement session (30 j) et cache de session (5 min) → exemptés de consentement, pas de bandeau | `lib/auth.ts` |

**Règle** : toute nouvelle donnée collectée, tout nouveau prestataire ou tout cookie non indispensable (mesure d'audience, publicité) impose de mettre à jour `legal.privacy` dans les deux langues et `LEGAL_UPDATED`. Un outil de mesure d'audience non exempté (Google Analytics…) imposerait en plus un bandeau de consentement.

## Données personnelles traitées (inventaire)

- `User` : pseudo, e-mail, mot de passe haché (`Account`), photo de profil (table `avatar`, visible par soi et ses amis via `/api/avatar/[id]`, effacée en cascade), préférences de dictée, d'affichage des divisions et de conseils en fin de partie (`showTips`). Un invité qui masque les conseils : `calculus:tips` dans son navigateur seulement.
- `Session` : **adresse IP et user-agent** (enregistrés par Better Auth), 30 jours.
- `RateLimit` : la clé contient l'**adresse IP** (compteurs du rate limit, production seulement).
- `Verification` : jetons de réinitialisation (1 h), liés à l'id du compte.
- Parties : `Game`, `GamePlayer` (pseudo au moment de la partie, y compris celui des **invités**), `Question`, `Answer` (nombre, opérateur ou expression saisis), `Rating`, `UserStats`. À la bombe, le calcul construit par un joueur est montré à un autre joueur et gardé avec son auteur (`Question.authorPlayerKey`) : il ne contient que des chiffres, des opérateurs et des parenthèses (validé par `parseExpression`), donc aucun texte libre à modérer. Couvert par « calculs posés, réponses » dans `legal.privacy`.
- Donjons : `DungeonRun`, `DungeonRunPlayer` (pseudo au moment de l'expédition, comptes seulement, score, vies, ennemis vaincus, réussite, temps moyen). À la suppression du compte, `userId` passe à null et `eraseUserGames` vide le pseudo ; l'expédition reste pour les coéquipiers. Couvert par « Tes parties » dans `legal.privacy`.
- Succès et titres : `UserAchievement`, `UserTitle`, `UserCounter`, `User.titleId`, déduits des parties, des amis et de la guilde, effacés en cascade. Succès et titre porté publics sur `/player/[id]`, le titre aussi au classement et dans les lobbys ; succès montrés aux joueurs de la partie en ligne qui les a débloqués (couvert par `legal.privacy`).
- Activité solo : `SoloPlay` (jeu, mode, niveau, heures de début, de dernier signal et de fin, manches jouées, compte s'il y en a un, sans IP), 90 jours, détachée du compte à sa suppression. Couvert par « Tes parties » dans `legal.privacy` ; pour un invité, rien ne permet de le relier à une personne.
- Calcul du jour : `DailyRun` (réponses, temps, compte s'il y en a un, jeton aléatoire ; essai d'invité sans pseudo ni IP, effacé à la clôture du jour, donc deux jours au plus). Score, pseudo et succès publics. Partent en cascade avec le compte. Le jeton de l'invité est dans `localStorage`, pas de cookie.
- Anti-bot : `User.bannedAt` / `banReason` et `BotReport` (jour, règles déclenchées, calculs, réponses et temps de l'essai signalé ; comptes seulement, jamais d'invité, effacé en cascade avec le compte). Le ban automatique est une décision automatisée : la politique (`legal.privacy`, « Lutte contre la triche ») l'annonce et renvoie à `/feedback` pour une relecture humaine, qui se fait dans `/admin/bans`.
- Retours : `Feedback` (message libre, page, langue, e-mail facultatif d'un invité ; détaché du compte à sa suppression). Lisibles par les administrateurs (`ADMIN_USER_IDS`), qui voient aussi pseudo, e-mail et statistiques de chaque compte dans le panel.
- Social : `Friendship` (recherche possible par e-mail, jamais affiché), `GameInvite` (10 min), guilde (`GuildMember` avec `lastSeenAt` = dernière activité, visible des membres comme « en ligne / hors ligne » ; `GuildInvite` ; blason `GuildCrest`, image libre envoyée par le chef, sans modération). La photo de profil est aussi visible des membres de la guilde.
- Navigateur seulement (`localStorage`) : thème, son, réglages.

Prestataires (sous-traitants) : Scalingo (site, serveur de jeu et base, société française, serveurs en France), Resend (e-mails, US), et le moteur de reconnaissance vocale du navigateur quand la dictée est activée (Google pour Chrome, Apple pour Safari…).

## Points relevés, pas encore traités

Classés du plus au moins important.

1. **Pas de purge des données expirées.** Les retours (`feedback`) sont annoncés « supprimés au plus tard un an après » dans la politique : la même tâche doit supprimer ceux de plus d'un an (aujourd'hui, à la main depuis le panel admin). Les sessions expirées (IP + user-agent), les lignes `rate_limit` (IP) et les jetons `verification` expirés restent en base indéfiniment : Better Auth ne les supprime pas lui-même. La politique annonce « 30 jours au plus » pour les sessions. À faire : une tâche planifiée (cron Scalingo ou serveur de jeu) qui supprime `session` où `expiresAt < now`, `verification` expirées, et `rate_limit` où `lastRequest` a plus de quelques heures.
2. **Consentement aux CGU vérifié côté client seulement.** L'API `/api/auth/sign-up/email` reste appelable sans la case. Acceptable (accepter les CGU = utiliser le site), mais pour une preuve d'acceptation il faudrait un champ `termsAcceptedAt` sur `User`, exigé par un `databaseHooks.user.create`.
3. **Pas d'export des données (droit à la portabilité).** Aujourd'hui, la politique renvoie à l'e-mail de contact. Une route `GET /api/me/export` (JSON : compte, parties, stats, amis) le rendrait automatique.
4. **Comptes inactifs conservés sans limite.** La CNIL recommande une durée maximale (souvent 2 à 3 ans d'inactivité, avec un e-mail de prévenance). La politique dit « tant que le compte existe » : c'est exact, mais une purge serait plus propre.
5. **Rapports de partie publics par lien** (`/report/[id]`, pas de contrôle d'accès) : pseudos, scores et réponses visibles par quiconque a l'identifiant. La politique le dit. Les identifiants (cuid) ne sont pas devinables, ce qui suffit pour l'instant.
6. **Pseudos d'invités** enregistrés dans les parties en ligne : non rattachés à un compte, donc impossibles à effacer sur demande sans chercher à la main (ils ne sont pas indexés).
7. **Hébergement en France** (Scalingo, osc-fr1) : pas de transfert hors UE pour l'hébergement. Reste hors UE : Resend (e-mails).
8. **Hébergeur indiqué dans les mentions légales** : Scalingo SAS et son siège y sont ; Scalingo ne publie pas de téléphone (seulement un e-mail de support), alors que la LCEN le demande ; la LCEN demande nom, adresse et téléphone de l'hébergeur. Compléter si besoin.
9. **Registre des traitements** (art. 30 RGPD) : document interne à tenir, même pour un petit site dont le traitement n'est pas occasionnel. Cet inventaire en est une bonne base.
10. **Mineurs** : âge minimum de 15 ans sans accord parental annoncé, mais rien n'est vérifié à l'inscription. Une case « J'ai 15 ans ou l'accord d'un parent » serait le minimum si le site vise les écoles.

## Suppression de compte : détails

- Le profil demande le mot de passe ; sans mot de passe, Better Auth accepte une session de moins d'un jour (`freshAge`).
- `beforeDelete` → `eraseUserGames` : parties solo supprimées, `displayName` vidé dans les parties en ligne et les donjons (le `playerKey` garde l'ancien id du compte, sans lien vers une personne une fois la ligne `user` supprimée). Le reste (sessions, comptes, Elo, stats, amis, invitations) part en cascade, `Game.hostId` passe à null.
- Testé en e2e dans `tests/auth/auth.spec.ts` (avec des parties posées en base par `seedGamesFor`).
