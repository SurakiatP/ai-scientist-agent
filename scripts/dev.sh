#!/usr/bin/env bash
# Start backend (:8000, ONE process) and frontend (:3000); Ctrl+C stops both.
# WAIT_SECONDS (default 60) bounds the wait for each server to come up.
set -euo pipefail
cd "$(dirname "$0")/.."
WAIT_SECONDS=${WAIT_SECONDS:-60}
die() { echo "dev.sh: $*" >&2; exit 1; }

command -v uv >/dev/null || die "uv not found. Install: https://docs.astral.sh/uv/"
command -v node >/dev/null || die "node not found. Install Node.js >= 20."
command -v npm >/dev/null || die "npm not found. Install Node.js >= 20."
[ "$(node -p 'process.versions.node.split(".")[0]')" -ge 20 ] || die "node >= 20 required, found $(node -v)."
command -v docker >/dev/null || die "docker not found. Install Docker Desktop."

# `docker info` can hang on a half-up daemon: run it in the background and give it 10 s.
docker info >/dev/null 2>&1 & dpid=$!
for _ in $(seq 1 20); do kill -0 "$dpid" 2>/dev/null || break; sleep 0.5; done
if kill -0 "$dpid" 2>/dev/null; then
  kill "$dpid" 2>/dev/null || true
  die "docker did not answer within 10 s. Restart Docker Desktop."
fi
wait "$dpid" || die "docker is installed but not running. Start Docker Desktop."

[ -f .env ] || die ".env missing. Run: cp .env.example .env, then set OPENROUTER_API_KEY."
# The backend (pydantic-settings) prefers a real environment variable over .env, even an empty one.
# The file is only parsed by awk (last assignment wins, like dotenv), never sourced or printed.
if [ -n "${OPENROUTER_API_KEY+x}" ]; then
  key=$OPENROUTER_API_KEY; src="the environment"
