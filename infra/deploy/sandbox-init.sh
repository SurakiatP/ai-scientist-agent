#!/bin/sh
# One-shot, run by the `sandbox-init` compose service (docker:28.5.2-cli) after the nested daemon is healthy.
# Any failure exits non-zero, so the backend (depends_on service_completed_successfully) does not start half-wired.
set -eu

# Keep in sync with SANDBOX_IMAGE in backend/src/scientist/hermes.py (the Hermes branch image).
HERMES_IMAGE="ghcr.io/astral-sh/uv:0.11.6-python3.13-trixie@sha256:b3c543b6c4f23a5f2df22866bd7857e5d304b67a564f4feab6ac22044dde719b"
: "${ANALYSIS_IMAGE:?ANALYSIS_IMAGE is required}"
: "${SCIENCE_IMAGE:?SCIENCE_IMAGE is required}"

# Wait for dind to generate its client certs, then copy them into the backend-only volume (BusyBox install sets owner+mode).
i=0
until [ -s /certs/client/key.pem ]; do
  i=$((i + 1)); [ "$i" -le 60 ] || { echo "sandbox-init: /certs/client/key.pem never appeared" >&2; exit 1; }
  sleep 1
done
install -o 10001 -g 10001 -m 0644 /certs/client/ca.pem /certs/client/cert.pem /client-out/
install -o 10001 -g 10001 -m 0600 /certs/client/key.pem /client-out/

mkdir -p /srv/sandbox-share/hermes-home /srv/sandbox-share/work
chown 10001:10001 /srv/sandbox-share/hermes-home /srv/sandbox-share/work

# Pull over TLS (DOCKER_HOST / DOCKER_TLS_VERIFY / DOCKER_CERT_PATH come from the compose environment).
# Always try to pull (a mutable tag like :develop must not stay stale in the persistent daemon); fall back to a pre-loaded image
# (rehearsal: docs/deploy.md) and fail when neither works.
for img in "$HERMES_IMAGE" "$ANALYSIS_IMAGE" "$SCIENCE_IMAGE"; do
  timeout 300 docker pull "$img" || docker image inspect "$img" >/dev/null
done
docker image prune -f >/dev/null  # dangling layers left by re-pulled mutable tags
echo "sandbox-init: ok"
