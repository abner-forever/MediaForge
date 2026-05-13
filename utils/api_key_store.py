"""本地 API Key 存储，替代环境变量方式管理多供应商 key。"""

import json
from pathlib import Path
from typing import Dict

KEYS_PATH = Path(__file__).resolve().parent.parent / "data" / "state" / "api_keys.json"


def read_api_keys() -> Dict[str, str]:
    """读取所有 API key，返回 {provider: key}。"""
    if not KEYS_PATH.exists():
        return {}
    try:
        data = json.loads(KEYS_PATH.read_text(encoding="utf-8"))
        return {k: v for k, v in data.items() if v}
    except Exception:
        return {}


def get_api_key(provider: str) -> str:
    """获取指定供应商的 key。"""
    return read_api_keys().get(provider, "")


def save_api_keys(keys: Dict[str, str]) -> None:
    """合并写入 API key，只保存非空值。"""
    existing = read_api_keys()
    for k, v in keys.items():
        if v:
            existing[k] = v
        else:
            existing.pop(k, None)
    KEYS_PATH.parent.mkdir(parents=True, exist_ok=True)
    KEYS_PATH.write_text(
        json.dumps(existing, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
