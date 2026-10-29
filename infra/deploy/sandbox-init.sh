#!/bin/sh
# One-shot, run by the `sandbox-init` compose service (docker:28.5.2-cli) after the nested daemon is healthy.
# Any failure exits non-zero, so the backend (depends_on service_completed_successfully) does not start half-wired.
set -eu

# Keep in sync with SANDBOX_IMAGE in backend/src/scientist/hermes.py (the Hermes branch image).
HERMES_IMAGE="ghcr.io/astral-sh/uv:0.11.6-python3.13-trixie@sha256:b3c543b6c4f23a5f2df22866bd7857e5d304b67a564f4feab6ac22044dde719b"
: "${ANALYSIS_IMAGE:?ANALYSIS_IMAGE is required}"

# Client key: readable by the backend user (uid 10001) only. chmod before chown (root no longer owns it afterwards).
i=0
until [ -s /certs/client/key.pem ]; do
  i=$((i + 1)); [ "$i" -le 60 ] || { echo "sandbox-init: /certs/client/key.pem never appeared" >&2; exit 1; }
  sleep 1
done
chmod 0600 /certs/client/key.pem
chown -R 10001:10001 /certs/client

mkdir -p /srv/sandbox-share/hermes-home /srv/sandbox-share/work
chown 10001:10001 /srv/sandbox-share/hermes-home /srv/sandbox-share/work

# Pull over TLS (DOCKER_HOST / DOCKER_TLS_VERIFY / DOCKER_CERT_PATH come from the compose environment).
docker pull "$HERMES_IMAGE"
docker pull "$ANALYSIS_IMAGE"
echo "sandbox-init: ok"
