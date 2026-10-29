# Sandbox Runner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deep Research branches and data analysis run in the Compose deployment through an isolated Docker daemon, without giving the backend the host Docker socket.

**Architecture:** A `sandbox` service runs `docker:dind` under the sysbox runtime (no `privileged`). Only the backend can reach it: the two share an `internal` network, and the daemon requires mutual TLS whose client certs only the backend mounts. Bind mounts that Hermes (skills dir) and analysis (`/in`) pass to `docker run` resolve on the daemon side because both containers mount one named volume at the same absolute path, `/srv/sandbox-share`. A one-shot `sandbox-init` fixes cert/volume ownership for uid 10001 and pre-pulls the pinned sandbox images into the daemon.

**Tech Stack:** Docker Compose, docker:dind + sysbox-runc, docker CLI in the backend image, FastAPI, pytest, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-10-29-production-roadmap.md` (plan 1)

## Global Constraints

- The backend container never mounts `/var/run/docker.sock`; no service in `infra/compose.yaml` sets `privileged: true`.
- Every image referenced is pinned by digest (`name:tag@sha256:...`), resolved with `docker buildx imagetools inspect`.
- Shared path is exactly `/srv/sandbox-share` in both `backend` and `sandbox`; Hermes runtime dir `/srv/sandbox-share/hermes-home`; analysis work dir `/srv/sandbox-share/work`.
- Daemon address `tcp://sandbox:2376`, `DOCKER_TLS_VERIFY=1`, `DOCKER_CERT_PATH=/certs/client` (read-only in backend).
- Local development (no `DOCKER_HOST`, host Docker) keeps working unchanged; existing tests keep passing.
- Never stop, remove or modify containers, volumes or networks that do not belong to compose projects created by this plan's own verification (use project name `ai-scientist-sbx` for local rehearsal and tear it down with `down -v` at the end).
- Never read or print `.env`, `app.env` or any secret value.
- Commit messages end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Stage explicit paths only.

## Review Focus

1. Backend starts while the sandbox daemon is down or still starting: `/v1/health` reports `sandbox: "unreachable"`, the app stays up, analysis returns `docker_unavailable`, research branches fail per branch (no crash).
2. Hermes bridge subprocess gets `DOCKER_TLS_VERIFY` and `DOCKER_CERT_PATH` as well as `DOCKER_HOST`; without them branch containers silently fail to start.
3. Client key readable by uid 10001 only (0600/0640 owner 10001), never world-readable.
4. Branch containers (they have network egress) cannot drive the daemon: they get no certs, and port 2376 requires a client cert.
5. Analysis input directory under the shared volume is still removed after every run (success, timeout, cancel).

---

### Task 1: Backend reads a remote Docker daemon and shared paths

**Files:**
- Modify: `backend/src/scientist/config.py` (sandbox section), `backend/src/scientist/sandbox.py:74` (`WORK`), `backend/src/scientist/hermes.py:103-108` (bridge env), `backend/src/scientist/main.py` (`/v1/health`)
- Test: `backend/tests/test_sandbox_runner.py` (new)

