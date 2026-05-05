#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="${1:-/var/www/nodepanel}"
APP_NAME="${APP_NAME:-nodepanel}"
HEALTH_URL="${HEALTH_URL:-}"
SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RELEASE_ID="$(date +%Y%m%d%H%M%S)"
RELEASE_DIR="$APP_ROOT/releases/$RELEASE_ID"
SHARED_DIR="$APP_ROOT/shared"
CURRENT_LINK="$APP_ROOT/current"

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Comando obrigatorio nao encontrado: $1" >&2
    exit 1
  }
}

require_cmd node
require_cmd npm
require_cmd rsync
require_cmd pm2

mkdir -p "$APP_ROOT/releases" "$SHARED_DIR/server"

echo "Criando release $RELEASE_ID em $RELEASE_DIR"
mkdir -p "$RELEASE_DIR"

rsync -a --delete \
  --exclude '.git/' \
  --exclude '.release/' \
  --exclude 'node_modules/' \
  --exclude 'client/node_modules/' \
  --exclude 'server/node_modules/' \
  --exclude 'client/dist/' \
  --exclude 'server/database.db*' \
  --exclude 'server/projects/' \
  --exclude 'server/translations/' \
  --exclude '*.zip' \
  "$SOURCE_DIR/" "$RELEASE_DIR/"

if [ ! -f "$SHARED_DIR/server/.env" ]; then
  if [ -f "$SOURCE_DIR/server/.env" ]; then
    cp "$SOURCE_DIR/server/.env" "$SHARED_DIR/server/.env"
  else
    touch "$SHARED_DIR/server/.env"
  fi
fi

for item in database.db database.db-shm database.db-wal; do
  if [ ! -e "$SHARED_DIR/server/$item" ] && [ -e "$SOURCE_DIR/server/$item" ]; then
    cp "$SOURCE_DIR/server/$item" "$SHARED_DIR/server/$item"
  fi
done

if [ ! -e "$SHARED_DIR/server/projects" ]; then
  if [ -d "$SOURCE_DIR/server/projects" ]; then
    cp -a "$SOURCE_DIR/server/projects" "$SHARED_DIR/server/projects"
  else
    mkdir -p "$SHARED_DIR/server/projects"
  fi
fi

if [ ! -e "$SHARED_DIR/server/translations" ]; then
  if [ -d "$SOURCE_DIR/server/translations" ]; then
    cp -a "$SOURCE_DIR/server/translations" "$SHARED_DIR/server/translations"
  else
    mkdir -p "$SHARED_DIR/server/translations"
  fi
fi

ln -sfn "$SHARED_DIR/server/.env" "$RELEASE_DIR/server/.env"
ln -sfn "$SHARED_DIR/server/database.db" "$RELEASE_DIR/server/database.db"
ln -sfn "$SHARED_DIR/server/database.db-shm" "$RELEASE_DIR/server/database.db-shm"
ln -sfn "$SHARED_DIR/server/database.db-wal" "$RELEASE_DIR/server/database.db-wal"
ln -sfn "$SHARED_DIR/server/projects" "$RELEASE_DIR/server/projects"
ln -sfn "$SHARED_DIR/server/translations" "$RELEASE_DIR/server/translations"

cd "$RELEASE_DIR"

echo "Instalando dependencias"
npm ci

echo "Validando backend"
node --check server/src/index.js

echo "Gerando build do frontend"
npm run build

PREVIOUS_TARGET=""
if [ -L "$CURRENT_LINK" ]; then
  PREVIOUS_TARGET="$(readlink "$CURRENT_LINK")"
fi

ln -sfn "$RELEASE_DIR" "$CURRENT_LINK"

echo "Reiniciando processo PM2"
pm2 startOrReload "$CURRENT_LINK/ecosystem.config.cjs" --only "$APP_NAME" --update-env

if [ -n "$HEALTH_URL" ]; then
  require_cmd curl
  echo "Validando saude em $HEALTH_URL"
  if ! curl -fsS --retry 5 --retry-delay 2 "$HEALTH_URL" >/dev/null; then
    echo "Health check falhou." >&2
    if [ -n "$PREVIOUS_TARGET" ] && [ -d "$PREVIOUS_TARGET" ]; then
      echo "Voltando para release anterior: $PREVIOUS_TARGET" >&2
      ln -sfn "$PREVIOUS_TARGET" "$CURRENT_LINK"
      pm2 startOrReload "$CURRENT_LINK/ecosystem.config.cjs" --only "$APP_NAME" --update-env
    fi
    exit 1
  fi
fi

pm2 save

echo "Release ativa: $RELEASE_DIR"
if [ -n "$PREVIOUS_TARGET" ]; then
  echo "Release anterior: $PREVIOUS_TARGET"
fi
