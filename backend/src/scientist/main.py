import asyncio
import logging
from contextlib import asynccontextmanager, suppress

import httpx
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from scientist import store as store_mod, usage
from scientist.config import get_settings
from scientist.gate import RunGate
from scientist.object_store import ObjectStore, create_store
from scientist.sandbox import sweep_sandboxes
from scientist.hermes import BranchRunner, HermesRuntime, sweep_containers
from scientist.routes_ask import router as ask_router
from scientist.routes_analyze import router as analyze_router
from scientist.routes_files import router as files_router
from scientist.routes_reports import router as reports_router
from scientist.routes_preview import router as preview_router
from scientist.preview_store import PreviewStore
from scientist.db import Database, open_database
from scientist.routes_store import router as store_router
from scientist.store import Bus, Store
from sqlalchemy.exc import DBAPIError
from fastapi.responses import JSONResponse

log = logging.getLogger(__name__)


def create_app(*, runner: BranchRunner | None = None, client: httpx.AsyncClient | None = None,
               store: ObjectStore | None = None, db: Database | None = None) -> FastAPI:
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
            purger = asyncio.create_task(_purge_hourly(app)) if app.state.data else None
            try:
                yield
            finally:
                if purger:
                    purger.cancel()
                    with suppress(asyncio.CancelledError):
                        await purger
                await rt.close()
                await usage.drain()  # in-flight usage rows land before the pool closes
                if app.state.db:
                    await app.state.db.close()
                if runner is None:
                    sweep_containers()
                sweep_sandboxes()

    async def _purge_hourly(app: FastAPI) -> None:
        while True:
            await asyncio.sleep(3600)
            try:
                await app.state.data.purge()
                await app.state.data.purge_usage()
            except Exception:
                log.exception("trash purge failed")

    store_mod.MAX_JSON_BYTES[0] = settings.store_max_turn_json_bytes
    app = FastAPI(title="scientist", lifespan=lifespan)
    app.state.db = db or open_database(settings)
    app.state.data = Store(app.state.db, Bus(), settings, lambda: app.state.store) if app.state.db else None

    @app.exception_handler(DBAPIError)
    async def db_down(_, e):  # unreachable, not migrated, timed out: the store is unavailable, not the app broken
        log.warning("store database error: %s", type(e.orig).__name__)
        return JSONResponse({"detail": "database unavailable"}, status_code=503)
  # None = database disabled; the engine connects lazily, so a down DB cannot break boot
    app.state.settings, app.state.gate = settings, RunGate(settings.max_concurrent_runs)
    app.state.analyze_gate = RunGate(settings.sandbox_max_concurrent)
    app.state.preview_gate = RunGate(settings.preview_max_concurrent)
    app.state.translate_gate = RunGate(2)
    app.state.previews = PreviewStore(settings.preview_max_entries, settings.preview_ttl_seconds)
    app.state.store = store
    app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origins,
                       allow_methods=["*"], allow_headers=["*"])
    app.include_router(ask_router)
    app.include_router(files_router)
    app.include_router(analyze_router)
    app.include_router(reports_router)
    app.include_router(preview_router)
    app.include_router(store_router)

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
        if app.state.db is None:
            h["db"] = "disabled"
        else:  # never fails the endpoint; bounded so the container healthcheck (2 s) is not held by a dead DB
            try:
                st = await asyncio.wait_for(app.state.db.schema_state(), 1.5)
            except Exception:
                st = "unreachable"
            h["db"] = {"ok": "ok", "behind": "behind"}.get(st, "unavailable")
        if not settings.sandbox_enabled:
            h["analysis"] = "disabled"
        return h

    return app