**Interfaces:**
- Produces: `Settings.sandbox_work_dir: Path | None = None` (None = `Path.home() / ".cache/scientist/sandbox"`, today's value); `sandbox.work_dir(settings) -> Path`; `/v1/health` JSON gains `"sandbox": "ok" | "unreachable" | "disabled"`; `sandbox.docker_reachable() -> bool` (async, `docker version --format {{.Server.Version}}`, 3 s timeout, result cached 30 s).

- [ ] **Step 1: Write failing tests** in `backend/tests/test_sandbox_runner.py`:
  - `test_work_dir_defaults_to_home_cache`: `work_dir(Settings(...))` == `Path.home() / ".cache/scientist/sandbox"`.
  - `test_work_dir_uses_setting`: with `sandbox_work_dir=tmp_path / "w"`, `run_analysis` (docker subprocess faked via monkeypatching `asyncio.create_subprocess_exec` to capture argv) writes its `in` dir under `tmp_path / "w"` and the captured `-v` source starts with that path; after the call the run dir no longer exists.
  - `test_bridge_env_passes_tls_settings`: with env `DOCKER_HOST=tcp://sandbox:2376`, `DOCKER_TLS_VERIFY=1`, `DOCKER_CERT_PATH=/certs/client` set (monkeypatch), the env dict built for the bridge contains all three with the same values; with none set it contains none of them.
  - `test_health_reports_sandbox`: `docker_reachable` patched True -> `"sandbox": "ok"`; False -> `"unreachable"`; `sandbox_enabled=False` -> `"disabled"` and `docker_reachable` not called.
  - `test_docker_reachable_caches`: two calls within 30 s spawn the CLI once; a missing `docker` binary (OSError) returns False.
- [ ] **Step 2: Run** `cd backend && uv run pytest tests/test_sandbox_runner.py -q` — expect failures (names not defined).
- [ ] **Step 3: Implement.** `WORK` becomes `work_dir(settings)` at call time. Bridge env passes through `DOCKER_TLS_VERIFY` and `DOCKER_CERT_PATH` exactly like `DOCKER_HOST` is today. Health adds the field without changing existing keys or the always-200 behaviour.
- [ ] **Step 4: Run** `uv run pytest -q` (whole backend suite) — all pass.
- [ ] **Step 5: Commit** `feat(sandbox): configurable work dir, TLS docker env for Hermes branches, sandbox reachability in health`.

### Task 2: Images — docker CLI in the backend, published analysis image

**Files:**
- Modify: `backend/Dockerfile`, `.github/workflows/images.yml`
- Test: build locally

**Interfaces:**
- Produces: backend image has `/usr/local/bin/docker` (client only, copied from `docker:<28.x>-cli@sha256:...`); CI publishes `ghcr.io/surakiatp/ai-scientist-agent/sandbox:<tag>` and `:sha-xxxxxxx` from `backend/sandbox/Dockerfile` alongside backend and frontend, same tag rules.

- [ ] **Step 1:** Resolve the digest of the current `docker:28-cli` (record tag + digest in a Dockerfile comment). Add `COPY --from=docker:<tag>@<digest> /usr/local/bin/docker /usr/local/bin/docker` to `backend/Dockerfile`.
- [ ] **Step 2:** Add the sandbox image to the `images.yml` matrix (context `.`, file `backend/sandbox/Dockerfile`, image name `sandbox`). Keep the existing two images byte-identical in behaviour.
- [ ] **Step 3: Verify** `docker build -f backend/Dockerfile -t sbx-backend-test .` then `docker run --rm --entrypoint docker sbx-backend-test --version` prints a 28.x client version; `docker build -f backend/sandbox/Dockerfile -t sbx-analysis-test backend/sandbox` (or the context the workflow uses) succeeds. Remove both test images afterwards. Validate the workflow YAML parses (`python -c "import yaml,sys;yaml.safe_load(open('.github/workflows/images.yml'))"`).
- [ ] **Step 4: Commit** `build: docker CLI in the backend image; publish the analysis sandbox image`.

### Task 3: Compose sandbox service, init job, backend wiring

**Files:**
- Modify: `infra/compose.yaml`, `infra/deploy/app.env.example`
- Create: `infra/compose.sandbox-local.yaml` (Docker Desktop rehearsal override), `infra/deploy/sandbox-init.sh`
- Test: `docker compose config` for both file sets; `.github/workflows/verify.yml` validates the override too

**Interfaces:**
- Consumes: Task 1 settings (`SANDBOX_WORK_DIR`, `HERMES_RUNTIME_DIR`), Task 2 images.
- Produces: services `sandbox` and `sandbox-init`; volumes `sandbox-certs`, `sandbox-share`, `sandbox-docker`; networks `sandbox` (`internal: true`, members backend + sandbox) and `sandbox-egress` (member sandbox only).

- [ ] **Step 1: `sandbox` service**: `docker:<28.x>-dind@sha256:...`; `runtime: sysbox-runc`; env `DOCKER_TLS_CERTDIR=/certs`; volumes `sandbox-certs:/certs`, `sandbox-share:/srv/sandbox-share`, `sandbox-docker:/var/lib/docker`; networks `sandbox`, `sandbox-egress`; `mem_limit`, `cpus` and `pids_limit` sized for `MAX_CONCURRENT_RUNS` x `MAX_BRANCHES` branch containers (1 CPU / 512 MB each) plus `SANDBOX_MAX_CONCURRENT` analyses (2 GB each) — state the arithmetic in a comment and make the limits env-overridable; healthcheck `docker --tls ... version` against itself or `test -f /certs/client/key.pem && docker version`; `restart: unless-stopped`; no published ports.
- [ ] **Step 2: `sandbox-init.sh` + service** (`docker:<28.x>-cli@sha256:...`, `restart: "no"`, depends on `sandbox` healthy): waits for `/certs/client/key.pem`; `chown -R 10001:10001 /certs/client` and `chmod 0600 /certs/client/key.pem`; `mkdir -p /srv/sandbox-share/hermes-home /srv/sandbox-share/work` owned 10001; pulls the Hermes branch image (the exact `SANDBOX_IMAGE` constant from `backend/src/scientist/hermes.py`) and `${SANDBOX_IMAGE}` (analysis) into the daemon over TLS; exits non-zero on any failure. POSIX `sh`, `set -eu`.
- [ ] **Step 3: backend wiring**: env `DOCKER_HOST=tcp://sandbox:2376`, `DOCKER_TLS_VERIFY=1`, `DOCKER_CERT_PATH=/certs/client`, `HERMES_RUNTIME_DIR=/srv/sandbox-share/hermes-home`, `SANDBOX_WORK_DIR=/srv/sandbox-share/work`, `SANDBOX_IMAGE=ghcr.io/surakiatp/ai-scientist-agent/sandbox:${IMAGE_TAG:-develop}`; volumes `sandbox-share:/srv/sandbox-share`, `sandbox-certs:/certs:ro`; drop the `hermes-home` tmpfs; add network `sandbox`; `depends_on: sandbox-init: service_completed_successfully`. Replace the "Not implemented yet" comment with a short description of the runner.
- [ ] **Step 4: `app.env.example`**: `SANDBOX_ENABLED=true`; fix the stale `MAX_CONCURRENT_RUNS above` comment so it names a key that exists in the file.
- [ ] **Step 5: rehearsal override** `infra/compose.sandbox-local.yaml`: for Docker Desktop, which has no sysbox: `sandbox: { runtime: runc, privileged: true }` with a header comment: rehearsal on a developer machine only, never on the VM, never combined with a public domain. `verify.yml` runs `docker compose -f infra/compose.yaml -f infra/compose.sandbox-local.yaml config -q` in addition to the existing check.
- [ ] **Step 6: Verify** `docker compose -f infra/compose.yaml config -q` and the override variant (with whatever dummy env the existing CI check uses). Grep proves: no `docker.sock` and no `privileged` in `infra/compose.yaml`.
- [ ] **Step 7: Commit** `feat(infra): isolated sandbox runner (dind under sysbox, mTLS, shared volume) for branches and analysis`.

### Task 4: Host provisioning, smoke test, docs

**Files:**
- Modify: `infra/deploy/cloud-init.yaml`, `infra/deploy/bootstrap.sh`, `infra/deploy/deploy.sh` (only if the health gate needs the sandbox), `docs/deploy.md`, `DESIGN.md` (stale PDF/DOCX line only)
- Create: `infra/deploy/sandbox-smoke.sh`

**Interfaces:**
- Consumes: Tasks 1–3.

- [ ] **Step 1: sysbox install** in `bootstrap.sh` (idempotent: skip when `sysbox-runc` is already registered): download the pinned `sysbox-ce` `.deb` release for Ubuntu 24.04 amd64 from the nestybox GitHub release, verify its SHA-256 against a value hard-coded in the script, install, confirm `docker info` lists `sysbox-runc`. Record version and checksum source in a comment. `cloud-init.yaml` only calls bootstrap as today (no duplicate logic).
- [ ] **Step 2: `sandbox-smoke.sh`** (run on the VM or locally via `docker compose ... run --rm --no-deps --entrypoint sh backend /app/infra/deploy/sandbox-smoke.sh` — make sure the script is in the image or mounted): (a) `docker version` reaches the daemon over TLS; (b) runs the analysis sandbox on a 3-row CSV through `scientist.sandbox.run_analysis(None, ...)` (profile only, no LLM, no key) and asserts `ok`; (c) proves path parity: writes a file under `/srv/sandbox-share/work/smoke-*`, runs `docker run --rm -v <that dir>:/x:ro <Hermes SANDBOX_IMAGE> cat /x/<file>` and compares content, then removes the dir; (d) a branch-image container cannot reach `sandbox:2376` without certs (expect TLS handshake failure / non-zero). Prints one PASS/FAIL line per check, exits non-zero on any FAIL. No OpenRouter call.
- [ ] **Step 3: Local rehearsal (acceptance gate)**: with project name `ai-scientist-sbx`, the override file, locally built images (`--build`) and dummy non-secret env/secret files created under the scratch dir (never the user's `.env`), bring up `sandbox` + `sandbox-init`, run the smoke script in a backend container; all four checks PASS. Paste the PASS lines into the report. Tear down with `docker compose -p ai-scientist-sbx ... down -v` and remove built test images. Do not touch any other compose project.
- [ ] **Step 4: Docs**: `docs/deploy.md` gains a "Sandbox runner" section (what runs where, sysbox requirement, rehearsal override, smoke script, troubleshooting `sandbox: unreachable`); remove the statements that branches/analysis cannot run in Compose; fix the per-client queue numbers to the code defaults (3 running, 1 queued) and the stale "one table only" sentence. `DESIGN.md`: correct the line claiming PDF/DOCX export is disabled.
- [ ] **Step 5: Commit** `feat(deploy): install sysbox, sandbox smoke test, deploy docs for the sandbox runner`.
