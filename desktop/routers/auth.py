"""平台认证 API 路由（微博/头条的验证、清除、登录流）。"""

from __future__ import annotations

import asyncio
import logging
import re
import sys
import time
from pathlib import Path
from typing import Any, Dict

import requests as http_requests
from fastapi import APIRouter

# 确保项目根目录在 sys.path 中
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from config import settings
from desktop.sse_helpers import create_sse_response
from services.toutiao_login import run_toutiao_login

router = APIRouter(tags=["auth"])
logger = logging.getLogger(__name__)


# ── 登录 SSE 流 ─────────────────────────────────────


_WEIBO_LOGIN_URL = (
    "https://passport.weibo.com/sso/signin"
    "?entry=miniblog&source=miniblog&disp=popup"
    "&url=https%3A%2F%2Fweibo.com%2Fnewlogin%3Ftabtype%3Dweibo"
    "%26gid%3D102803%26openLoginLayer%3D0%26url%3Dhttps%3A%2F%2Fweibo.com%2F"
    "&from=weibopro"
)


def _weibo_login_via_webview(msg_queue):
    """使用 PyWebView WebView2 新窗口进行微博登录，完整捕获所有 Cookie。

    利用 WebView2 的 CoreWebView2.CookieManager 读取包括 HTTP-only 在内的所有
    Cookie，替代此前 Playwright 方案。仅在 Windows + Edge Chromium 下生效，
    否则自动回退到 Playwright。
    """
    # 非 Windows 或非桌面模式回退到 Playwright
    if sys.platform != 'win32':
        msg_queue.put(("progress", "当前平台不支持 WebView2 窗口，使用 Chromium 浏览器..."))
        from services.weibo_login import run_weibo_login
        run_weibo_login(msg_queue)
        return

    try:
        import webview
    except ImportError:
        msg_queue.put(("progress", "PyWebView 不可用，使用 Chromium 浏览器..."))
        from services.weibo_login import run_weibo_login
        run_weibo_login(msg_queue)
        return

    msg_queue.put(("progress", "正在启动应用内浏览窗口..."))

    # 创建新窗口
    try:
        w = webview.create_window(
            "微博登录",
            url=_WEIBO_LOGIN_URL,
            width=680, height=820,
            resizable=False,
        )
    except Exception as e:
        logger.warning("PyWebView 创建窗口失败 (%s)，回退到 Playwright", e)
        msg_queue.put(("progress", "创建应用窗口失败，使用 Chromium 浏览器..."))
        from services.weibo_login import run_weibo_login
        run_weibo_login(msg_queue)
        return

    window_uid = w.uid
    msg_queue.put(("progress", "请在新窗口中扫码登录微博"))

    # 等待窗口和 WebView2 初始化
    time.sleep(3)

    # 导入 CookieManager API
    try:
        from webview.platforms.winforms import get_cookies
    except ImportError:
        msg_queue.put(("error", "Cookie 获取模块加载失败"))
        try:
            if w.native and not w.native.IsDisposed:
                w.native.Close()
        except Exception:
            pass
        return

    start_ts = time.time()
    timeout = 300  # 5 分钟

    while time.time() - start_ts < timeout:
        # 检测用户是否手动关闭了窗口
        try:
            if w.native is None or w.native.IsDisposed:
                msg_queue.put(("error", "登录窗口已被关闭"))
                return
        except Exception:
            pass

        # 轮询 Cookie：找到 SUB 即认为登录成功
        try:
            raw_cookies = list(get_cookies(window_uid) or [])
            sub_value = None
            for sc in raw_cookies:
                for name, morsel in sc.items():
                    if name == 'SUB' and morsel.value and morsel.value != '0':
                        sub_value = morsel.value
                        break
                if sub_value:
                    break

            if sub_value:
                # 拼装完整 Cookie 串
                parts = []
                uid = ""
                for sc in raw_cookies:
                    for name, morsel in sc.items():
                        parts.append(f"{name}={morsel.value}")
                        if name == 'uid':
                            uid = morsel.value

                cookie_str = "; ".join(parts)

                msg_queue.put(("progress", "登录成功，正在获取用户信息..."))

                # 获取用户昵称和头像
                from services.weibo_login import _fetch_user_info
                screen_name, avatar = "", ""
                try:
                    screen_name, avatar = _fetch_user_info(cookie_str, uid)
                except Exception:
                    pass

                # 发完成事件
                msg_queue.put(("done", {
                    "cookie": cookie_str,
                    "uid": uid,
                    "screen_name": screen_name,
                    "avatar": avatar,
                }))

                # 延迟关闭窗口
                time.sleep(1.5)
                try:
                    if w.native and not w.native.IsDisposed:
                        w.native.Close()
                except Exception:
                    pass
                return
        except Exception:
            pass  # 窗口/WebView2 还没完全就绪

        time.sleep(1)

    # 超时
    msg_queue.put(("progress", "登录超时，正在关闭窗口..."))
    try:
        if w.native and not w.native.IsDisposed:
            w.native.Close()
    except Exception:
        pass
    msg_queue.put(("error", "登录超时，请重试"))


