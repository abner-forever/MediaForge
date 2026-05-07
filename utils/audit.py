import json
from datetime import datetime
from pathlib import Path
from typing import Any, Dict

from config import LOG_DIR


def create_run_log_path(run_id: str) -> Path:
    run_dir = LOG_DIR / "runs"
    run_dir.mkdir(parents=True, exist_ok=True)
    return run_dir / f"{run_id}.jsonl"


def append_audit(path: Path, event: str, payload: Dict[str, Any]) -> None:
    item = {
        "ts": datetime.utcnow().isoformat() + "Z",
        "event": event,
        "payload": payload,
    }
    with path.open("a", encoding="utf-8") as f:
        f.write(json.dumps(item, ensure_ascii=False) + "\n")
