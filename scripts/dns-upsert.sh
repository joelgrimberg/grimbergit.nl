#!/usr/bin/env bash
# Idempotently upsert an A record on Technitium DNS at 192.168.0.2.
# Reads token from $TECHNITIUM_TOKEN or ~/.config/technitium/token (chmod 600).

set -euo pipefail

TECH_HOST="${TECH_HOST:-192.168.0.2}"
TECH_PORT="${TECH_PORT:-5380}"
ZONE="${ZONE:-grimbergenv.nl}"
DOMAIN="${DOMAIN:-grimbergit.grimbergenv.nl}"
IP="${IP:-192.168.0.40}"
TTL="${TTL:-300}"

TOKEN="${TECHNITIUM_TOKEN:-}"
if [[ -z "$TOKEN" && -r "$HOME/.config/technitium/token" ]]; then
  TOKEN="$(< "$HOME/.config/technitium/token")"
fi

if [[ -z "$TOKEN" ]]; then
  echo "TECHNITIUM_TOKEN not set and ~/.config/technitium/token missing." >&2
  exit 1
fi

log() { printf '\033[1;34m→\033[0m %s\n' "$*"; }
die() { printf '\033[1;31m✗\033[0m %s\n' "$*" >&2; exit 1; }

api() {
  local path="$1"
  shift
  curl -sS --max-time 8 --get \
    --data-urlencode "token=$TOKEN" \
    "$@" \
    "http://${TECH_HOST}:${TECH_PORT}${path}"
}

log "Fetching existing records for $DOMAIN…"
existing="$(api /api/zones/records/get \
  --data-urlencode "domain=$DOMAIN" \
  --data-urlencode "zone=$ZONE" \
  --data-urlencode "listZone=false")"

status="$(printf '%s' "$existing" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("status",""))')"
if [[ "$status" != "ok" ]]; then
  err="$(printf '%s' "$existing" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get("errorMessage") or d.get("status") or d)')"
  die "get failed: $err"
fi

current_ip="$(printf '%s' "$existing" | python3 -c '
import json,sys
d=json.load(sys.stdin)
recs=(d.get("response") or {}).get("records", [])
for r in recs:
    if r.get("type") == "A":
        print((r.get("rData") or {}).get("ipAddress",""))
        break
')"

if [[ "$current_ip" == "$IP" ]]; then
  log "A record already points to $IP — nothing to do."
elif [[ -n "$current_ip" ]]; then
  log "Updating A record: $current_ip → $IP"
  resp="$(api /api/zones/records/update \
    --data-urlencode "domain=$DOMAIN" \
    --data-urlencode "zone=$ZONE" \
    --data-urlencode "type=A" \
    --data-urlencode "ipAddress=$current_ip" \
    --data-urlencode "newIpAddress=$IP" \
    --data-urlencode "ttl=$TTL")"
  st="$(printf '%s' "$resp" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("status",""))')"
  [[ "$st" == "ok" ]] || die "update failed: $resp"
else
  log "Adding A record $DOMAIN → $IP"
  resp="$(api /api/zones/records/add \
    --data-urlencode "domain=$DOMAIN" \
    --data-urlencode "zone=$ZONE" \
    --data-urlencode "type=A" \
    --data-urlencode "ipAddress=$IP" \
    --data-urlencode "ttl=$TTL")"
  st="$(printf '%s' "$resp" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("status",""))')"
  [[ "$st" == "ok" ]] || die "add failed: $resp"
fi

log "Verifying via dig @${TECH_HOST}…"
resolved="$(dig @"$TECH_HOST" +short "$DOMAIN" A | head -1)"
if [[ "$resolved" == "$IP" ]]; then
  log "OK: $DOMAIN resolves to $IP"
else
  die "resolver returned '$resolved' (expected $IP)"
fi
