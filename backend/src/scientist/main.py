from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from scientist.config import get_settings
from scientist.gate import RunGate
from scientist.hermes import BranchRunner, HermesRuntime, sweep_containers
from scientist.routes_ask import router as ask_router


def create_app(*, runner: BranchRunner | None = None, client: httpx.AsyncClient | None = None) -> FastAPI:
    """runner/client replace the real Hermes runtime and citation-check client (tests).
    Run a single worker: the runtime owns ~/.cache/scientist/hermes-home and the run cap is per process."""
    settings = get_settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        if runner is None:
            sweep_containers()
        rt = runner or HermesRuntime(settings)
        async with client or httpx.AsyncClient() as c:
            app.state.runner, app.state.client = rt, c
            try:
                yield
            finally:
                await rt.close()
                if runner is None:
                    sweep_containers()

    app = FastAPI(title="scientist", lifespan=lifespan)
    app.state.settings, app.state.gate = settings, RunGate(settings.max_concurrent_runs)
    app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origins,
                       allow_methods=["*"], allow_headers=["*"])
    app.include_router(ask_router)

    @app.get("/v1/health")
    async def health():
        return {"status": "ok"}

    return app
