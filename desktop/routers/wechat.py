"""微信公众号多账号管理 API 路由。"""

from __future__ import annotations

import asyncio
import json
import logging
import sys
import time
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


def _cookies_to_playwright_state(raw_cookies: list) -> list[dict]:
    """将 WebView2 CookieManager 返回的 SimpleCookie 列表转为 Playwright storage state 格式。

    注意 validate_login_state 判断有效期用 expires == -1（不过期）or > now，
    所以缺过期信息时设 -1 而非 0，否则会被判为已过期。
    """
    from email.utils import parsedate_to_datetime
    pw_cookies = []
    for sc in raw_cookies:
        for name, morsel in sc.items():
            # cookie 无过期信息时视为 session cookie（永不失效）
            expires = -1
            try:
                expires_str = morsel.get('expires', '')
                if expires_str:
                    expires = int(parsedate_to_datetime(expires_str).timestamp())
            except (ValueError, TypeError, OverflowError):
                expires = int(time.time()) + 86400 * 365
            # 跳过缺少域名的异常 cookie
            domain = morsel.get('domain', '')
            if not domain:
                continue
            # sameSite 必须严格为 Strict/Lax/None，WebView2 可能返回
            # Unspecified/NoRestriction/none/lax/strict 等非标准格式
            same_site_raw = (morsel.get('samesite', '') or '').strip()
            if same_site_raw.lower() in ('strict', 'lax', 'none'):
                same_site = same_site_raw.capitalize()
            else:
                same_site = 'None'  # 未知值默认 None
            pw_cookies.append({
                "name": name,
                "value": morsel.value,
                "domain": domain,
                "path": morsel.get('path', '/'),
                "expires": expires,
                "httpOnly": str(morsel.get('httponly', False)).lower() == 'true',
                "secure": str(morsel.get('secure', False)).lower() == 'true',
                "sameSite": same_site,
            })
    return pw_cookies


def _inject_cookies_from_state(context, state_path: Path) -> None:
    """从 state.json 注入 Cookie 到 Playwright Context，避免依赖 Chromium Profile 原生存储。"""
    if not state_path or not state_path.exists():
        return
    try:
        data = json.loads(state_path.read_text("utf-8"))
        cookies = data.get("cookies", [])
        if cookies:
            context.add_cookies(cookies)
    except Exception as e:
        logger.warning("注入 Cookie 失败: %s", e)


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
    """检查指定账号的登录状态。

    通过 validate_login_state 检查 state.json 中的 Cookie 是否未过期即可，
    无需启动 Playwright 浏览器真实验证（WebView2 的 Cookie 注入到 headless
    Chromium 后微信服务器不会认可，会产生误判）。
    """
    from utils.wechat_auth_store import get_account, validate_login_state
    account = get_account(account_id)
    if not account:
        raise HTTPException(404, "账号不存在")
    logged_in = validate_login_state(account_id)
    return {"logged_in": logged_in, "name": account.get("name", "")}


@router.get("/api/wechat/accounts/{account_id}/login")
async def wechat_account_login(account_id: str):
    """应用内新窗口登录公众号。通过 SSE 流式返回登录状态。"""
    from utils.wechat_auth_store import get_account

    account = get_account(account_id)
    if not account:
        raise HTTPException(404, "账号不存在")

    def _task(msg_queue):
        _wechat_login_via_webview(msg_queue, account_id)

    return create_sse_response(_task)


def _wechat_login_via_webview(msg_queue, account_id: str):
    """使用 PyWebView WebView2 新窗口进行微信公众号登录。

    1. 弹出应用内窗口加载 mp.weixin.qq.com
    2. 用户扫码登录后，通过 CookieManager 提取所有 Cookie
    3. 以 Playwright storage state 格式写入 state.json
    4. 发布/同步时从此文件注入 Cookie，无需依赖 Chromium Profile
    """
    import sys
    if sys.platform != 'win32':
        msg_queue.put(("progress", "当前平台不支持 WebView2，使用 Chromium 浏览器..."))
        _wechat_login_fallback_playwright(msg_queue, account_id)
        return

    try:
        import webview
    except ImportError:
        msg_queue.put(("progress", "PyWebView 不可用，使用 Chromium 浏览器..."))
        _wechat_login_fallback_playwright(msg_queue, account_id)
        return

    from utils.wechat_auth_store import get_account_paths, update_account

    profile_dir, state_path = get_account_paths(account_id)
    profile_dir.mkdir(parents=True, exist_ok=True)
    state_path.parent.mkdir(parents=True, exist_ok=True)

    msg_queue.put(("progress", "正在启动应用内浏览窗口..."))

    try:
        w = webview.create_window(
            "微信公众号登录",
            url="https://mp.weixin.qq.com/",
            width=1024, height=768,
            resizable=True,
        )
    except Exception as e:
        logger.warning("PyWebView 创建窗口失败 (%s)，回退到 Playwright", e)
        _wechat_login_fallback_playwright(msg_queue, account_id)
        return

    window_uid = w.uid
    msg_queue.put(("progress", "请在窗口中扫码登录微信公众号"))

    time.sleep(4)  # 等 WebView2 和页面初始化

    try:
        from webview.platforms.winforms import get_cookies
    except ImportError:
        msg_queue.put(("error", "Cookie 获取模块加载失败"))
        _close_window_safe(w)
        return

    start_ts = time.time()
    timeout = 300

    while time.time() - start_ts < timeout:
        try:
            if w.native is None or w.native.IsDisposed:
                msg_queue.put(("error", "登录窗口已被关闭"))
                return
        except Exception:
            pass

        # 通过页面 URL 判断：扫码登录成功后会跳转到 /cgi-bin/ 的管理后台
        # 使用 evaluate_js 获取 URL（内部会封送到 GUI 线程，比 get_current_url() 更可靠）
        logged_in = False
        current_url = ""
        try:
            current_url = (w.evaluate_js("window.location.href") or "").strip()
        except Exception:
            try:
                current_url = (w.get_current_url() or "").strip()
            except Exception:
                pass
        if current_url:
            if '/cgi-bin/' in current_url:
                logged_in = True

        # 获取 Cookie 用于保存登录态
        raw_cookies = []
        try:
            raw_cookies = list(get_cookies(window_uid) or [])
        except Exception:
            pass

        if logged_in and raw_cookies:
            msg_queue.put(("progress", "登录成功，正在保存登录状态..."))

            # 转为 Playwright storage state 格式
            pw_cookies = _cookies_to_playwright_state(raw_cookies)
            state_data = {"cookies": pw_cookies, "origins": []}
            state_path.write_text(json.dumps(state_data, ensure_ascii=False), "utf-8")

            update_account(account_id, last_used=datetime.now().isoformat())

            msg_queue.put(("done", {"message": "登录完成"}))

            time.sleep(1.5)
            _close_window_safe(w)
            return

        time.sleep(1)

    msg_queue.put(("progress", "登录超时，正在关闭窗口..."))
    _close_window_safe(w)
    msg_queue.put(("error", "登录超时，请重试"))


