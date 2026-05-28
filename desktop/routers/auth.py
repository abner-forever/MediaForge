"""平台认证 API 路由（微博/头条/小红书的验证、清除、登录流）。"""

from __future__ import annotations

import asyncio
import logging
import re
import sys
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
from services.weibo_login import run_weibo_login
from services.xhs_login import run_xhs_login

router = APIRouter(tags=["auth"])
logger = logging.getLogger(__name__)


# ── 登录 SSE 流 ─────────────────────────────────────


@router.get("/api/settings/weibo-login-stream")
async def weibo_login_stream():
    """SSE 流：打开系统 WebView 弹出窗口让用户登录微博。"""

    def _task(msg_queue):
        run_weibo_login(msg_queue)

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


@router.get("/api/settings/xhs-login-stream")
async def xhs_login_stream():
    """SSE 流：打开浏览器让用户登录小红书。"""

    def _task(msg_queue):
        run_xhs_login(msg_queue)

    def _on_done(msg):
        data = msg[1] if len(msg) > 1 and isinstance(msg[1], dict) else {}
        cookie = data.get("cookie", "")
        if cookie:
            from utils.xhs_auth_store import write_xhs_auth
            write_xhs_auth(
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


@router.post("/api/settings/xhs-verify")
async def xhs_verify(body: Dict[str, Any] | None = None):
    """验证小红书 Cookie 是否有效，返回用户信息。"""
    body = body or {}
    cookie = body.get("cookie", "")
    if not cookie:
        cookie = settings.xhs_cookie

    if not cookie:
        return {"valid": False, "message": "未设置小红书 Cookie"}

    def _verify():
        try:
            headers = {
                "User-Agent": (
                    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36"
                ),
                "Cookie": cookie,
                "Referer": "https://www.xiaohongshu.com/",
                "Accept": "application/json, text/plain, */*",
            }

            screen_name = ""
            avatar = ""
            uid = ""

            # 从 cookie 中提取 uid
            for part in cookie.split(";"):
                kv = part.strip().split("=", 1)
                if len(kv) == 2 and kv[0].strip() in ("uid", "user_id"):
                    uid = kv[1].strip()

            # 1) 尝试用户信息 API
            try:
                resp = http_requests.get(
                    "https://www.xiaohongshu.com/api/sns/web/v1/user/self",
                    headers=headers, timeout=10,
                )
                if resp.status_code == 200:
                    data = resp.json()
                    if data.get("success"):
                        user_data = data.get("data", {})
                        screen_name = user_data.get("nickname", "") or user_data.get("name", "")
                        avatar = user_data.get("avatar", "") or user_data.get("image", "") or ""
                        uid = user_data.get("user_id", "") or str(user_data.get("id", "")) or uid
            except Exception as e:
                logger.debug("小红书用户信息 API 失败: %s", e)

            # 2) 从首页 SSR 提取用户信息
            html = ""
            if not screen_name:
                try:
                    page_headers = {
                        "User-Agent": headers["User-Agent"],
                        "Cookie": cookie,
                        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                    }
                    resp = http_requests.get(
                        "https://www.xiaohongshu.com/",
                        headers=page_headers, timeout=10,
                    )
                    if resp.status_code == 200:
                        import json as _json
                        html = resp.text
                        init_match = re.search(
                            r'window\.__INITIAL_STATE__\s*=\s*({.*?});\s*(?:\n|<)',
                            html, re.DOTALL,
                        )
                        if init_match:
                            try:
                                state = _json.loads(init_match.group(1))
                                user_data = (
                                    state.get("user")
                                    or state.get("userInfo")
                                    or state.get("currentUser")
                                    or {}
                                )
                                if user_data and isinstance(user_data, dict):
                                    sn = user_data.get("nickname") or user_data.get("name") or ""
                                    if sn:
                                        screen_name = sn
                                        avatar = user_data.get("avatar") or user_data.get("image") or ""
                                        uid = user_data.get("userId") or str(user_data.get("id", "")) or uid
                            except Exception as e:
                                logger.debug("小红书 SSR JSON 解析失败: %s", e)
                except Exception as e:
                    logger.debug("小红书首页 SSR 提取失败: %s", e)

            # 若缺头像，从首页 HTML 提取
            if not avatar:
                try:
                    if not html:
                        resp = http_requests.get(
                            "https://www.xiaohongshu.com/",
                            headers={**headers, "Accept": "text/html,*/*"}, timeout=10,
                        )
                        html = resp.text if resp.status_code == 200 else ""
                    if html:
                        av_match = re.search(r'"avatar"\s*:\s*"(https?://[^"]+)"', html)
                        if av_match:
                            avatar = av_match.group(1)
                except Exception as e:
                    logger.debug("小红书头像提取失败: %s", e)

            # 3) 判断关键会话 cookie 是否存在
            has_web_session = "web_session" in cookie
            has_a1 = "a1=" in cookie

            if screen_name:
                from utils.xhs_auth_store import write_xhs_auth
                write_xhs_auth(cookie=cookie, uid=uid, screen_name=screen_name, avatar=avatar)
                return {"valid": True, "uid": uid, "screen_name": screen_name, "avatar": avatar}

            # 4) Cookie 有效但无法获取用户信息
            if has_web_session and has_a1:
                from utils.xhs_auth_store import read_xhs_auth
                auth = read_xhs_auth()
                if auth.get("screen_name"):
                    screen_name = auth["screen_name"]
                    uid = auth.get("uid", "") or uid
                    avatar = auth.get("avatar", "") or avatar
                    return {"valid": True, "uid": uid, "screen_name": screen_name, "avatar": avatar, "message": "Cookie 有效"}
                return {"valid": True, "uid": uid or "", "screen_name": "", "avatar": "", "message": "Cookie 有效，但受反爬限制无法获取用户信息（不影响使用）"}
            if has_web_session or has_a1:
                from utils.xhs_auth_store import read_xhs_auth
                auth = read_xhs_auth()
                if auth.get("screen_name"):
                    screen_name = auth["screen_name"]
                    uid = auth.get("uid", "") or uid
                    avatar = auth.get("avatar", "") or avatar
                    return {"valid": True, "uid": uid, "screen_name": screen_name, "avatar": avatar, "message": "Cookie 可能有效"}
                return {"valid": True, "uid": uid or "", "screen_name": "", "avatar": "", "message": "Cookie 可能有效，但无法获取用户信息（不影响使用）"}

            return {"valid": False, "message": "Cookie 无效或已过期"}
        except Exception as exc:
            return {"valid": False, "message": str(exc)}

    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, _verify)


@router.post("/api/settings/xhs-clear")
async def clear_xhs():
    """清空小红书鉴权信息。"""
    from utils.xhs_auth_store import clear_xhs_auth
    from config import reload_settings
    clear_xhs_auth()
    reload_settings()
    return {"success": True}
