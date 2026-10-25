import asyncio
import logging
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from scientist.config import get_settings
from scientist.gate import RunGate
from scientist.object_store import ObjectStore, create_store
from scientist.sandbox import sweep_sandboxes
from scientist.hermes import BranchRunner, HermesRuntime, sweep_containers
from scientist.routes_ask import router as ask_router
from scientist.routes_analyze import router as analyze_router
from scientist.routes_files import router as files_router
from scientist.routes_reports import router as reports_router

log = logging.getLogger(__name__)


def create_app(*, runner: BranchRunner | None = None, client: httpx.AsyncClient | None = None,
               store: ObjectStore | None = None) -> FastAPI:
    """runner/client/store replace the real Hermes runtime, citation-check client and MinIO store (tests).
    Run a single worker: the runtime owns ~/.cache/scientist/hermes-home and the run cap is per process."""
    settings = get_settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        if runner is None:
            sweep_containers()
        rt = runner or HermesRuntime(settings)
        async with client or httpx.AsyncClient() as c:
            app.state.runner, app.state.client = rt, c
            app.state.store = store
            if store is None and settings.minio_endpoint:  # MinIO down at boot: files and health answer 503
                try:
                    app.state.store = await asyncio.to_thread(create_store, settings)
                except Exception:
                    log.exception("object store unavailable")
            try:
                yield
            finally:
                await rt.close()
                if runner is None:
                    sweep_containers()
                sweep_sandboxes()

    app = FastAPI(title="scientist", lifespan=lifespan)
    app.state.settings, app.state.gate = settings, RunGate(settings.max_concurrent_runs)
    app.state.analyze_gate = RunGate(settings.sandbox_max_concurrent)
    app.state.store = store
    app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origins,
                       allow_methods=["*"], allow_headers=["*"])
    app.include_router(ask_router)
    app.include_router(files_router)
    app.include_router(analyze_router)
    app.include_router(reports_router)

    @app.get("/v1/health")
    async def health():
        h = {"status": "ok"}
        if not settings.minio_endpoint and store is None:  # uploads not configured
            pass
        else:
            try:  # research chat works without file storage, so a down store degrades `files`, not the app
                await app.state.store.ping()
                h["files"] = "ok"
            except Exception:
                h["files"] = "unavailable"
        if not settings.sandbox_enabled:
            h["analysis"] = "disabled"
        return h

    return app
