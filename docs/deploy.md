# Deploy (single VM, Docker Compose)

Stack (`infra/compose.yaml`): `caddy` (80/443, automatic TLS) -> `frontend` (3000) and `backend` (8000, routes `/v1/*`); `minio` on 127.0.0.1 only. Only 22/80/443 are public.

## 1. VM
Ubuntu 24.04. Use `infra/deploy/cloud-init.yaml` (edit SSH key, repo, tag) or install Docker + compose plugin by hand. Point DNS A records for your domain **and `files.<domain>`** at the VM (`files.` serves presigned file previews from MinIO through Caddy, GET/HEAD only; `MINIO_PUBLIC_ENDPOINT` in `app.env` must be `https://files.<domain>`). Set `PRESIGN_ENABLED=false` to proxy previews through the backend instead.

## 2. Secrets
`infra/deploy/bootstrap.sh` (`sudo`) creates `/etc/ai-scientist/private/` with random `minio-access-key` / `minio-secret-key` (mode 0640, group 10001) and copies `app.env.example` to `app.env` (0600). Edit `app.env`: set `DOMAIN`, `ACME_EMAIL`, `OPENROUTER_API_KEY`. The key lives only there, never in an image or the repo. `deploy.sh` refuses to run while `CHANGE_ME` remains.

## 3. Hermes runtime
The backend runs research branches through Hermes (see `infra/hermes/setup.md`). Prepare the pinned checkout into `/var/lib/ai-scientist/cache` (mounted read-only at `~/.cache/scientist`). Branch sandboxes need a Docker runner; the backend gets no host Docker socket. An isolated `analysis-sandbox` service is a commented placeholder in the compose file and is not built yet. Until it exists, `SANDBOX_ENABLED=false` (set in `app.env.example`) turns data analysis off: `/v1/async/analyze` returns 503 and `/v1/health` reports `analysis: disabled`. Do not mount `/var/run/docker.sock` into the backend to work around this: it makes any backend compromise root on the host.

## 4. Deploy a published tag
```sh
sudo ai-scientist-deploy v0.1.0      # installed by bootstrap.sh; same as infra/deploy/deploy.sh
```
Root is required (`app.env` is root 0600): bootstrap runs with `sudo`, and the `deploy` user may sudo only `ai-scientist-deploy`. Accepted tags: `v*`, `sha-<7 hex>`, `develop`, and only if the Images workflow published `{backend,frontend}:<tag>` (checked with `docker manifest inspect`). The Images workflow publishes `develop` and `sha-<short>` on pushes to `develop`, and `:<tag>` on `v*` tag pushes. The script checks out that ref to `/opt/ai-scientist/releases/<tag>`, pulls the images, runs `docker compose up -d`, waits for backend and MinIO health, then moves `current` atomically. Any failure after `up -d` (including a failed health check) brings the previous release back and re-checks its health; if that also fails it says so and exits 1.

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
Foundation only: the app creates one table (`app_meta`) so far and keeps working without a database (`DATABASE_URL` empty gives `db: disabled` in `/v1/health`; `unavailable` and `behind` never fail the endpoint). Compose runs `postgres` (image pinned by the multi-arch index digest of `postgres:17-alpine`, 17.11) on the internal-only `db` network with no published port, `cap_drop ALL` plus the five capabilities its entrypoint needs, `no-new-privileges`, 1 GB / 200 pids limits, scram auth everywhere (no trust, not even on the local socket) and idle/idle-in-transaction timeouts. The backend uses a dedicated non-superuser role `app` (created once by `infra/deploy/postgres-init.sh`) with a per-connection `statement_timeout`; the superuser password (`postgres-password`) is only mounted into the postgres container. `bootstrap.sh` generates both secrets; re-run it once on an existing VM before the first deploy of a release that has Postgres. **The app has no login: never publish the database port or put it on an external network.** Migrate by hand: `docker compose -f infra/compose.yaml --env-file <env> run --rm migrate`.

## 6c. Shared data (Postgres)

- The `/v1/store/*` routes (chats, projects, messages, file list, trash, usage) need `DATABASE_URL` and migration `0002`; without them they answer 503 `database not configured` and the web app falls back to browser-only storage (it checks `/v1/health` → `db`).
- **There is no login.** Anyone who can reach the server IP can read, edit and delete everything, including "delete all chats". Keep the app behind the internal network or a VPN and never expose Postgres or MinIO publicly.
- Deleted chats, projects and files go to the trash for `TRASH_DAYS` (7). The purge runs hourly (and on `POST /v1/store/trash/purge`); a file's MinIO object is removed only when it is purged.
- Writes are rate limited per client IP (`STORE_WRITE_RATE_PER_MIN`). Behind a reverse proxy every caller shares the proxy's IP unless you set `FORWARDED_ALLOW_IPS` to the proxy's address/CIDR (uvicorn reads it; compose passes it through, default `127.0.0.1`).
- Store writes must be `Content-Type: application/json` (415 otherwise): this blocks cross-site form/`text/plain` posts. `ALLOWED_ORIGINS` (compose sets it to `https://$DOMAIN`) additionally rejects writes carrying another `Origin` (403); empty = no check.
- Caps: a snapshot returns the newest `MAX_TURNS_PER_SESSION` (50) turns per session, a session holds at most `STORE_MAX_TURNS` (500), and each turn JSON field is limited to `STORE_MAX_TURN_JSON_BYTES`. Turns removed by an edit are tombstoned (answer 410 to stale writers) until the trash purge; `usage_events` older than `USAGE_RETENTION_DAYS` (180) are deleted hourly.
- The live change feed (`GET /v1/store/events`) is in-process: run **one backend worker**.
- The dataset lives only in Postgres: keep the daily `pg_dump` backup (section 6) and test a restore.
- `usage_events` (timings, token counts, cost) stores no question text.

## 7. Operations
Logs: `docker compose -f /opt/ai-scientist/current/infra/compose.yaml logs -f backend`. Local TLS rehearsal: set `CADDY_TLS=tls internal` in `app.env`.

## 8. Skills and prompt switches

- `ENABLED_SKILLS` (app.env / `.env`) is the allowlist of K-Dense skills copied into the Hermes home when the backend starts; default `["paper-lookup"]`. Unknown names are rejected at start. Turn a skill off by removing it from the list and restarting the backend (the generated `hermes-home` is rebuilt each start).
- `literature-review` and `citation-management` were reviewed and NOT enabled: their scripts import `requests`, which the pinned branch sandbox image does not contain, and installing it at run time is forbidden by the branch prompt. Re-evaluate only with a sandbox image that bundles it.
- `prompts/analyze.md` has one added rule (state small samples or many missing values in the finding). Revert by deleting that sentence.
