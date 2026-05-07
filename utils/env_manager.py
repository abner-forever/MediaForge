"""安全读写 .env 文件的工具模块。"""

from __future__ import annotations

from pathlib import Path
from typing import Dict

from config import BASE_DIR

ENV_PATH = BASE_DIR / ".env"


def read_env() -> Dict[str, str]:
    """读取 .env 文件为字典，保留所有 key（包括空值）。"""
    if not ENV_PATH.exists():
        return {}
    result: Dict[str, str] = {}
    for line in ENV_PATH.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if "=" not in line:
            continue
        key, _, value = line.partition("=")
        result[key.strip()] = value.strip()
    return result


def write_env(updates: Dict[str, str]) -> None:
    """将更新写入 .env 文件，保留注释和格式。"""
    if not ENV_PATH.exists():
        lines = []
    else:
        lines = ENV_PATH.read_text(encoding="utf-8").splitlines(keepends=True)

    existing_keys: set[str] = set()
    new_lines: list[str] = []

    for line in lines:
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            new_lines.append(line.rstrip("\n"))
            continue
        if "=" not in stripped:
            new_lines.append(line.rstrip("\n"))
            continue
        key, _, _ = stripped.partition("=")
        key = key.strip()
        existing_keys.add(key)
        if key in updates:
            new_lines.append(f"{key}={updates[key]}")
        else:
            new_lines.append(line.rstrip("\n"))

    for key, value in updates.items():
        if key not in existing_keys:
            new_lines.append(f"{key}={value}")

    ENV_PATH.write_text("\n".join(new_lines) + "\n", encoding="utf-8")


def update_env(updates: Dict[str, str]) -> None:
    """写入 .env 并重载配置。"""
    from config import reload_settings
    write_env(updates)
    reload_settings()
