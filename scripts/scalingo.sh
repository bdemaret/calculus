#!/usr/bin/env bash
# Déploiement Scalingo : deux applications (site, serveur de jeu) construites depuis ce même dépôt.
# Chacune choisit son rôle par la variable CALCULUS_SERVICE (`web` ou `game-server`).
#   build    : appelé par `scalingo-postbuild` (package.json), remplace le `build` de la racine,
#              qui construirait aussi le site sur l'application du serveur de jeu
#   start    : processus `web` du Procfile
#   migrate  : processus `postdeploy` du Procfile (Prisma verrouille : deux applications
#              qui migrent en même temps n'appliquent chaque migration qu'une fois)
set -euo pipefail

case "${CALCULUS_SERVICE:-}" in
  web | game-server) ;;
  *)
    echo "CALCULUS_SERVICE doit valoir « web » ou « game-server » (reçu : « ${CALCULUS_SERVICE:-} »)." >&2
    exit 1
    ;;
esac

case "${1:-}" in
  build)
    pnpm --filter @calculus/db generate
    if [ "${CALCULUS_SERVICE}" = web ]; then pnpm --filter @calculus/web build; fi
    ;;
  start)
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
