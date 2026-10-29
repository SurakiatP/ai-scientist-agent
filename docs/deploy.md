# Deploy (single VM, Docker Compose)

Stack (`infra/compose.yaml`): `caddy` (80/443, automatic TLS) -> `frontend` (3000) and `backend` (8000, routes `/v1/*` and `/mcp`); `minio` on 127.0.0.1 only. Only 22/80/443 are public.

## 1. VM
Ubuntu 24.04. Use `infra/deploy/cloud-init.yaml` (edit SSH key, repo, tag) or install Docker + compose plugin by hand. Point DNS A records for your domain **and `files.<domain>`** at the VM (`files.` serves presigned file previews from MinIO through Caddy, GET/HEAD only; `MINIO_PUBLIC_ENDPOINT` in `app.env` must be `https://files.<domain>`). Set `PRESIGN_ENABLED=false` to proxy previews through the backend instead.

## 2. Secrets
`infra/deploy/bootstrap.sh` (`sudo`) creates `/etc/ai-scientist/private/` with random `minio-access-key` / `minio-secret-key` (mode 0640, group 10001) and copies `app.env.example` to `app.env` (0600). Edit `app.env`: set `DOMAIN`, `ACME_EMAIL`, `OPENROUTER_API_KEY`. The key lives only there, never in an image or the repo. `deploy.sh` refuses to run while `CHANGE_ME` remains.

## 3. Hermes runtime
The backend runs research branches through Hermes (see `infra/hermes/setup.md`). Prepare the pinned checkout into `/var/lib/ai-scientist/cache` (mounted read-only at `~/.cache/scientist`). Branches and data analysis run in the `sandbox` service (section 3b); the backend gets no host Docker socket and must never be given one: it would make any backend compromise root on the host.

## 3b. Sandbox runner
**What runs where.** `sandbox` is Docker-in-Docker (`docker:28.5.2-dind`) under the **sysbox** runtime: root inside it is an unprivileged uid range on the VM, and no service in `compose.yaml` is `privileged`. The backend reaches its daemon at `tcp://sandbox:2376` over mutual TLS with a client cert only the backend user (uid 10001) can read; research branch containers and analysis containers are started by that daemon, not by the host. `sandbox-init` (one-shot) copies the client certs into the `sandbox-client` volume, creates `/srv/sandbox-share/{hermes-home,work}` (the same path in backend and sandbox, so bind mounts resolve) and pulls the Hermes branch image and `ghcr.io/surakiatp/ai-scientist-agent/sandbox:<tag>` into the nested daemon (it always tries to pull so mutable tags such as `develop` do not go stale; a pre-loaded image is used only when the pull fails).

