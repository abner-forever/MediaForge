"""微博鉴权信息本地存储（Cookie/UID/用户名/头像），独立于 .env 文件以支持快速清空。"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Dict

AUTH_PATH = Path(__file__).resolve().parent.parent / "data" / "state" / "weibo_auth.json"


def read_weibo_auth() -> Dict[str, str]:
    """读取微博鉴权信息，返回 {cookie, uid, screen_name, avatar}。"""
    if not AUTH_PATH.exists():
        return {}
    try:
        data = json.loads(AUTH_PATH.read_text(encoding="utf-8"))
        return {k: v for k, v in data.items() if v}
    except Exception:
        return {}


def get_weibo_cookie() -> str:
    return read_weibo_auth().get("cookie", "")


def get_weibo_uid() -> str:
    return read_weibo_auth().get("uid", "")


def get_weibo_avatar() -> str:
    return read_weibo_auth().get("avatar", "")


def write_weibo_auth(cookie: str = "", uid: str = "", screen_name: str = "", avatar: str = "") -> None:
    """写入微博鉴权信息。空值会被移除。"""
    data = read_weibo_auth()
    for k, v in [("cookie", cookie), ("uid", uid), ("screen_name", screen_name), ("avatar", avatar)]:
        if v:
            data[k] = v
        else:
            data.pop(k, None)
    AUTH_PATH.parent.mkdir(parents=True, exist_ok=True)
    AUTH_PATH.write_text(
        json.dumps(data, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def clear_weibo_auth() -> None:
    """清空所有微博鉴权信息。"""
    if AUTH_PATH.exists():
        AUTH_PATH.write_text("{}\n", encoding="utf-8")
