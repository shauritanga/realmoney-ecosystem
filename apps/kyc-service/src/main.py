from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pathlib import Path

from .config import settings
from .routes import bridge, capture

app = FastAPI(
    title="RealMoney KYC Verification Service",
    version="1.0.0",
    description="Self-hosted Document Verification and Liveness Engine for RealMoney Tanzania"
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Static files for capture UI
STATIC_DIR = Path(__file__).parent / "static"
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

# Include Routers
app.include_router(bridge.router)
app.include_router(capture.router)

@app.get("/health", tags=["Health"])
def health_check():
    return {
        "status": "ok",
        "service": "kyc-service",
        "capture_base_url": settings.CAPTURE_BASE_URL,
        "dev_mode": settings.DEV_MODE,
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("src.main:app", host=settings.HOST, port=settings.PORT, reload=True)
