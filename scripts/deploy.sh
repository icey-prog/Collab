#!/usr/bin/env bash
# Collab MVP — Déploiement one-shot.
#
# Usage :
#   ./scripts/deploy.sh           # déploie back + front
#   ./scripts/deploy.sh back      # back seulement
#   ./scripts/deploy.sh front     # front seulement
#
# Prérequis (à installer 1 fois) :
#   - fly CLI       : https://fly.io/docs/flyctl/install/
#   - vercel CLI    : npm i -g vercel
#   - fly auth login + vercel login

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET="${1:-all}"

BACK_URL="https://collab-talk.fly.dev"

deploy_back() {
  echo "▶ Backend Fly.io — $ROOT/apps/backend"
  cd "$ROOT/apps/backend"

  if ! command -v fly >/dev/null 2>&1; then
    echo "✗ flyctl introuvable. Installer : https://fly.io/docs/flyctl/install/"
    exit 1
  fi

  # Premier déploiement : fly launch (interactif). Détecte par présence machine.
  if ! fly status -a collab-talk >/dev/null 2>&1; then
    echo "ℹ App pas encore créée, lancement de fly launch (interactif)…"
    fly launch --name collab-talk --region cdg --no-deploy --copy-config --yes
  fi

  echo "▶ fly deploy…"
  fly deploy

  echo "▶ Health check $BACK_URL/…"
  sleep 5
  curl -fsS "$BACK_URL/" || { echo "✗ Backend ne répond pas"; exit 1; }
  echo "✓ Backend OK : $BACK_URL"
}

deploy_front() {
  echo "▶ Frontend Vercel — $ROOT/apps/frontend"
  cd "$ROOT/apps/frontend"

  if ! command -v vercel >/dev/null 2>&1; then
    echo "✗ vercel CLI introuvable. Installer : npm i -g vercel"
    exit 1
  fi

  echo "▶ Build local (sanity check)…"
  npm run build

  echo "▶ vercel deploy (prod)…"
  vercel --prod --yes

  echo "✓ Frontend déployé. Pense à set FRONT_ORIGIN sur Fly :"
  echo "    fly secrets set FRONT_ORIGIN=https://<URL_VERCEL> -a collab-talk"
}

case "$TARGET" in
  back)  deploy_back ;;
  front) deploy_front ;;
  all)   deploy_back; deploy_front ;;
  *)     echo "Usage : $0 [back|front|all]"; exit 1 ;;
esac

echo ""
echo "════════════════════════════════════════"
echo " Déploiement terminé."
echo " Front : https://collab-talk.vercel.app"
echo " Back  : $BACK_URL"
echo "════════════════════════════════════════"
