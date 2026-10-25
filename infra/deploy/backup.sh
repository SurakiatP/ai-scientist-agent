#!/usr/bin/env bash
# Daily MinIO data backup (tar of the volume), 7-day retention. Off-site copy is up to the owner (rsync).
set -euo pipefail
OUT=/var/backups/ai-scientist
VOL=ai-scientist_minio_data
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
docker run --rm -v "$VOL":/data:ro -v "$OUT":/out busybox:1.37@sha256:bdf57e528e45e4433820e045b29b4597825a1c9e38353532d90a01445013f82e tar czf "/out/minio-$STAMP.tgz" -C /data .
find "$OUT" -name 'minio-*.tgz' -mtime +7 -delete
