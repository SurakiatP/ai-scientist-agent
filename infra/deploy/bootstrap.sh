#!/usr/bin/env bash
# First install on a fresh VM. Run as root: sudo infra/deploy/bootstrap.sh. Idempotent: existing secrets are kept.
set -euo pipefail
[ "$(id -u)" -eq 0 ] || { echo "run as root: sudo $0" >&2; exit 1; }
PRIVATE=/etc/ai-scientist/private
CACHE=/var/lib/ai-scientist/cache
SRC="$(cd "$(dirname "$0")/../.." && pwd)"

install -d -m 0750 "$PRIVATE" /var/backups/ai-scientist "$CACHE"
for f in minio-access-key minio-secret-key; do
  [ -f "$PRIVATE/$f" ] || (umask 077 && openssl rand -hex 24 > "$PRIVATE/$f")
done
# Cache must be readable by the backend (uid 10001) but not writable by it.
chmod 0755 "$CACHE"
# Compose bind-mounts file secrets with host owner/mode; the minio user (10001) reads them via this group.
chgrp 10001 "$PRIVATE/minio-access-key" "$PRIVATE/minio-secret-key"
chmod 0640 "$PRIVATE/minio-access-key" "$PRIVATE/minio-secret-key"
if [ ! -f "$PRIVATE/app.env" ]; then
  install -m 0600 "$SRC/infra/deploy/app.env.example" "$PRIVATE/app.env"
  echo "Edit $PRIVATE/app.env (replace every CHANGE_ME), then run: infra/deploy/deploy.sh <tag>" >&2
  exit 1
fi
echo "Hermes + skills checkout: follow infra/hermes/setup.md and put the result in $CACHE" >&2
install -m 0755 "$SRC/infra/deploy/deploy.sh" /usr/local/bin/ai-scientist-deploy
install -m 0755 "$SRC/infra/deploy/backup.sh" /usr/local/bin/ai-scientist-backup
cat > /etc/systemd/system/ai-scientist-backup.service <<'UNIT'
[Unit]
Description=ai-scientist MinIO backup
[Service]
Type=oneshot
ExecStart=/usr/local/bin/ai-scientist-backup
UNIT
cat > /etc/systemd/system/ai-scientist-backup.timer <<'UNIT'
[Unit]
Description=Daily ai-scientist backup
[Timer]
OnCalendar=*-*-* 03:00:00
Persistent=true
[Install]
WantedBy=timers.target
UNIT
systemctl daemon-reload
systemctl enable --now ai-scientist-backup.timer
echo "Bootstrap done. Deploy a tag: ai-scientist-deploy <tag>"
