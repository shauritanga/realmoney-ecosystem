import os
from pathlib import Path

class Settings:
    HOST: str = os.getenv("KYC_HOST", "0.0.0.0")
    PORT: int = int(os.getenv("KYC_PORT", "8000"))
    BRIDGE_TOKEN: str = os.getenv("VERIFICATION_BRIDGE_TOKEN", "realmoney-bridge-secret-key-change-me")
    
    # Must be HTTPS and match IDENTITY_CAPTURE_HOSTS configured in backend
    CAPTURE_BASE_URL: str = os.getenv("CAPTURE_BASE_URL", "https://capture.realmoney.tz").rstrip("/")
    
    DATA_DIR: Path = Path(os.getenv("KYC_DATA_DIR", "./data"))
    
    # Quality and biometric thresholds
    BLUR_THRESHOLD: float = float(os.getenv("BLUR_THRESHOLD", "80.0"))
    GLARE_RATIO_THRESHOLD: float = float(os.getenv("GLARE_RATIO_THRESHOLD", "0.10"))
    LIVENESS_THRESHOLD: float = float(os.getenv("LIVENESS_THRESHOLD", "0.60"))
    FACE_MATCH_THRESHOLD: float = float(os.getenv("FACE_MATCH_THRESHOLD", "0.65"))

    # When enabled, allows manual override / developer test simulations
    DEV_MODE: bool = os.getenv("KYC_DEV_MODE", "false").lower() == "true"

settings = Settings()
settings.DATA_DIR.mkdir(parents=True, exist_ok=True)
