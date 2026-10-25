#!/usr/bin/env bash
# Daily backup: MinIO volume (tar) + PostgreSQL (pg_dump -Fc), same 7-day retention. Off-site copy is up to the owner (rsync).
set -euo pipefail
OUT=/var/backups/ai-scientist
VOL=ai-scientist_minio_data
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
docker run --rm -v "$VOL":/data:ro -v "$OUT":/out busybox:1.37@sha256:bdf57e528e45e4433820e045b29b4597825a1c9e38353532d90a01445013f82e tar czf "/out/minio-$STAMP.tgz" -C /data .
find "$OUT" -name 'minio-*.tgz' -mtime +7 -delete
# PostgreSQL logical dump (custom format). Skipped when the postgres container is not running (first deploy).
PG=ai-scientist-postgres-1
if [ "$(docker inspect -f '{{.State.Running}}' "$PG" 2>/dev/null || true)" = true ]; then
  # password reaches the container via the environment of this process only (not argv); the dump is written 0600
  PGPASSWORD="$(cat /etc/ai-scientist/private/postgres-app-password)" \
    docker exec -e PGPASSWORD "$PG" pg_dump -Fc -U app -d app > "$OUT/postgres-$STAMP.dump.partial"
  chmod 0600 "$OUT/postgres-$STAMP.dump.partial"
  mv "$OUT/postgres-$STAMP.dump.partial" "$OUT/postgres-$STAMP.dump"
fi
find "$OUT" -name 'postgres-*.dump' -mtime +7 -delete
find "$OUT" -name 'postgres-*.dump.partial' -mtime +1 -delete
