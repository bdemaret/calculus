#!/usr/bin/env bash
# Déploiement Scalingo, rôle choisi par la variable CALCULUS_SERVICE :
#   all          site et serveur de jeu dans un seul processus (`apps/web/server.ts`), une seule application
#   web          le site seul, game-server : le serveur de jeu seul (deux applications depuis ce même dépôt)
#   build    : appelé par `scalingo-postbuild` (package.json), remplace le `build` de la racine,
#              qui construirait aussi le site sur une application qui n'en a pas besoin
#   start    : processus `web` du Procfile
#   migrate  : processus `postdeploy` du Procfile (Prisma verrouille : deux applications
#              qui migrent en même temps n'appliquent chaque migration qu'une fois)
set -euo pipefail

case "${CALCULUS_SERVICE:-}" in
  all | web | game-server) ;;
  *)
    echo "CALCULUS_SERVICE doit valoir « all », « web » ou « game-server » (reçu : « ${CALCULUS_SERVICE:-} »)." >&2
    exit 1
    ;;
esac

case "${1:-}" in
  build)
    # Diagnostic : le plugin next-intl charge le binaire natif de @swc/core en lisant next.config.ts.
    # Un premier build chez Scalingo a échoué là (« Failed to load native binding ») sans dire pourquoi :
    # on affiche les binaires installés et la cause exacte, sans jamais faire échouer le build ici.
    echo "Binaires SWC installés :"
    ls node_modules/.pnpm | grep -E '^@(swc|next)\+(core|swc)' || echo "  (aucun)"
    (cd apps/web && node -e '
      const { createRequire } = require("node:module");
      try {
        createRequire(require.resolve("next-intl/plugin"))("@swc/core");
        console.log("@swc/core : binaire natif chargé");
      } catch (e) {
        console.log("@swc/core : " + e.message);
        for (const c of e.cause ?? []) console.log("  - " + String(c?.message ?? c).split("\n")[0]);
      }
    ') || true
    pnpm --filter @calculus/db generate
    if [ "${CALCULUS_SERVICE}" != game-server ]; then pnpm --filter @calculus/web build; fi
    ;;
  start)
    if [ "${CALCULUS_SERVICE}" = all ]; then exec pnpm --filter @calculus/web start:combined; fi
    exec pnpm --filter "@calculus/${CALCULUS_SERVICE}" start
    ;;
  migrate)
    exec pnpm --filter @calculus/db migrate:deploy
    ;;
  *)
    echo "Usage : scripts/scalingo.sh build|start|migrate" >&2
    exit 1
    ;;
esac
