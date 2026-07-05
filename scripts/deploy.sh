#!/usr/bin/env bash
# Build locally, rsync dist/ to the LAN LXC, run Playwright against the deployed URL.
# Prereqs: infra/lxc-bootstrap.sh + DNS record must be in place.

set -euo pipefail

BASE_URL="${BASE_URL:-https://grimbergit.grimbergenv.nl}"
LXC_HOST="${LXC_HOST:-grimbergit-lxc}"
WEBROOT="${WEBROOT:-/var/www/grimbergit}"

REPO_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

log() { printf '\033[1;34m→\033[0m %s\n' "$*"; }

log "npm ci (ignore-scripts)…"
npm ci --ignore-scripts >/dev/null

log "astro build…"
npx astro build >/dev/null

log "rsync dist/ → $LXC_HOST:$WEBROOT…"
rsync -az --delete --checksum -e "ssh -o BatchMode=yes" \
  dist/ "$LXC_HOST":"$WEBROOT/"

log "chown web root to www-data on LXC…"
ssh -o BatchMode=yes "$LXC_HOST" "chown -R www-data:www-data $WEBROOT"

log "smoke: $BASE_URL/"
curl -sSf --max-time 8 -o /dev/null "$BASE_URL/" && echo "  200 OK"

log "playwright test against $BASE_URL"
BASE_URL="$BASE_URL" npx playwright test
