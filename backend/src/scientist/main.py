from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from scientist.config import get_settings


def create_app() -> FastAPI:
    app = FastAPI(title="scientist")
    app.add_middleware(CORSMiddleware, allow_origins=get_settings().cors_origins,
                       allow_methods=["*"], allow_headers=["*"])

    @app.get("/v1/health")
    async def health():
        return {"status": "ok"}

    return app
