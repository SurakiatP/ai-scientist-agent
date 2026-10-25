#!/usr/bin/env bash
# Deploy a PUBLISHED image tag: sudo deploy.sh <v*|sha-<short>|develop>. Rollback = same command with an older tag.
# Runs as root (app.env is root 0600; /opt/ai-scientist is root-owned): use `sudo ai-scientist-deploy <tag>`.
# Needs: docker, git, curl.
set -euo pipefail
TAG="${1:?usage: sudo deploy.sh <v*|sha-<short>|develop>}"
[ "$(id -u)" -eq 0 ] || { echo "run as root: sudo $0 $TAG" >&2; exit 1; }
[[ "$TAG" =~ ^(v[0-9][A-Za-z0-9._-]*|sha-[0-9a-f]{7}|develop)$ ]] || { echo "tag must be v*, sha-<7 hex> or develop" >&2; exit 1; }
BASE=/opt/ai-scientist
ENVF=/etc/ai-scientist/private/app.env
IMG=ghcr.io/surakiatp/ai-scientist-agent
REPO_URL="${REPO_URL:-https://github.com/SurakiatP/ai-scientist-agent.git}"

[ -f "$ENVF" ] || { echo "missing $ENVF" >&2; exit 1; }
! grep -q CHANGE_ME "$ENVF" || { echo "$ENVF still has CHANGE_ME values" >&2; exit 1; }
# Only deploy what the Images workflow published.
for i in backend frontend; do
  docker manifest inspect "$IMG/$i:$TAG" >/dev/null 2>&1 || { echo "image $IMG/$i:$TAG is not published" >&2; exit 1; }
done

REL="$BASE/releases/$TAG"
if [ "$TAG" = develop ] && [ -d "$REL" ]; then rm -rf "$REL"; fi  # develop moves; others are immutable
if [ ! -d "$REL" ]; then
  mkdir -p "$BASE/releases"; rm -rf "$REL.partial"
  case "$TAG" in
    sha-*) git clone -q "$REPO_URL" "$REL.partial"; git -C "$REL.partial" checkout -q "${TAG#sha-}" ;;
    *) git clone -q --depth 1 --branch "$TAG" "$REPO_URL" "$REL.partial" ;;
  esac
  mv "$REL.partial" "$REL"
fi

PREV="$(readlink -f "$BASE/current" 2>/dev/null || true)"
dc() { IMAGE_TAG="$2" docker compose -f "$1/infra/compose.yaml" --env-file "$ENVF" "${@:3}"; }
wait_ready() { for _ in $(seq 1 60); do
  curl -fsS "http://127.0.0.1:${MINIO_PORT:-59000}/minio/health/live" >/dev/null 2>&1 && \
  dc "$1" "$2" ps backend --format '{{.Health}}' | grep -q healthy && return 0; sleep 2; done; return 1; }

STARTED=0
rollback() {
  trap - ERR
  echo "deploy of $TAG failed" >&2
  if [ -n "$PREV" ] && [ "$PREV" != "$REL" ] && [ -d "$PREV" ]; then
    P="$(basename "$PREV")"
    if dc "$PREV" "$P" up -d --remove-orphans && wait_ready "$PREV" "$P"; then echo "rolled back to $P (healthy)" >&2
    else echo "ROLLBACK to $P ALSO FAILED: manual intervention needed" >&2; fi
  fi
  exit 1
}
dc "$REL" "$TAG" pull
trap '[ "$STARTED" = 1 ] && rollback' ERR
STARTED=1
dc "$REL" "$TAG" up -d --remove-orphans
wait_ready "$REL" "$TAG" || rollback
ln -sfn "$REL" "$BASE/current.new" && mv -T "$BASE/current.new" "$BASE/current"
trap - ERR
echo "deployed $TAG"