def _wechat_login_fallback_playwright(msg_queue, account_id: str):
    """回退到 Playwright 方式登录（非 Windows 或 WebView2 不可用时）。"""
    from services.wechat.helpers import _cleanup_stale_lock
    from services.wechat import _ensure_login, _looks_logged_in
    from playwright.sync_api import sync_playwright
    from utils.wechat_auth_store import get_account_paths, update_account

    profile_dir, state_path = get_account_paths(account_id)
    profile_dir.mkdir(parents=True, exist_ok=True)
    state_path.parent.mkdir(parents=True, exist_ok=True)
    _cleanup_stale_lock(profile_dir)

    try:
        with sync_playwright() as p:
            context = p.chromium.launch_persistent_context(
                user_data_dir=str(profile_dir),
                headless=False,
                channel="chromium",
            )
            page = context.new_page()
            page.goto("https://mp.weixin.qq.com/", wait_until="domcontentloaded")
            msg_queue.put(("progress", "正在登录微信公众号..."))

            if _looks_logged_in(page):
                msg_queue.put(("progress", "检测到已登录，无需扫码"))
            else:
                msg_queue.put(("progress", "请在浏览器窗口中扫码登录"))
                _ensure_login(page, state_path=state_path,
                              on_scan_needed=lambda: msg_queue.put(("progress", "等待扫码中...")))
                msg_queue.put(("progress", "登录成功"))

            # 同时写入 state.json，兼容新方案
            context.storage_state(path=str(state_path))
            update_account(account_id, last_used=datetime.now().isoformat())
            context.close()

        msg_queue.put(("done", {"message": "登录完成"}))
    except Exception as e:
        msg_queue.put(("error", str(e)))


def _close_window_safe(w):
    """安全关闭 PyWebView 窗口（跨线程，通过 WinForms GUI 线程关闭）。"""
    try:
        if w.native and not w.native.IsDisposed:
            try:
                # Close 必须在 WinForms GUI 线程上调用
                from System import Func, Type
                w.native.Invoke(Func[Type](w.native.Close))
            except ImportError:
                w.native.Close()
    except Exception:
        pass
        pass


@router.get("/api/wechat/accounts/{account_id}/sync-effects")
async def sync_effects(account_id: str, pages: int = 1, page_size: int = 20):
    """从公众号后台抓取已发布文章的真实阅读数据，同步到本地效果记录。通过 SSE 流式返回进度。"""
    from utils.wechat_auth_store import get_account
    pages = max(1, min(50, int(pages)))
    page_size = max(5, min(50, int(page_size)))
    account = get_account(account_id)
    if not account:
        raise HTTPException(404, "账号不存在")

    def _task(msg_queue):
        from services.wechat.fetcher import fetch_published_articles
        fetch_published_articles(account_id, msg_queue, pages=pages, page_size=page_size)

    return create_sse_response(_task)


@router.post("/api/wechat/accounts/{account_id}/logout")
async def wechat_account_logout(account_id: str):
    """清除指定公众号的登录态。"""
    from utils.wechat_auth_store import get_account, get_account_paths
    account = get_account(account_id)
    if not account:
        raise HTTPException(404, "账号不存在")
    profile_dir, state_path = get_account_paths(account_id)

    # 删除 state.json
    if state_path.exists():
        state_path.unlink()

    # 删除 Chromium Profile 目录（包含原生 Cookie 存储）
    if profile_dir.exists():
        try:
            import shutil
            shutil.rmtree(profile_dir, ignore_errors=True)
        except Exception as e:
            logger.debug("清除 Profile 目录失败: %s", e)

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
