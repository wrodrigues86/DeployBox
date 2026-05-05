#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="${1:-/var/www/nodepanel}"
TARGET_RELEASE="${2:-}"
APP_NAME="${APP_NAME:-nodepanel}"
CURRENT_LINK="$APP_ROOT/current"

if [ -z "$TARGET_RELEASE" ]; then
  TARGET_RELEASE="$(find "$APP_ROOT/releases" -mindepth 1 -maxdepth 1 -type d | sort | tail -n 2 | head -n 1)"
fi

if [ -z "$TARGET_RELEASE" ] || [ ! -d "$TARGET_RELEASE" ]; then
  echo "Release de rollback nao encontrada." >&2
  echo "Uso: scripts/rollback-release.sh /var/www/nodepanel /var/www/nodepanel/releases/20260430120000" >&2
  exit 1
fi

ln -sfn "$TARGET_RELEASE" "$CURRENT_LINK"

pm2 startOrReload "$CURRENT_LINK/ecosystem.config.cjs" --only "$APP_NAME" --update-env

pm2 save

echo "Rollback aplicado para: $TARGET_RELEASE"