**Requirements.**
- sysbox must be installed: `bootstrap.sh` installs the pinned `sysbox-ce` 0.7.1 `.deb` (SHA-256 checked) and confirms `docker info` lists `sysbox-runc`. **The installer changes host Docker networking:** it writes `bip 172.20.0.1/16` and `default-address-pools 172.25.0.0/16` into `/etc/docker/daemon.json` and restarts Docker. **Existing VM upgrade:** the installer refuses to configure while any container exists (unless `bip`/`default-address-pools` are already set), so `bootstrap.sh` exits early when sysbox is missing and containers exist (the check is skipped when `/etc/docker/daemon.json` already contains both `"bip"` and `"default-address-pools"`); stop the stack first (`docker compose -f infra/compose.yaml --env-file /etc/ai-scientist/private/app.env down`; data volumes stay), re-run bootstrap, then deploy. **This install path has not been run on a real VM yet**; the first bootstrap plus smoke run on the VM is its verification. Without it `sandbox` does not start, the backend waits for it, and `deploy.sh` rolls back to the previous release when health fails. `SANDBOX_ENABLED=false` only turns analysis off; the stack still needs the sandbox runner.
- The `sandbox` image package on ghcr is created by the first Images run. Make it **public once** after its first publish (GitHub package settings), or log the VM's nested daemon into ghcr; otherwise `sandbox-init` cannot pull it and fails, and so does the deploy.
- The `sandbox-science` image (analysis with a field pack that adds libraries: rdkit, scikit-learn, scanpy, pymc, pymatgen, lifelines, shap; whole dependency tree pinned in `backend/sandbox/constraints-science.txt`; about 440 MB to pull, about 2 GB on disk, built from `backend/sandbox/Dockerfile.science`) is published by the same Images run. Make its ghcr package **public once**, like `sandbox`; `sandbox-init` pulls it and `deploy.sh` refuses a tag where it is missing. General analyses never use it.
  Every retained release tag costs about 2 GB in the nested daemon (`sandbox-init` only prunes dangling layers). To reclaim space, list with `docker compose -f infra/compose.yaml exec sandbox docker images ghcr.io/surakiatp/ai-scientist-agent/sandbox-science` and remove old tags with `... exec sandbox docker image rm <tag>` (never the running release's tag); the same applies to `sandbox`.
- Resource limits `SANDBOX_MEM_LIMIT` / `SANDBOX_CPUS` / `SANDBOX_PIDS_LIMIT` (defaults 6g / 3 / 4096, leaving headroom on an 8 GB / 4 CPU VM for the other services) are in `app.env.example`; `compose.yaml` explains the worst case.

**Egress filter.** Branch code can use the internet, so `sandbox-entrypoint.sh` fills the nested daemon's `DOCKER-USER` chain before dockerd starts and refuses to run if it cannot: destinations 10/8, 172.16/12, 192.168/16 (the backend, the VM and its neighbours, Docker networks), 169.254/16 (cloud metadata, 169.254.169.254), 100.64/10 (CGNAT, some providers' internal ranges) and 127/8 are dropped; established replies are accepted. Public addresses stay reachable (papers, PyPI-style fetches). It is **IPv4 only**: the nested daemon does not enable IPv6 and the filter has no ip6tables rules, so do not enable IPv6 on it. Branch containers also hold no client cert, so they cannot drive the daemon.

**Smoke test (run after every deploy on the VM).** It checks the TLS daemon, a profile-only analysis run (no model call), path parity between backend and branch image, that a branch container cannot use the daemon port, and the egress filter (no route to the backend or 169.254.169.254, public HTTPS works). It prints one PASS/FAIL line per check and exits non-zero on any FAIL. It needs the docker CLI, the client certs and the Python environment, so run it as an admin (with `sudo`, not as the `deploy` user) in a one-off backend container with the script mounted:
```sh
cd /opt/ai-scientist/current && export APP_ENV_FILE=/etc/ai-scientist/private/app.env IMAGE_TAG=<deployed tag>
sudo -E docker compose -f infra/compose.yaml --env-file $APP_ENV_FILE run --rm --no-deps \
  -v $PWD/infra/deploy/sandbox-smoke.sh:/sandbox-smoke.sh:ro --entrypoint sh backend /sandbox-smoke.sh
```

**Rehearsal on a developer machine** (Docker Desktop/colima has no sysbox): add `-f infra/compose.sandbox-local.yaml`, which runs `sandbox` with `runc` and `privileged: true`. Never use it on the VM or with a public domain. Use a separate project name, dummy secret files and a dummy env file (never the real `app.env`), and start only what is needed so a running dev stack is not touched:
```sh
export IMAGE_TAG=sbx APP_ENV_FILE=<dummy.env> PRIVATE_DIR=<dir with four dummy secret files>
dc() { docker compose -p ai-scientist-sbx -f infra/compose.yaml -f infra/compose.sandbox-local.yaml --env-file "$APP_ENV_FILE" "$@"; }
docker build -t ghcr.io/surakiatp/ai-scientist-agent/sandbox:sbx -f backend/sandbox/Dockerfile backend/sandbox
dc up -d sandbox
docker save ghcr.io/surakiatp/ai-scientist-agent/sandbox:sbx | dc exec -T sandbox docker load   # not on ghcr yet
dc up sandbox-init
dc run --rm --no-deps --build -v $PWD/infra/deploy/sandbox-smoke.sh:/sandbox-smoke.sh:ro --entrypoint sh backend /sandbox-smoke.sh
dc down -v
```
The dummy env needs `OPENROUTER_API_KEY`, `MODEL`, `FALLBACK_MODEL`, `HERMES_REVISION` (any values; no model call is made).

