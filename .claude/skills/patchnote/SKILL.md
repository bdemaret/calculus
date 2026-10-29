---
name: patchnote
description: Rédige les notes de version de Calculus (fr + en) à partir des changements depuis la dernière version, choisit le nouveau numéro et l'ajoute au site (RELEASES + messages). À utiliser pour « faire le patchnote », « monter la version », « préparer une mise en prod ».
argument-hint: "[patch|minor|major|X.Y.Z] [précisions]"
---

# Patchnote et nouvelle version

Le numéro de version et les notes affichées sur `/changelog` (et dans le bandeau « nouvelle version ») viennent de :
- `apps/web/src/lib/releases.ts` : `RELEASES`, la plus récente en tête (= `APP_VERSION`) ;
- `apps/web/messages/fr.json` et `en.json` : `changelog.notes.v<X_Y_Z>` (liste de textes, `_` à la place des points).

Ne jamais modifier ces fichiers à la main pour une nouvelle version : passer par `release.mjs` (ce dossier), qui vérifie numéro, date et notes.

## 1. Repérer ce qui a changé

```bash
node .claude/skills/patchnote/release.mjs --current
```

Donne la version en ligne et sa date. Puis trouver le commit qui l'a ajoutée et lister ce qui suit :

```bash
git log -1 --format=%H -S'version: "<version en ligne>"' -- apps/web/src/lib/releases.ts
git log --no-merges --format='%h %ad %s' --date=short <ce commit>..HEAD
git status --short
```

Si la version en ligne n'a pas encore été committée (pas de résultat), prendre `git log --since=<sa date>` et écarter ce qui figure déjà dans ses notes. Inclure aussi les changements non committés seulement si l'utilisateur dit qu'ils partent dans cette version (le demander s'ils sont nombreux). Lire les diffs (`git show --stat`, puis le code) quand un message de commit ne suffit pas à comprendre l'effet pour le joueur.

## 2. Choisir le numéro

Si l'argument donne `patch`, `minor`, `major` ou un `X.Y.Z`, l'appliquer. Sinon, proposer :
- **patch** (1.1.0 → 1.1.1) : corrections seulement, rien de nouveau à découvrir ;
- **minor** (1.1.0 → 1.2.0) : au moins une fonctionnalité visible (jeu, mode, page, réglage, option) ;
- **major** : refonte ou changement qui casse les habitudes (Elo remis à zéro, comptes, règles d'un jeu).

Date : aujourd'hui (`AAAA-MM-JJ`), sauf indication contraire.

## 3. Rédiger les notes

Pour les joueurs, pas pour les développeurs :
- seulement ce qui se voit ou se ressent en jouant ; regrouper les petites corrections (« Corrections : … ») ; ignorer refactorisation, tests, CI, doc, hébergement, dépendances, sauf effet visible (site plus rapide, moins de coupures) ;
- 3 à 7 lignes, une phrase chacune, la plus importante en premier, commencer par la zone concernée (« Bon compte : … », « Sur mobile, … ») ;
- noms des jeux et modes tels qu'à l'écran : lire `games.<id>.name` et `modes` dans les messages (en anglais, le bon compte est « Right on target ») ;
- **français de référence** : tutoiement, typographie française (`’`, espace avant `: ; ! ?`, « guillemets ») ; **anglais** : même contenu, même ordre, même nombre de lignes, guillemets “…”, apostrophe `’` ;
- jamais de détail de sécurité exploitable (faille corrigée, limite, contournement) : écrire « Corrections de sécurité ».

Montrer les notes fr + en et le numéro à l'utilisateur et attendre son accord avant d'écrire (sauf s'il a demandé de tout faire d'un coup).

## 4. Écrire la version

Écrire les notes dans un fichier du scratchpad (pas dans le dépôt), au format `{ "fr": [...], "en": [...] }`, puis :

```bash
node .claude/skills/patchnote/release.mjs --version X.Y.Z --date AAAA-MM-JJ --notes <scratchpad>/notes.json
```

## 5. Vérifier

```bash
pnpm typecheck
pnpm e2e --project=chromium tests/changelog
```

Ouvrir `/fr/changelog` et `/en/changelog` (preview `web`) : la nouvelle version en tête, le pied de page en « vX.Y.Z ». Ne pas committer sans demande ; rappeler que le bandeau s'affichera 48 h après le build de la mise en prod, aux joueurs qui n'ont pas encore vu cette version.
