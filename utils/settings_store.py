"""应用配置本地存储（JSON），替代 .env 用于桌面 UI 可配置项。

管理三类配置：
  - 通用设置：PLATFORM, POST_LIMIT, MATERIALS_PATH 等
  - 平台设置：WEIBO_FETCH_MODE, TOUTIAO_COOKIE 等
  - 水印参数：WATERMARK_FILTER, WATERMARK_CORNER_RATIO 等
"""

from __future__ import annotations

import json
from typing import Any, Dict

from config import DATA_DIR

SETTINGS_PATH = DATA_DIR / "state" / "settings.json"

# 已知的布尔值键名（保存时转为字符串 "true"/"false"）
_BOOL_KEYS = {
    "WATERMARK_FILTER", "WATERMARK_STRICT_MODE", "ALLOW_WATERMARK_FALLBACK",
    "REQUIRE_CONFIRM",
}

# 已知的数值键名（保存时转为字符串）
_NUM_KEYS = {
    "POST_LIMIT", "WEIBO_PAGES", "PUBLISH_INTERVAL_SECONDS", "REQUEST_TIMEOUT",
    "RETRY_TIMES", "MIN_CLEAN_IMAGES", "WATERMARK_CORNER_RATIO", "WATERMARK_BOTTOM_RATIO",
}


def read_settings() -> Dict[str, str]:
    """读取所有配置，统一返回字符串格式。空值被过滤。"""
    if not SETTINGS_PATH.exists():
        return {}
    try:
        data = json.loads(SETTINGS_PATH.read_text(encoding="utf-8"))
        # 统一转字符串（JSON 可能存了 bool/number）
        result: Dict[str, str] = {}
        for k, v in data.items():
            if v is None or v == "":
                continue
            if isinstance(v, bool):
                result[k] = "true" if v else "false"
            elif isinstance(v, (int, float)):
                result[k] = str(v)
            else:
                result[k] = str(v)
        return result
    except Exception:
        return {}


def write_settings(updates: Dict[str, str]) -> None:
    """合并写入配置。"""
    data = read_settings()
    for k, v in updates.items():
        if v is not None and v != "":
            data[k] = str(v)
        else:
            data.pop(k, None)
    SETTINGS_PATH.parent.mkdir(parents=True, exist_ok=True)
    SETTINGS_PATH.write_text(
        json.dumps(data, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def clear_settings() -> None:
    """清空所有配置。"""
    if SETTINGS_PATH.exists():
        SETTINGS_PATH.write_text("{}\n", encoding="utf-8")
