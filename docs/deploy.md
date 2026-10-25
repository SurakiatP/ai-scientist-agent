# Deploy (single VM, Docker Compose)

Stack (`infra/compose.yaml`): `caddy` (80/443, automatic TLS) -> `frontend` (3000) and `backend` (8000, routes `/v1/*`); `minio` on 127.0.0.1 only. Only 22/80/443 are public.

## 1. VM
Ubuntu 24.04. Use `infra/deploy/cloud-init.yaml` (edit SSH key, repo, tag) or install Docker + compose plugin by hand. Point a DNS A record for your domain at the VM.

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

## 6. Backup / restore
A systemd timer runs `backup.sh` daily at 03:00: tar of the MinIO volume into `/var/backups/ai-scientist/`, 7-day retention. Copy off-site yourself (rsync). Restore: stop minio, `docker run --rm -v ai-scientist_minio_data:/data -v /var/backups/ai-scientist:/in busybox tar xzf /in/<file> -C /data`, start minio.

## 7. Operations
Logs: `docker compose -f /opt/ai-scientist/current/infra/compose.yaml logs -f backend`. Local TLS rehearsal: set `CADDY_TLS=tls internal` in `app.env`.