@router.get("/api/settings/weibo-login-stream")
async def weibo_login_stream():
    """SSE 流：打开应用内新窗口让用户登录微博。

    使用 PyWebView WebView2 新窗口替代 Playwright 独立浏览器，
    通过 CoreWebView2.CookieManager 完整捕获所有 Cookie（含 HTTP-only）。
    """

    def _task(msg_queue):
        _weibo_login_via_webview(msg_queue)

    def _on_done(msg):
        data = msg[1] if len(msg) > 1 and isinstance(msg[1], dict) else {}
        cookie = data.get("cookie", "")
        if cookie:
            from utils.weibo_auth_store import write_weibo_auth
            write_weibo_auth(
                cookie=cookie,
                uid=data.get("uid", ""),
                screen_name=data.get("screen_name", ""),
                avatar=data.get("avatar", ""),
            )
            from config import reload_settings
            reload_settings()

    return create_sse_response(_task, on_done=_on_done)


@router.get("/api/settings/toutiao-login-stream")
async def toutiao_login_stream():
    """SSE 流：打开浏览器让用户登录今日头条。"""

    def _task(msg_queue):
        run_toutiao_login(msg_queue)

    def _on_done(msg):
        data = msg[1] if len(msg) > 1 and isinstance(msg[1], dict) else {}
        cookie = data.get("cookie", "")
        if cookie:
            from utils.toutiao_auth_store import write_toutiao_auth
            write_toutiao_auth(
                cookie=cookie,
                uid=data.get("uid", ""),
                screen_name=data.get("screen_name", ""),
                avatar=data.get("avatar", ""),
            )
            from config import reload_settings
            reload_settings()

    return create_sse_response(_task, on_done=_on_done)


# ── Cookie 验证 ─────────────────────────────────────


@router.post("/api/settings/weibo-verify")
async def weibo_verify(body: Dict[str, Any] | None = None):
    """验证微博 Cookie 是否有效，返回用户信息。"""
    body = body or {}
    cookie = body.get("cookie", "")
    if not cookie:
        cookie = settings.weibo_cookie

    if not cookie:
        return {"valid": False, "message": "未设置微博 Cookie"}

    def _verify():
        try:
            from services.weibo_login import _fetch_user_info

            uid = ""
            for part in cookie.split(";"):
                kv = part.strip().split("=", 1)
                if len(kv) == 2 and kv[0].strip() == "uid":
                    uid = kv[1].strip()
                    break

            headers = {
                "User-Agent": (
                    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36"
                ),
                "Cookie": cookie,
                "Referer": "https://weibo.com/",
                "Accept": "application/json, text/plain, */*",
            }

            screen_name = ""
            avatar = ""
            if uid:
                screen_name, avatar = _fetch_user_info(cookie, uid)

            if not screen_name:
                resp = http_requests.get(
                    "https://weibo.com/ajax/feed/allGroups",
                    headers=headers, timeout=10,
                )
                if resp.status_code == 200:
                    matched = re.search(r'"uid"\s*:\s*"(\d+)"', resp.text)
                    if matched:
                        uid = matched.group(1)
                        screen_name, avatar = _fetch_user_info(cookie, uid)

            if screen_name:
                from utils.weibo_auth_store import write_weibo_auth
                write_weibo_auth(cookie=cookie, uid=uid, screen_name=screen_name, avatar=avatar)
                return {"valid": True, "uid": uid, "screen_name": screen_name, "avatar": avatar}
            return {"valid": False, "message": "Cookie 无效或已过期", "uid": uid or "", "screen_name": "", "avatar": ""}
        except Exception as exc:
            return {"valid": False, "message": str(exc)}

    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, _verify)


@router.post("/api/settings/weibo-clear")
async def clear_weibo():
    """清空微博鉴权信息。"""
    from utils.weibo_auth_store import clear_weibo_auth
    from config import reload_settings
    clear_weibo_auth()
    reload_settings()
    return {"success": True}


