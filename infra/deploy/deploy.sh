#!/usr/bin/env bash
# Deploy by git tag (never a branch): deploy.sh <tag>. Rollback = deploy.sh <older tag>.
# Needs: docker, git, curl; app.env in /etc/ai-scientist/private. Run as a user in the docker group.
set -euo pipefail
TAG="${1:?usage: deploy.sh <tag>}"
BASE=/opt/ai-scientist
ENVF=/etc/ai-scientist/private/app.env
REPO_URL="${REPO_URL:-https://github.com/SurakiatP/ai-scientist-agent.git}"

[ -f "$ENVF" ] || { echo "missing $ENVF" >&2; exit 1; }
! grep -q CHANGE_ME "$ENVF" || { echo "$ENVF still has CHANGE_ME values" >&2; exit 1; }
git ls-remote --exit-code --tags "$REPO_URL" "refs/tags/$TAG" >/dev/null || { echo "tag $TAG not found (branches are refused)" >&2; exit 1; }

REL="$BASE/releases/$TAG"
if [ ! -d "$REL" ]; then
  rm -rf "$REL.partial"
  git clone -q --depth 1 --branch "$TAG" "$REPO_URL" "$REL.partial"
  mv "$REL.partial" "$REL"
fi

PREV="$(readlink -f "$BASE/current" 2>/dev/null || true)"
dc() { docker compose -f "$1/infra/compose.yaml" --env-file "$ENVF" "${@:2}"; }
wait_ready() { for _ in $(seq 1 60); do curl -fsS "http://127.0.0.1:${MINIO_PORT:-59000}/minio/health/live" >/dev/null 2>&1 && \
  dc "$1" ps backend --format '{{.Health}}' | grep -q healthy && return 0; sleep 2; done; return 1; }

export IMAGE_TAG="$TAG"   # images are published per tag; pull, no on-VM build
dc "$REL" pull
dc "$REL" up -d --remove-orphans
if wait_ready "$REL"; then
  ln -sfn "$REL" "$BASE/current"; echo "deployed $TAG"
else
  echo "tag $TAG failed health check" >&2
  if [ -n "$PREV" ] && [ "$PREV" != "$REL" ]; then
    IMAGE_TAG="$(basename "$PREV")" dc "$PREV" up -d --remove-orphans && echo "rolled back to $(basename "$PREV")" >&2
  fi
  exit 1
fi
