import json
import os
from pathlib import Path
from typing import Dict, Any, Optional, List
from datetime import datetime, timezone, timedelta
from .config import settings

class SessionStore:
    def __init__(self, data_dir: Path):
        self.data_dir = data_dir
        self.sessions_dir = self.data_dir / "sessions"
        self.sessions_dir.mkdir(parents=True, exist_ok=True)
        self._memory_cache: Dict[str, Dict[str, Any]] = {}

    def _session_path(self, session_id: str) -> Path:
        return self.sessions_dir / f"{session_id}.json"

    def _session_assets_dir(self, session_id: str) -> Path:
        p = self.sessions_dir / session_id
        p.mkdir(parents=True, exist_ok=True)
        return p

    def save_session(self, session_data: Dict[str, Any]) -> None:
        session_id = session_data["sessionId"]
        self._memory_cache[session_id] = session_data
        
        path = self._session_path(session_id)
        with open(path, "w", encoding="utf-8") as f:
            json.dump(session_data, f, indent=2)

    def get_session(self, session_id: str) -> Optional[Dict[str, Any]]:
        if session_id in self._memory_cache:
            return self._memory_cache[session_id]
            
        path = self._session_path(session_id)
        if path.exists():
            try:
                with open(path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    self._memory_cache[session_id] = data
                    return data
            except Exception:
                return None
        return None

    def save_asset(self, session_id: str, asset_name: str, data: bytes) -> str:
        assets_dir = self._session_assets_dir(session_id)
        file_path = assets_dir / asset_name
        with open(file_path, "wb") as f:
            f.write(data)
        return str(file_path)

    def get_asset_bytes(self, session_id: str, asset_name: str) -> Optional[bytes]:
        assets_dir = self._session_assets_dir(session_id)
        file_path = assets_dir / asset_name
        if file_path.exists():
            with open(file_path, "rb") as f:
                return f.read()
        return None

    def list_selfie_assets(self, session_id: str) -> List[bytes]:
        assets_dir = self._session_assets_dir(session_id)
        selfies = sorted(assets_dir.glob("selfie_*.jpg"))
        frames = []
        for s in selfies:
            with open(s, "rb") as f:
                frames.append(f.read())
        return frames

store = SessionStore(settings.DATA_DIR)