else
  src=".env"
  key=$(awk '
    { sub(/\r$/, "") }
    /^[[:space:]]*(export[[:space:]]+)?OPENROUTER_API_KEY[[:space:]]*=/ {
      v = $0; sub(/^[^=]*=/, "", v); gsub(/^[[:space:]]+|[[:space:]]+$/, "", v)
      if (v ~ /^"/ || v ~ /^\047/) { q = substr(v, 1, 1); v = substr(v, 2); i = index(v, q); v = i ? substr(v, 1, i - 1) : v }
      else { sub(/[[:space:]]+#.*$/, "", v); gsub(/[[:space:]]+$/, "", v) }
      last = v
    }
    END { print last }' .env)
fi
[ -n "$key" ] || die "OPENROUTER_API_KEY is empty or missing (the backend reads it from $src). Set it in .env or the environment."
unset key
[ -d frontend/node_modules ] || die "frontend deps missing. Run: (cd frontend && npm install)"

port_busy() {  # 0 if something listens on 127.0.0.1:$1; never touches the listener
  if command -v lsof >/dev/null; then lsof -nP -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1
  elif (exec 3<>/dev/tcp/127.0.0.1/"$1") 2>/dev/null; then return 0
  else return 1; fi
}
if ! command -v lsof >/dev/null && [[ $( (exec 3<>/dev/tcp/127.0.0.1/1) 2>&1) == *"No such file"* ]]; then
  echo "dev.sh: warning: neither lsof nor bash /dev/tcp available, port check skipped." >&2
fi
for p in 8000 3000; do
  ! port_busy "$p" || die "port $p is already in use (not touching it)."
done

# Local MinIO for uploads/artifacts: loopback only, throwaway dev credentials, data in a named volume.
# Skipped (uploads answer 503) with DEV_NO_MINIO=1. The sandbox image is built once for analysis.
if [ -z "${DEV_NO_MINIO:-}" ]; then
  export MINIO_PUBLIC_ENDPOINT=${MINIO_PUBLIC_ENDPOINT:-http://127.0.0.1:59100} # the browser fetches presigned previews from here
  export MINIO_ENDPOINT=${MINIO_ENDPOINT:-http://127.0.0.1:59100} MINIO_ACCESS_KEY=${MINIO_ACCESS_KEY:-devaccess} MINIO_SECRET_KEY=${MINIO_SECRET_KEY:-dev-secret-not-for-prod}
  if ! docker ps --format '{{.Names}}' | grep -qx scientist-dev-minio; then
    docker rm -f scientist-dev-minio >/dev/null 2>&1 || true
    docker run -d --name scientist-dev-minio -p 127.0.0.1:59100:9000 -v scientist-dev-minio:/data \
      -e MINIO_API_CORS_ALLOW_ORIGIN=http://localhost:3000,http://127.0.0.1:3000 -e MINIO_ROOT_USER="$MINIO_ACCESS_KEY" -e MINIO_ROOT_PASSWORD="$MINIO_SECRET_KEY" \
      quay.io/minio/minio:RELEASE.2025-09-07T16-13-09Z server /data >/dev/null || die "could not start the local MinIO container."
  fi
  docker image inspect scientist-sandbox:latest >/dev/null 2>&1 || docker build -q -t scientist-sandbox:latest backend/sandbox >/dev/null || die "could not build the sandbox image."
fi

# Local PostgreSQL (foundation only, no app data in it yet): loopback 55433 (55432 belongs to another project), throwaway
# dev password, data in named volume scientist-dev-pg. Skipped (database off, app behaves as before) with DEV_NO_DB=1.
if [ -z "${DEV_NO_DB:-}" ]; then
  export DATABASE_URL=${DATABASE_URL:-postgresql://scientist:dev-pg-not-for-prod@127.0.0.1:55433/scientist}
  if ! docker ps --format '{{.Names}}' | grep -qx scientist-dev-postgres; then
    port_busy 55433 && die "port 55433 is busy (not by scientist-dev-postgres). Free it or set DEV_NO_DB=1."
    docker rm -f scientist-dev-postgres >/dev/null 2>&1 || true
    docker run -d --name scientist-dev-postgres -p 127.0.0.1:55433:5432 -v scientist-dev-pg:/var/lib/postgresql/data \
      -e POSTGRES_USER=scientist -e POSTGRES_PASSWORD=dev-pg-not-for-prod -e POSTGRES_DB=scientist \
      --health-cmd 'pg_isready -U scientist -d scientist' --health-interval 2s --health-retries 15 \
      postgres:17-alpine >/dev/null || die "could not start local Postgres container."
  fi
  for _ in $(seq 1 30); do
    [ "$(docker inspect -f '{{.State.Health.Status}}' scientist-dev-postgres 2>/dev/null)" = healthy ] && break
    sleep 1
  done
  [ "$(docker inspect -f '{{.State.Health.Status}}' scientist-dev-postgres 2>/dev/null)" = healthy ] || die "local Postgres not healthy after 30 s (docker logs scientist-dev-postgres)."
  uv run --project backend alembic -c backend/alembic.ini upgrade head || die "database migration failed."
fi

set -m  # each background job gets its own process group, so we can kill the whole tree
BACK=; FRONT=
alive() { kill -0 "$1" 2>/dev/null; }
# shellcheck disable=SC2329  # invoked via trap
stop() {
  rc=$?; trap - EXIT INT TERM
  echo; echo "Stopping..."
  for pid in $FRONT $BACK; do kill -TERM -- "-$pid" 2>/dev/null || true; done
  # backend shutdown hook removes labelled Docker containers (the dev MinIO and Postgres keep running: docker rm -f scientist-dev-minio scientist-dev-postgres); give it time, then force
  for _ in $(seq 1 30); do
    { [ -z "$BACK" ] || ! alive "$BACK"; } && { [ -z "$FRONT" ] || ! alive "$FRONT"; } && break
    sleep 0.5
  done
  for pid in $FRONT $BACK; do kill -KILL -- "-$pid" 2>/dev/null || true; done
  exit "$rc"
}
trap stop EXIT INT TERM

# run from the repo root so pydantic-settings finds ./.env; --project picks backend/'s environment
(exec uv run --project backend uvicorn --factory scientist.main:create_app --host 127.0.0.1 --port 8000) &
BACK=$!
(cd frontend && exec npm run dev) &
FRONT=$!

echo "Waiting for backend health..."
for _ in $(seq 1 $((WAIT_SECONDS * 2))); do
  curl -fs http://127.0.0.1:8000/v1/health >/dev/null 2>&1 && break
  alive "$BACK" || die "backend exited during startup (see output above)."
  sleep 0.5
done
curl -fs http://127.0.0.1:8000/v1/health >/dev/null 2>&1 || die "backend not healthy after $WAIT_SECONDS s."
for _ in $(seq 1 $((WAIT_SECONDS * 2))); do
  curl -fs -o /dev/null http://127.0.0.1:3000/ 2>/dev/null && break
  alive "$FRONT" || die "frontend exited during startup (see output above)."
  sleep 0.5
done
curl -fs -o /dev/null http://127.0.0.1:3000/ 2>/dev/null || die "frontend not ready after $WAIT_SECONDS s."

echo "Backend:  http://localhost:8000/v1/health"
echo "Frontend: http://localhost:3000"
echo "Ctrl+C to stop."
while alive "$BACK" && alive "$FRONT"; do sleep 1; done
die "a server exited; stopping both."
