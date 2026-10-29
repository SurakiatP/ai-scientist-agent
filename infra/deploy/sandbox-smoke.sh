#!/bin/sh
# Smoke test of the sandbox runner. Runs INSIDE a backend container (it needs the docker CLI, the client certs and the python venv).
# No OpenRouter call, no model code. One PASS/FAIL line per check, exit 1 on any FAIL. Commands: docs/deploy.md "Sandbox runner".
set -u
FAILS=0
ok() { echo "PASS $1"; }
bad() { echo "FAIL $1${2:+ ($2)}"; FAILS=$((FAILS + 1)); }
check() { n="$1"; shift; if out="$("$@" 2>&1)"; then ok "$n"; else bad "$n" "$(echo "$out" | tail -n 3 | tr '\n' ' ')"; fi; }

HERMES_IMAGE="$(python -c 'from scientist.hermes import SANDBOX_IMAGE; print(SANDBOX_IMAGE)')" || { echo "FAIL cannot import scientist.hermes"; exit 1; }
WORK="${SANDBOX_WORK_DIR:-/srv/sandbox-share/work}"

# (a) the daemon answers over mutual TLS
check "(a) docker version over TLS" docker version --format '{{.Server.Version}}'

# (b) analysis sandbox, profile only (script=None: no model code)
b() { python - <<'PY'
import asyncio, sys
from scientist.config import Settings
from scientist.sandbox import run_analysis
r = asyncio.run(run_analysis(None, b"a,b\n1,x\n2,y\n3,z\n", "csv", Settings()))
print(r.error or "", r.stderr_tail[-300:])
sys.exit(0 if r.ok else 1)
PY
}
check "(b) analysis sandbox profiles a 3-row CSV" b

# (c) path parity: a file the backend writes under the shared volume is visible at the same path in a branch-image container
c() {
  dir="$(mktemp -d "$WORK/smoke-XXXXXX")" || return 1
  chmod 0755 "$dir"; echo "parity-$$" > "$dir/f.txt"; chmod 0644 "$dir/f.txt"
  [ "$(docker run --rm -v "$dir:/x:ro" "$HERMES_IMAGE" cat /x/f.txt)" = "parity-$$" ]; rc=$?
  rm -rf "$dir"; return $rc
}
check "(c) shared path parity (branch image sees backend file)" c

# Branch-image probes: connect(addr,port) succeeds -> exit 0 (reachable). python is the uv image's own.
PROBE='import socket,sys
try: socket.create_connection((sys.argv[1], int(sys.argv[2])), 4).close()
except OSError: sys.exit(1)'
HTTPS='import urllib.request as u,urllib.error as e,sys
try: u.urlopen(sys.argv[1], timeout=8)
except e.HTTPError: pass
except Exception as x: print(x); sys.exit(1)'
branch() { docker run --rm "$HERMES_IMAGE" python -c "$@"; }
unreachable() { ! branch "$PROBE" "$1" "$2" >/dev/null 2>&1; }

# (d) a branch container cannot drive the daemon: it holds no client cert, so a TLS request to the daemon port must fail.
# (Traffic to the daemon's own address is INPUT, not FORWARD, so the egress filter does not apply: the client-cert requirement is the control.)
TLS='import urllib.request as u,ssl,sys
c = ssl.create_default_context(); c.check_hostname = False; c.verify_mode = ssl.CERT_NONE
try: u.urlopen("https://" + sys.argv[1] + ":2376/version", timeout=6, context=c)
except Exception as x: print("refused:", type(x).__name__); sys.exit(0)
sys.exit(1)'
SBX_IP="$(getent hosts sandbox | awk '{print $1; exit}')"
d() { [ -n "$SBX_IP" ] && branch "$TLS" "$SBX_IP" && branch "$TLS" sandbox; }
check "(d) branch container cannot reach sandbox:2376" d

# (e) egress filter: no route to the backend or the metadata address, public HTTPS works.
# Stand-in listener on :8000 (a refused connection would look "blocked" too); every non-loopback IP of this container counts as "the backend".
python -m http.server 8000 --bind 0.0.0.0 --directory /tmp >/dev/null 2>&1 &
LISTENER=$!; trap 'kill $LISTENER 2>/dev/null' EXIT; sleep 1
e1() { for ip in ${SMOKE_BACKEND_IP:-} $(hostname -i); do
         case "$ip" in 127.*|"") continue;; esac
         unreachable "$ip" 8000 || { echo "reached $ip:8000"; return 1; }
       done; }
check "(e1) branch container cannot reach backend:8000" e1
check "(e2) branch container cannot reach 169.254.169.254:80" unreachable 169.254.169.254 80
check "(e3) branch container reaches https://api.crossref.org/" branch "$HTTPS" https://api.crossref.org/

[ "$FAILS" -eq 0 ] && echo "smoke: all checks passed" || { echo "smoke: $FAILS check(s) FAILED"; exit 1; }
