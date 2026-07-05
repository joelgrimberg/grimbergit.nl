#!/usr/bin/env bash
# One-time provisioning of the LAN-preview LXC on Proxmox for grimbergit.nl.
# Idempotent-ish: skips creation if VMID exists; safe to re-run to refresh cert / Caddyfile.

set -euo pipefail

VMID="${VMID:-307}"
LXC_HOSTNAME="${LXC_HOSTNAME:-grimbergit-web}"
IP_CIDR="${IP_CIDR:-192.168.0.40/24}"
IP="${IP_CIDR%/*}"
GATEWAY="${GATEWAY:-192.168.0.1}"
BRIDGE="${BRIDGE:-vmbr0}"
TEMPLATE="${TEMPLATE:-local:vztmpl/ubuntu-26.04-standard_26.04-1_amd64.tar.zst}"
STORAGE="${STORAGE:-local-lvm}"
DISK_GB="${DISK_GB:-4}"
CORES="${CORES:-1}"
MEMORY_MB="${MEMORY_MB:-512}"

CERT_DIR="${CERT_DIR:-$HOME/certs/grimbergenv-wildcard}"
PUBKEY="${PUBKEY:-$HOME/.ssh/prod.pub}"

REPO_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
CADDYFILE="$REPO_ROOT/infra/Caddyfile"

log() { printf '\033[1;34m→\033[0m %s\n' "$*"; }
die() { printf '\033[1;31m✗\033[0m %s\n' "$*" >&2; exit 1; }

[[ -r "$CERT_DIR/fullchain.pem" ]] || die "missing $CERT_DIR/fullchain.pem"
[[ -r "$CERT_DIR/privkey.pem" ]]   || die "missing $CERT_DIR/privkey.pem"
[[ -r "$PUBKEY" ]]                 || die "missing $PUBKEY"
[[ -r "$CADDYFILE" ]]              || die "missing $CADDYFILE"

log "Checking LXC $VMID on proxmox…"
if ssh proxmox "pct status $VMID" >/dev/null 2>&1; then
  log "LXC $VMID already exists — skipping create, will refresh config."
else
  log "Verifying $IP is free on $BRIDGE…"
  if ssh proxmox "arping -c 2 -w 3 -I $BRIDGE $IP" 2>/dev/null | grep -q "reply from"; then
    die "$IP already answers ARP on $BRIDGE — pick a free IP via IP_CIDR=…"
  fi

  log "Creating LXC $VMID ($LXC_HOSTNAME) at $IP_CIDR…"
  ssh proxmox "pct create $VMID $TEMPLATE \
    --hostname $LXC_HOSTNAME \
    --net0 name=eth0,bridge=$BRIDGE,ip=$IP_CIDR,gw=$GATEWAY \
    --nameserver 192.168.0.2 \
    --memory $MEMORY_MB --cores $CORES \
    --rootfs $STORAGE:$DISK_GB \
    --unprivileged 1 \
    --features nesting=1,keyctl=1 \
    --onboot 1"

  log "Injecting SSH key…"
  ssh proxmox "install -d -m 0700 /var/lib/lxc/$VMID/rootfs/root/.ssh 2>/dev/null || true"
  scp "$PUBKEY" proxmox:/tmp/authorized_keys.new
  ssh proxmox "pct start $VMID && sleep 4 && pct push $VMID /tmp/authorized_keys.new /root/.ssh/authorized_keys && pct exec $VMID -- chmod 700 /root/.ssh && pct exec $VMID -- chmod 600 /root/.ssh/authorized_keys && rm /tmp/authorized_keys.new"
fi

log "Ensuring LXC is running…"
ssh proxmox "pct status $VMID | grep -q running || pct start $VMID"
sleep 3

log "Installing Caddy + rsync…"
ssh proxmox "pct exec $VMID -- bash -lc 'export DEBIAN_FRONTEND=noninteractive; apt-get update -qq && apt-get install -y -qq caddy rsync ca-certificates >/dev/null'"

log "Preparing web root…"
ssh proxmox "pct exec $VMID -- install -d -m 0755 -o www-data -g www-data /var/www/grimbergit"

log "Pushing wildcard cert (staged via proxmox host, deleted after)…"
ssh proxmox "install -d -m 0700 /tmp/gcert"
scp "$CERT_DIR/fullchain.pem" "$CERT_DIR/privkey.pem" proxmox:/tmp/gcert/
ssh proxmox "pct exec $VMID -- install -d -m 0755 /etc/caddy/certs && \
  pct push $VMID /tmp/gcert/fullchain.pem /etc/caddy/certs/fullchain.pem && \
  pct push $VMID /tmp/gcert/privkey.pem /etc/caddy/certs/privkey.pem && \
  pct exec $VMID -- chown -R root:caddy /etc/caddy/certs && \
  pct exec $VMID -- chmod 750 /etc/caddy/certs && \
  pct exec $VMID -- chmod 640 /etc/caddy/certs/fullchain.pem && \
  pct exec $VMID -- chmod 640 /etc/caddy/certs/privkey.pem && \
  rm -rf /tmp/gcert"

log "Pushing Caddyfile…"
scp "$CADDYFILE" proxmox:/tmp/Caddyfile.new
ssh proxmox "pct push $VMID /tmp/Caddyfile.new /etc/caddy/Caddyfile && rm /tmp/Caddyfile.new"

log "Enabling + reloading Caddy…"
ssh proxmox "pct exec $VMID -- systemctl enable caddy >/dev/null 2>&1 && pct exec $VMID -- systemctl restart caddy"
ssh proxmox "pct exec $VMID -- systemctl is-active caddy"

log "Done. LXC $VMID reachable at $IP (grimbergit.grimbergenv.nl via DNS)."
