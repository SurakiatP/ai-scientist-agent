#!/usr/bin/env bash
# First install on a fresh VM. Run as root: sudo infra/deploy/bootstrap.sh. Idempotent: existing secrets are kept.
set -euo pipefail
[ "$(id -u)" -eq 0 ] || { echo "run as root: sudo $0" >&2; exit 1; }
PRIVATE=/etc/ai-scientist/private
CACHE=/var/lib/ai-scientist/cache
SRC="$(cd "$(dirname "$0")/../.." && pwd)"

install -d -m 0750 "$PRIVATE" /var/backups/ai-scientist "$CACHE"
for f in minio-access-key minio-secret-key postgres-password postgres-app-password; do
  [ -f "$PRIVATE/$f" ] || (umask 077 && openssl rand -hex 24 > "$PRIVATE/$f")
done
# Sysbox runtime for the `sandbox` service (docs/deploy.md). Pinned: sysbox-ce 0.7.1, Ubuntu 24.04 amd64.
# SHA-256 = the `digest` GitHub publishes for the release asset (gh api repos/nestybox/sysbox/releases, tag v0.7.1), and equal
# to `shasum -a 256` of the file downloaded from the URL below on 2026-10-29. Idempotent: skipped when sysbox-runc is registered.
SYSBOX_VERSION=0.7.1
SYSBOX_SHA256=9d6d5484f980d0a17f86c492c1262015c2afb66280bdb97215b79fde6a0261c5
if ! docker info --format '{{json .Runtimes}}' 2>/dev/null | grep -q sysbox-runc; then
  T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT
  curl -fsSL -o "$T/sysbox.deb" "https://github.com/nestybox/sysbox/releases/download/v${SYSBOX_VERSION}/sysbox-ce_${SYSBOX_VERSION}.linux_amd64.deb"
  echo "$SYSBOX_SHA256  $T/sysbox.deb" | sha256sum -c - || { echo "sysbox .deb checksum mismatch" >&2; exit 1; }
  apt-get install -y "$T/sysbox.deb"  # the package registers the runtime and restarts docker
  docker info --format '{{json .Runtimes}}' | grep -q sysbox-runc || { echo "sysbox-runc is not listed by docker info" >&2; exit 1; }
fi
# Cache must be readable by the backend (uid 10001) but not writable by it.
chmod 0755 "$CACHE"
# Compose bind-mounts file secrets with host owner/mode; the minio user (10001) reads them via this group.
chgrp 10001 "$PRIVATE/minio-access-key" "$PRIVATE/minio-secret-key"
chmod 0640 "$PRIVATE/minio-access-key" "$PRIVATE/minio-secret-key"
# Postgres: superuser password stays root-only (read by the postgres entrypoint, which runs as root); the app-role password is
# also read by backend + migrate (uid 10001) via the group. Keep both off any command line.
chmod 0600 "$PRIVATE/postgres-password"
chgrp 10001 "$PRIVATE/postgres-app-password"; chmod 0640 "$PRIVATE/postgres-app-password"
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
Description=ai-scientist MinIO + PostgreSQL backup
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
