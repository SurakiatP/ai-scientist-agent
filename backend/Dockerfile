# Build from the repo root: docker build -f backend/Dockerfile .
FROM ghcr.io/astral-sh/uv:0.8.17 AS uv

FROM python:3.12.11-slim-bookworm
COPY --from=uv /uv /usr/local/bin/uv
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy UV_PYTHON_DOWNLOADS=never \
    PATH="/app/backend/.venv/bin:$PATH" HOME=/home/app PYTHONUNBUFFERED=1
# git: HermesRuntime verifies the pinned Hermes/skills checkouts with `git rev-parse` / `git status`
RUN apt-get update && apt-get install -y --no-install-recommends git \
 && rm -rf /var/lib/apt/lists/*
RUN useradd --uid 10001 --create-home --home-dir /home/app --shell /usr/sbin/nologin app
# Layout matters: hermes.py resolves ROOT = parents[3] of the package -> /app, and runs /app/infra/hermes/native_bridge.py
WORKDIR /app/backend
COPY backend/pyproject.toml backend/uv.lock ./
RUN uv sync --locked --no-dev --no-install-project
COPY backend/src ./src
COPY backend/alembic.ini ./alembic.ini
COPY backend/migrations ./migrations
COPY infra/hermes /app/infra/hermes
RUN uv sync --locked --no-dev && chown -R app:app /app
USER 10001:10001
EXPOSE 8000
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=6 \
  CMD python -c "import urllib.request as u; u.urlopen('http://127.0.0.1:8000/v1/health', timeout=2)"
CMD ["uvicorn", "--factory", "scientist.main:create_app", "--host", "0.0.0.0", "--port", "8000"]