@router.post("/api/settings/toutiao-verify")
async def toutiao_verify(body: Dict[str, Any] | None = None):
    """验证今日头条 Cookie 是否有效，返回用户信息。"""
    body = body or {}
    cookie = body.get("cookie", "")
    if not cookie:
        cookie = settings.toutiao_cookie

    if not cookie:
        return {"valid": False, "message": "未设置今日头条 Cookie"}

    def _verify():
        try:
            headers = {
                "User-Agent": (
                    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36"
                ),
                "Cookie": cookie,
                "Referer": "https://www.toutiao.com/",
                "Accept": "application/json, text/plain, */*",
                "X-Requested-With": "XMLHttpRequest",
            }

            screen_name = ""
            avatar = ""
            uid = ""

            # 尝试 pgc/ma/profile/ 获取用户信息
            try:
                resp = http_requests.get(
                    "https://www.toutiao.com/pgc/ma/profile/",
                    headers=headers, timeout=10,
                )
                if resp.status_code == 200:
                    data = resp.json()
                    if data.get("message") == "success":
                        user_data = data.get("data", {}).get("user", {})
                        screen_name = user_data.get("name", "") or user_data.get("screen_name", "")
                        avatar = user_data.get("avatar_url", "") or user_data.get("avatar", "")
                        uid = user_data.get("user_id", "") or str(user_data.get("id", ""))
            except Exception as e:
                logger.debug("头条 pgc API 获取用户信息失败: %s", e)

            # 尝试 mp.toutiao.com 创作者中心 API
            if not screen_name:
                try:
                    mp_headers = {
                        "User-Agent": headers["User-Agent"],
                        "Cookie": cookie,
                        "Accept": "application/json, text/plain, */*",
                        "Referer": "https://mp.toutiao.com/profile_v4/index",
                    }
                    resp = http_requests.get(
                        "https://mp.toutiao.com/mp/agw/creator_center/user_info?app_id=1231",
                        headers=mp_headers, timeout=10,
                    )
                    if resp.status_code == 200:
                        data = resp.json()
                        if data.get("message") == "success":
                            screen_name = data.get("name", "") or screen_name
                            avatar = data.get("avatar_url", "") or avatar
                            uid = str(data.get("user_id", "")) or str(data.get("media_id", "")) or uid
                            logger.info("创作者中心 API 获取到用户信息: %s", screen_name)
                except Exception as e:
                    logger.debug("头条创作者中心 API 失败: %s", e)

            # 兜底：从页面内容提取用户信息
            if not screen_name:
                try:
                    resp = http_requests.get(
                        "https://www.toutiao.com/",
                        headers=dict(headers, Accept="text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"),
                        timeout=10, allow_redirects=True,
                    )
                    if resp.status_code == 200:
                        for pat in [r'"name"\s*:\s*"([^"]+)"', r'"nickname"\s*:\s*"([^"]+)"', r'"screen_name"\s*:\s*"([^"]+)"']:
                            m = re.search(pat, resp.text)
                            if m:
                                screen_name = m.group(1)
                                break
                        for pat in [r'"user_id"\s*:\s*"(\d+)"', r'"id"\s*:\s*(\d+)', r'"uid"\s*:\s*"(\d+)"']:
                            m = re.search(pat, resp.text)
                            if m:
                                uid = m.group(1)
                                break
                        for pat in [r'"avatar_url"\s*:\s*"([^"]+)"', r'"avatar"\s*:\s*"([^"]+)"']:
                            m = re.search(pat, resp.text)
                            if m:
                                avatar = m.group(1)
                                break
                except Exception as e:
                    logger.debug("头条首页 HTML 提取用户信息失败: %s", e)

            if screen_name:
                from utils.toutiao_auth_store import write_toutiao_auth
                write_toutiao_auth(cookie=cookie, uid=uid, screen_name=screen_name, avatar=avatar)
                return {"valid": True, "uid": uid, "screen_name": screen_name, "avatar": avatar}

            # 基本连通性检查
            try:
                resp = http_requests.get(
                    "https://www.toutiao.com/",
                    headers=dict(headers, Accept="text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"),
                    timeout=10, allow_redirects=False,
                )
                if resp.status_code == 200:
                    return {"valid": True, "uid": uid, "screen_name": "", "avatar": "", "message": "Cookie 有效，但无法获取用户信息"}
            except Exception as e:
                logger.debug("头条连通性检查失败: %s", e)

            return {"valid": False, "message": "Cookie 无效或已过期", "uid": uid or "", "screen_name": "", "avatar": ""}
        except Exception as exc:
            return {"valid": False, "message": str(exc)}

    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, _verify)


@router.post("/api/settings/toutiao-clear")
async def clear_toutiao():
    """清空今日头条鉴权信息。"""
    from utils.toutiao_auth_store import clear_toutiao_auth
    from config import reload_settings
    clear_toutiao_auth()
    reload_settings()
    return {"success": True}
