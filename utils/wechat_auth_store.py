"""微信公众号多账号注册表本地存储。

每个账号有：
  - account_id（UUID）
  - name（用户自定义名称）
  - created_at / last_used 时间戳
  - 独立的 Chromium 浏览器配置文件目录
  - 独立的 Playwright storage_state 文件

数据存储在 data/state/wechat_accounts/ 下：
  - wechat_accounts.json — 账号注册表（索引）
  - {account_id}/chromium_profile/ — 浏览器配置
  - {account_id}/state.json — storage_state
"""

from __future__ import annotations

import json
import shutil
import uuid
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Tuple

from config import DATA_DIR

ACCOUNTS_INDEX_PATH = DATA_DIR / "state" / "wechat_accounts.json"
ACCOUNTS_DATA_DIR = DATA_DIR / "state" / "wechat_accounts"


def _ensure_index() -> List[Dict]:
    if not ACCOUNTS_INDEX_PATH.exists():
        return []
    try:
        data = json.loads(ACCOUNTS_INDEX_PATH.read_text(encoding="utf-8"))
        return data if isinstance(data, list) else []
    except Exception:
        return []


def _save_index(accounts: List[Dict]) -> None:
    ACCOUNTS_INDEX_PATH.parent.mkdir(parents=True, exist_ok=True)
    ACCOUNTS_INDEX_PATH.write_text(
        json.dumps(accounts, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def list_accounts() -> List[Dict]:
    """返回所有账号列表，附加 logged_in 和 last_used 信息。"""
    accounts = _ensure_index()
    result = []
    for acc in accounts:
        aid = acc.get("account_id", "")
        state_path = ACCOUNTS_DATA_DIR / aid / "state.json"
        result.append({
            "account_id": aid,
            "name": acc.get("name", ""),
            "created_at": acc.get("created_at", ""),
            "last_used": acc.get("last_used", ""),
            "logged_in": state_path.exists(),
        })
    return result


def get_account(account_id: str) -> Optional[Dict]:
    for acc in _ensure_index():
        if acc.get("account_id") == account_id:
            return dict(acc)
    return None


def add_account(name: str) -> Dict:
    """添加新公众号账号，创建独立数据目录。"""
    account_id = str(uuid.uuid4())
    now = datetime.now().isoformat()
    account = {
        "account_id": account_id,
        "name": name.strip(),
        "created_at": now,
        "last_used": "",
    }
    accounts = _ensure_index()
    accounts.append(account)
    _save_index(accounts)

    # 创建账号独立目录
    acc_dir = ACCOUNTS_DATA_DIR / account_id
    acc_dir.mkdir(parents=True, exist_ok=True)

    return {
        "account_id": account_id,
        "name": account["name"],
        "created_at": now,
        "last_used": "",
        "logged_in": False,
    }


def remove_account(account_id: str) -> bool:
    """删除账号及其所有数据。"""
    accounts = _ensure_index()
    new_accounts = [a for a in accounts if a.get("account_id") != account_id]
    if len(new_accounts) == len(accounts):
        return False  # 未找到
    _save_index(new_accounts)

    # 删除账号数据目录
    acc_dir = ACCOUNTS_DATA_DIR / account_id
    if acc_dir.exists():
        shutil.rmtree(str(acc_dir))
    return True


def update_account(account_id: str, **kwargs) -> bool:
    """更新账号字段（如 last_used）。"""
    accounts = _ensure_index()
    for acc in accounts:
        if acc.get("account_id") == account_id:
            for k, v in kwargs.items():
                if v is not None:
                    acc[k] = v
            _save_index(accounts)
            return True
    return False


def get_account_paths(account_id: str) -> Tuple[Path, Path]:
    """返回 (profile_dir, state_path) 元组。"""
    base = ACCOUNTS_DATA_DIR / account_id
    profile_dir = base / "chromium_profile"
    state_path = base / "state.json"
    return profile_dir, state_path