**Nested DNS.** Branch containers resolve names via 8.8.8.8/8.8.4.4 (the nested dockerd's fallback); on a network that only allows an internal resolver, permit outbound port 53 or configure the nested daemon's DNS. Smoke check (e3) catches this.

**Smoke notes.** Check (e2) is meaningful only on a cloud VM that has a metadata service; on colima/Docker Desktop it always passes. Check (e3) fails during a Crossref outage (retry later; a failure with the other checks green is not a filter problem).

**Troubleshooting `sandbox: unreachable`** (`/v1/health`; the app stays up and analysis answers `docker_unavailable`): `docker compose ps sandbox sandbox-init`; `logs sandbox` (a missing runtime shows as `unknown or invalid runtime name: sysbox-runc`: run `docker info | grep -i sysbox`, re-run bootstrap); `logs sandbox-init` (ghcr pull denied: package private, see above). Any `compose up` re-runs `sandbox-init`, which re-copies the client certs; do that after restarting only `sandbox`.

## 4. Deploy a published tag
```sh
sudo ai-scientist-deploy v0.1.0      # installed by bootstrap.sh; same as infra/deploy/deploy.sh
```
Root is required (`app.env` is root 0600): bootstrap runs with `sudo`, and the `deploy` user may sudo only `ai-scientist-deploy`. Accepted tags: `v*`, `sha-<7 hex>`, `develop`, and only if the Images workflow published `{backend,frontend}:<tag>` (checked with `docker manifest inspect`; `sandbox:<tag>` is checked too, but only when that release's `compose.yaml` references it, so rollbacks to older tags keep working; a failure there usually means the ghcr package is missing or private). The Images workflow publishes `develop` and `sha-<short>` on pushes to `develop`, and `:<tag>` on `v*` tag pushes. The script checks out that ref to `/opt/ai-scientist/releases/<tag>`, pulls the images, runs `docker compose up -d`, waits for backend and MinIO health, then moves `current` atomically. Any failure after `up -d` (including a failed health check) brings the previous release back and re-checks its health; if that also fails it says so and exits 1.

Local build instead of pull: `docker compose -f infra/compose.yaml --env-file <env> up -d --build` (set `PRIVATE_DIR` for the secret files). The frontend image needs `output: "standalone"` in `frontend/next.config.ts`.

## 5. Rollback
`sudo ai-scientist-deploy <older-published-tag>` (same published-tag rules).
Database migrations are **forward-only**. `deploy.sh` runs a backup (MinIO tar + `pg_dump`) before the one-shot `migrate` service applies Alembic migrations, and a rollback restarts the old containers but does not undo schema changes. Releases must keep the previous release working on the new schema (add columns/tables first, remove later). If that is impossible, go back only by restoring the dump (section 6).

## 6. Backup / restore
A systemd timer runs `backup.sh` daily at 03:00: tar of the MinIO volume (`minio-<stamp>.tgz`) and a `pg_dump -Fc` of the database (`postgres-<stamp>.dump`, mode 0600) into `/var/backups/ai-scientist/`, 7-day retention. Copy off-site yourself (rsync). Restore: stop minio, `docker run --rm -v ai-scientist_minio_data:/data -v /var/backups/ai-scientist:/in busybox tar xzf /in/<file> -C /data`, start minio.

Restore PostgreSQL (stops the app first; replaces the database contents):
```
cd /opt/ai-scientist/current && export APP_ENV_FILE=/etc/ai-scientist/private/app.env
docker compose -f infra/compose.yaml --env-file $APP_ENV_FILE stop backend
PGPASSWORD="$(cat /etc/ai-scientist/private/postgres-app-password)" docker exec -i -e PGPASSWORD ai-scientist-postgres-1 \
  pg_restore -U app -d app --clean --if-exists --no-owner < /var/backups/ai-scientist/postgres-<stamp>.dump
docker compose -f infra/compose.yaml --env-file $APP_ENV_FILE up -d
```

## 6b. PostgreSQL
The schema is created by Alembic migrations (`backend/migrations`: chats, projects, files, runs, usage and more) and the app keeps working without a database (`DATABASE_URL` empty gives `db: disabled` in `/v1/health`; `unavailable` and `behind` never fail the endpoint). Compose runs `postgres` (image pinned by the multi-arch index digest of `postgres:17-alpine`, 17.11) on the internal-only `db` network with no published port, `cap_drop ALL` plus the five capabilities its entrypoint needs, `no-new-privileges`, 1 GB / 200 pids limits, scram auth everywhere (no trust, not even on the local socket) and idle/idle-in-transaction timeouts. The backend uses a dedicated non-superuser role `app` (created once by `infra/deploy/postgres-init.sh`) with a per-connection `statement_timeout`; the superuser password (`postgres-password`) is only mounted into the postgres container. `bootstrap.sh` generates both secrets; re-run it once on an existing VM before the first deploy of a release that has Postgres. **The app has no login: never publish the database port or put it on an external network.** Migrate by hand: `docker compose -f infra/compose.yaml --env-file <env> run --rm migrate`.

**Run queue (migration `0004_runs`, needs the database).** Research and analysis runs belong to the server: `POST /v1/runs` returns at once, the run continues after the browser closes, any tab can re-attach (`GET /v1/runs/{id}/events`, resumable with `?after=` or `Last-Event-ID`), and only the browser that submitted it can cancel (`X-Client-Id`, a random id used for fairness, never as login). Slots are shared fairly: `MAX_CONCURRENT_RUNS` (research) and `SANDBOX_MAX_CONCURRENT` (analysis), at most `MAX_RUNNING_PER_CLIENT=3` running and `MAX_QUEUED_PER_CLIENT=1` waiting per browser, `RUN_QUEUE_MAX=20` waiting in all (429 `client_busy` / `queue_full`). A run whose backend process died is found after `RUN_LEASE_SECONDS` and restarted from the start by another process (the card says "Restarted after an interruption"); after `RUN_MAX_ATTEMPTS` attempts it is marked `interrupted`. Finished runs and stored events are deleted after `RUN_RETENTION_DAYS=7` by the hourly purge. With a database the old direct `POST /v1/async/ask` (except `plan_only`) and `POST /v1/async/analyze` answer 409 `use_runs`. The queue lives in Postgres, so several backend processes share it: compose starts `BACKEND_WORKERS` (default 2) uvicorn workers. The queue caps above (`MAX_CONCURRENT_RUNS`, `SANDBOX_MAX_CONCURRENT`, per-browser and queue limits) are global across workers; rate limits (`STORE_WRITE_RATE_PER_MIN` and the like) are per process, so N workers allow N times as many requests. A deploy (graceful stop) releases running runs back to the queue and the new containers start them again, so a run in flight at deploy time is paid for twice.

## 6c. Shared data (Postgres)

- The `/v1/store/*` routes (chats, projects, messages, file list, trash, usage) need `DATABASE_URL` and migration `0002`; without them they answer 503 `database not configured` and the web app falls back to browser-only storage (it checks `/v1/health` → `db`).
- **There is no login.** Anyone who can reach the server IP can read, edit and delete everything, including "delete all chats". Keep the app behind the internal network or a VPN and never expose Postgres or MinIO publicly.
- Deleted chats, projects and files go to the trash for `TRASH_DAYS` (7). The purge runs hourly (and on `POST /v1/store/trash/purge`); a file's MinIO object is removed only when it is purged.
- Writes are rate limited per client IP (`STORE_WRITE_RATE_PER_MIN`). Behind a reverse proxy every caller shares the proxy's IP unless you set `FORWARDED_ALLOW_IPS` to the proxy's address/CIDR (uvicorn reads it; compose passes it through, default `127.0.0.1`).
- Store writes must be `Content-Type: application/json` (415 otherwise): this blocks cross-site form/`text/plain` posts. `ALLOWED_ORIGINS` (compose sets it to `https://$DOMAIN`) additionally rejects writes carrying another `Origin` (403); empty = no check.
- Caps: a snapshot returns the newest `MAX_TURNS_PER_SESSION` (50) turns per session, a session holds at most `STORE_MAX_TURNS` (500), and each turn JSON field is limited to `STORE_MAX_TURN_JSON_BYTES`. Turns removed by an edit are tombstoned (answer 410 to stale writers) until the trash purge; `usage_events` older than `USAGE_RETENTION_DAYS` (180) are deleted hourly.
- The live change feed (`GET /v1/store/events`) is shared between backend workers through Postgres `LISTEN/NOTIFY`, so any number of workers (`BACKEND_WORKERS`) is fine with a database. Without a database there is no queue or feed to share: run one worker.
- Per process, not global (N workers allow N times as many): the rate limits, `PREVIEW_MAX_CONCURRENT`, the translate gate (2) and the citation-check host semaphores. Report previews are stored in MinIO (`previews/`, expired ones removed by the hourly purge), so any worker serves them.
- Upgrading from one worker: the old shared `hermes-home` contents (`config.yaml`, `skills/`, `process-home/` directly under the Hermes home) are no longer used and can be deleted; each worker now keeps `hermes-home/<process id>`. Leftover branch containers and dirs of a killed worker are removed by every worker's 10 minute sweep once older than the branch timeout plus 10 minutes.
- The dataset lives only in Postgres: keep the daily `pg_dump` backup (section 6) and test a restore.
- `usage_events` (timings, token counts, cost) stores no question text.

## 6d. API keys (public API)

Programs call `/v1/api` with an operator-issued key (see `docs/api.md`). Run on the VM with `dc() { docker compose -f infra/compose.yaml --env-file $APP_ENV_FILE "$@"; }` (locally: `uv run --project backend python -m scientist.apikeys ...`; uses `DATABASE_URL` like the app; the migration `0008_api_keys` must be applied):

```
dc exec backend python -m scientist.apikeys create --name "<who or what>"   # prints the key once; store it now
dc exec backend python -m scientist.apikeys list                            # prefix, active/revoked, last used; never hashes
dc exec backend python -m scientist.apikeys revoke <prefix>                 # takes effect on the key's next request
```

Revoking stops new requests on the next call. Streams already open, `wait_run` calls in progress and runs already started continue to their end (bounded by the per-key caps). Only the sha256 of a key is stored. A lost key cannot be recovered: revoke it and create another.

## 7. Operations
Logs: `docker compose -f /opt/ai-scientist/current/infra/compose.yaml logs -f backend`. Local TLS rehearsal: set `CADDY_TLS=tls internal` in `app.env`.

## 8. Skills and prompt switches

- `ENABLED_SKILLS` (app.env / `.env`) is the allowlist of K-Dense skills copied into the Hermes home when the backend starts; default `["paper-lookup"]`. Add `"database-lookup"` to your own `app.env` (`ENABLED_SKILLS=["paper-lookup","database-lookup"]`) to turn database records on; without it the branches only search papers and are not offered the `report_record` tool. Databases that need an API key are skipped (no keys are configured) and the answer says so. Unknown names are rejected at start. Turn a skill off by removing it from the list and restarting the backend (the generated `hermes-home` is rebuilt each start).
- `literature-review` and `citation-management` were reviewed and NOT enabled: their scripts import `requests`, which the pinned branch sandbox image does not contain, and installing it at run time is forbidden by the branch prompt. Re-evaluate only with a sandbox image that bundles it.
- `prompts/analyze.md` has one added rule (state small samples or many missing values in the finding). Revert by deleting that sentence.
