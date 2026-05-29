"""微信公众号多账号管理 API 路由。"""

from __future__ import annotations

import asyncio
import logging
import sys
from datetime import datetime
from pathlib import Path
from typing import Dict

from fastapi import APIRouter, HTTPException

# 确保项目根目录在 sys.path 中
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from desktop.app_state import app_state
from desktop.sse_helpers import create_sse_response

router = APIRouter(tags=["wechat"])
logger = logging.getLogger(__name__)


@router.get("/api/wechat/accounts")
async def wechat_list_accounts():
    """列出所有微信公众号账号及登录状态。"""
    from utils.wechat_auth_store import list_accounts
    return {"accounts": list_accounts()}


@router.post("/api/wechat/accounts")
async def wechat_add_account(data: Dict[str, str]):
    """添加新公众号账号。"""
    name = (data.get("name") or "").strip()
    if not name:
        raise HTTPException(400, "账号名称不能为空")
    from utils.wechat_auth_store import add_account
    account = add_account(name)
    return {"success": True, "account": account}


@router.delete("/api/wechat/accounts/{account_id}")
async def wechat_remove_account(account_id: str):
    """删除公众号账号及其所有数据。"""
    from utils.wechat_auth_store import remove_account
    if not remove_account(account_id):
        raise HTTPException(404, "账号不存在")
    return {"success": True}


@router.get("/api/wechat/accounts/{account_id}/status")
async def wechat_account_status(account_id: str):
    """检查指定账号的登录状态。"""
    from utils.wechat_auth_store import get_account, validate_login_state
    account = get_account(account_id)
    if not account:
        raise HTTPException(404, "账号不存在")
    return {"logged_in": validate_login_state(account_id), "name": account.get("name", "")}


@router.get("/api/wechat/accounts/{account_id}/login")
async def wechat_account_login(account_id: str):
    """启动浏览器登录指定公众号。通过 SSE 流式返回登录状态。"""
    from utils.wechat_auth_store import get_account, get_account_paths
    account = get_account(account_id)
    if not account:
        raise HTTPException(404, "账号不存在")

    profile_dir, state_path = get_account_paths(account_id)

    def _task(msg_queue):
        from services.wechat import _ensure_login, _looks_logged_in
        from playwright.sync_api import sync_playwright

        def _emit(msg: str) -> None:
            msg_queue.put(("progress", msg))

        profile_dir.mkdir(parents=True, exist_ok=True)
        state_path.parent.mkdir(parents=True, exist_ok=True)
        try:
            with sync_playwright() as p:
                context = p.chromium.launch_persistent_context(
                    user_data_dir=str(profile_dir),
                    headless=False,
                    channel="chromium",
                )
                page = context.new_page()
                page.goto("https://mp.weixin.qq.com/", wait_until="domcontentloaded")
                _emit("正在登录微信公众号...")

                if _looks_logged_in(page):
                    _emit("检测到已登录，无需扫码")
                else:
                    _emit("请在弹出的浏览器窗口中扫码登录")
                    _ensure_login(page, state_path=state_path,
                                  on_scan_needed=lambda: _emit("等待扫码中，请在浏览器窗口完成扫码"))
                    _emit("登录成功")

                context.storage_state(path=str(state_path))
                from utils.wechat_auth_store import update_account
                update_account(account_id, last_used=datetime.now().isoformat())
                context.close()

            msg_queue.put(("done", {"message": "登录完成"}))
        except Exception as e:
            msg_queue.put(("error", str(e)))

    return create_sse_response(_task)


@router.get("/api/wechat/accounts/{account_id}/sync-effects")
async def sync_effects(account_id: str, pages: int = 1):
    """从公众号后台抓取已发布文章的真实阅读数据，同步到本地效果记录。通过 SSE 流式返回进度。"""
    from utils.wechat_auth_store import get_account
    pages = max(1, min(50, int(pages)))
    account = get_account(account_id)
    if not account:
        raise HTTPException(404, "账号不存在")

    def _task(msg_queue):
        from services.wechat.fetcher import fetch_published_articles
        fetch_published_articles(account_id, msg_queue, pages=pages)

    return create_sse_response(_task)


@router.post("/api/wechat/accounts/{account_id}/logout")
async def wechat_account_logout(account_id: str):
    """清除指定公众号的登录态。"""
    from utils.wechat_auth_store import get_account, get_account_paths
    account = get_account(account_id)
    if not account:
        raise HTTPException(404, "账号不存在")
    profile_dir, state_path = get_account_paths(account_id)

    def _clear_browser_state():
        if not profile_dir.exists():
            return
        try:
            from playwright.sync_api import sync_playwright
            with sync_playwright() as p:
                context = p.chromium.launch_persistent_context(
                    user_data_dir=str(profile_dir),
                    headless=True,
                    channel="chromium",
                )
                context.clear_cookies()
                context.close()
        except Exception as e:
            logger.debug("清除浏览器状态失败: %s", e)

    if profile_dir.exists():
        await asyncio.to_thread(_clear_browser_state)

    if state_path.exists():
        state_path.unlink()
    return {"success": True}


@router.post("/api/wechat/accounts/{account_id}/default")
async def wechat_set_default_account(account_id: str):
    """设置指定账号为默认公众号。"""
    from utils.wechat_auth_store import set_default_account
    if not set_default_account(account_id):
        raise HTTPException(404, "账号不存在")
    return {"success": True}


@router.get("/api/wechat/accounts/history")
async def all_accounts_history():
    """聚合所有账号的发布历史。"""
    items = _collect_publish_history()
    return {"items": items, "total": len(items)}


@router.get("/api/wechat/accounts/{account_id}/history")
async def account_history(account_id: str):
    """指定账号的发布历史。"""
    all_items = _collect_publish_history()
    filtered = [i for i in all_items if i.get("account_id") == account_id]
    return {"items": filtered, "total": len(filtered), "account_id": account_id}


def _collect_publish_history() -> list:
    """从队列和文章中收集已发布/已保存草稿的记录。"""
    items = []
    for item in app_state.get_queue():
        status = item.get("status", "")
        if status in ("published", "saved_to_wechat", "failed"):
            items.append({
                "id": item.get("id", ""),
                "title": item.get("title", ""),
                "type": item.get("type", "image") or "image",
                "status": status,
                "publish_time": item.get("time", ""),
                "images_count": len(item.get("images", [])),
                "account_id": item.get("account_id", ""),
            })
    for article in app_state.get_articles():
        status = article.get("status", "")
        if status in ("published", "saved_to_wechat", "failed"):
            items.append({
                "id": article.get("id", ""),
                "title": article.get("title", ""),
                "type": "article",
                "status": status,
                "publish_time": article.get("updated_at", article.get("created_at", "")),
                "images_count": len(article.get("images", [])),
                "account_id": article.get("account_id", ""),
            })
    items.sort(key=lambda x: x.get("publish_time", ""), reverse=True)
    return items
