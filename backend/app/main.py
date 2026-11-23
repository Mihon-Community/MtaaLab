"""FastAPI entry point; backend is the trusted boundary for authoritative decisions."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.decisions import router as decisions_router
from app.api.missions import router as missions_router
from app.api.reports import router as reports_router
from app.api.schemas import HealthResponse
from app.api.simulations import router as simulations_router
from app.api.webhooks import router as webhooks_router
from app.config import settings

app = FastAPI(title="MtaaLab API", version="0.2.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(missions_router)
app.include_router(simulations_router)
app.include_router(decisions_router)
app.include_router(reports_router)
app.include_router(webhooks_router)


@app.get("/api/health", response_model=HealthResponse)
def health() -> HealthResponse:
    """Expose a dependency-free health check for local setup and CI."""
    return HealthResponse(status="ok")
