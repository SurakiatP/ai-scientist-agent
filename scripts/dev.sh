#!/usr/bin/env bash
# Start backend (:8000, ONE process) and frontend (:3000); Ctrl+C stops both.
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT=$PWD
die() { echo "dev.sh: $*" >&2; exit 1; }

command -v uv >/dev/null || die "uv not found. Install: https://docs.astral.sh/uv/"
command -v node >/dev/null || die "node not found. Install Node.js >= 20."
command -v npm >/dev/null || die "npm not found. Install Node.js >= 20."
[ "$(node -p 'process.versions.node.split(".")[0]')" -ge 20 ] || die "node >= 20 required, found $(node -v)."
command -v docker >/dev/null || die "docker not found. Install Docker Desktop."
docker info >/dev/null 2>&1 || die "docker is installed but not running. Start Docker Desktop."
[ -f .env ] || die ".env missing. Run: cp .env.example .env, then set OPENROUTER_API_KEY."
grep -Eq '^OPENROUTER_API_KEY=[^[:space:]]+' .env || die "OPENROUTER_API_KEY is empty in .env."
[ -d frontend/node_modules ] || die "frontend deps missing. Run: (cd frontend && npm install)"
for p in 8000 3000; do
  ! lsof -nP -iTCP:$p -sTCP:LISTEN >/dev/null 2>&1 || die "port $p is already in use."
done

set -m  # each background job gets its own process group, so we can kill the whole tree
BACK=; FRONT=
stop() {
  rc=$?; trap - EXIT INT TERM
  echo; echo "Stopping..."
  for pid in $FRONT $BACK; do kill -TERM -- -"$pid" 2>/dev/null || true; done
  # backend shutdown hook removes labelled Docker containers; give it time, then force
  for _ in $(seq 1 30); do
    kill -0 $BACK 2>/dev/null || kill -0 $FRONT 2>/dev/null || exit_now=1
    [ "${exit_now:-}" = 1 ] && break; sleep 0.5
  done
  for pid in $FRONT $BACK; do kill -KILL -- -"$pid" 2>/dev/null || true; done
  exit $rc
}
trap stop EXIT INT TERM

# run from the repo root so pydantic-settings finds ./.env; --project picks backend/'s environment
(exec uv run --project backend uvicorn --factory scientist.main:create_app --host 127.0.0.1 --port 8000) &
BACK=$!
(cd frontend && exec npm run dev) &
FRONT=$!

echo "Waiting for backend health..."
for _ in $(seq 1 120); do
  curl -fs http://127.0.0.1:8000/v1/health >/dev/null 2>&1 && break
  kill -0 $BACK 2>/dev/null || die "backend exited during startup (see output above)."
  sleep 0.5
done
curl -fs http://127.0.0.1:8000/v1/health >/dev/null || die "backend not healthy after 60 s."
for _ in $(seq 1 120); do
  curl -fs -o /dev/null http://127.0.0.1:3000/ 2>/dev/null && break
  kill -0 $FRONT 2>/dev/null || die "frontend exited during startup (see output above)."
  sleep 0.5
done

echo "Backend:  http://localhost:8000/v1/health"
echo "Frontend: http://localhost:3000"
echo "Ctrl+C to stop."
while kill -0 $BACK 2>/dev/null && kill -0 $FRONT 2>/dev/null; do sleep 1; done
die "a server exited; stopping both."
