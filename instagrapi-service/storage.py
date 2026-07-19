import json
import os
import uuid
from pathlib import Path
from typing import Optional

# Each session's instagrapi settings (device fingerprint + auth cookies) are
# persisted here and reused on every request for that session — never
# regenerated per-call. A fresh, unpinned device fingerprint on every request
# is what made the old aiograpi-rest sidecar look like a brand-new device to
# Instagram on every login attempt.
DATA_DIR = Path(os.getenv("INSTAGRAPI_DATA_DIR", "/data"))
DATA_DIR.mkdir(parents=True, exist_ok=True)


def new_session_id() -> str:
    return uuid.uuid4().hex


def _session_path(session_id: str) -> Path:
    return DATA_DIR / f"{session_id}.json"


def save_settings(session_id: str, settings: dict) -> None:
    _session_path(session_id).write_text(json.dumps(settings))


def load_settings(session_id: str) -> Optional[dict]:
    path = _session_path(session_id)
    if not path.exists():
        return None
    return json.loads(path.read_text())


def delete_session(session_id: str) -> None:
    path = _session_path(session_id)
    if path.exists():
        path.unlink()


def list_sessions() -> list[str]:
    return [path.stem for path in DATA_DIR.glob("*.json")]
