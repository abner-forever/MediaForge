"""小红书登录 — 通过 Playwright Chromium 弹出浏览器窗口让用户扫码或手机号登录，
捕获完整的 Cookie 串。

参考微博登录实现，适配小红书的登录流程。
"""

from __future__ import annotations

import re
import time
from queue import Queue

from utils.logger import get_logger
from utils.xhs_auth_store import STORAGE_STATE_PATH

logger = get_logger(__name__)

_LOGIN_TIMEOUT_SECONDS = 300


def _fetch_user_info(cookie: str) -> tuple:
    """通过小红书 API 获取用户昵称和头像 URL。"""
    if not cookie:
        return ("", "")
    try:
        import requests

        headers = {
            "User-Agent": (
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36"
            ),
            "Cookie": cookie,
            "Referer": "https://www.xiaohongshu.com/",
            "Accept": "application/json, text/plain, */*",
        }

        # 尝试用户主页 API
        resp = requests.get(
            "https://www.xiaohongshu.com/api/sns/web/v1/user/self",
            headers=headers, timeout=10,
        )
        if resp.status_code == 200:
            data = resp.json()
            if data.get("success"):
                user_data = data.get("data", {})
                screen_name = user_data.get("nickname", "") or user_data.get("name", "")
                avatar = user_data.get("avatar", "") or user_data.get("image", "") or ""
                uid = user_data.get("user_id", "") or str(user_data.get("id", ""))
                if screen_name:
                    return (screen_name, avatar, uid)

        # 兜底：从首页 HTML 提取用户信息
        try:
            resp = requests.get(
                "https://www.xiaohongshu.com/",
                headers={
                    **headers,
                    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                },
                timeout=10,
            )
        except Exception:
            resp = None

        if resp is not None and resp.status_code == 200:
            html = resp.text
            # 优先解析 __INITIAL_STATE__
            init_match = re.search(
                r'window\.__INITIAL_STATE__\s*=\s*({.*?});\s*(?:\n|<)',
                html, re.DOTALL,
            )
            if init_match:
                try:
                    import json as _json
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
                            return (
                                sn,
                                user_data.get("avatar") or user_data.get("image") or "",
                                user_data.get("userId") or str(user_data.get("id", "")),
                            )
                except Exception:
                    pass

                # 降级：正则匹配
                name_match = re.search(r'"nickname"\s*:\s*"([^"]+)"', html)
                if name_match:
                    screen_name = name_match.group(1)
                uid_match = re.search(r'"userId"\s*:\s*"(\d+)"', html)
                uid = uid_match.group(1) if uid_match else ""
                avatar_match = re.search(r'"avatar"\s*:\s*"(https?://[^"]+)"', html)
                avatar = avatar_match.group(1) if avatar_match else ""
                if screen_name:
                    return (screen_name, avatar, uid)
    except Exception as exc:
        logger.warning("获取小红书用户信息失败: %s", exc)
    return ("", "", "")


def run_xhs_login(msg_queue: Queue) -> None:
    """
    通过 Playwright Chromium 打开小红书首页，用户扫码/手机号登录后，
    提取完整 cookie 并获取用户信息。

    向 msg_queue 推送三类消息：
        ("progress", message_str)
        ("done", cookie_str, uid_str, screen_name_str, avatar_str)
        ("error", error_str)
    """
    try:
        from playwright.sync_api import sync_playwright, TimeoutError as PwTimeout, Error as PwError

        msg_queue.put(("progress", "正在启动浏览器..."))

        with sync_playwright() as pw:
            browser = pw.chromium.launch(
                headless=False,
                channel="chromium",
                args=["--window-size=1024,768"],
            )
            context = browser.new_context(
                viewport={"width": 1024, "height": 768},
                user_agent=(
                    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36"
                ),
            )
            page = context.new_page()

            msg_queue.put(("progress", "正在打开小红书登录页..."))
            page.goto("https://www.xiaohongshu.com/login")

            # 等待页面加载
            try:
                page.wait_for_load_state("networkidle", timeout=15000)
            except Exception:
                pass

            msg_queue.put(("progress", "请在浏览器窗口中扫码或使用手机号登录小红书"))

            # 等待登录成功：检测 URL 变化或 cookie 中存在特定标记
            try:
                page.wait_for_function(
                    "() => {"
                    "  const c = document.cookie;"
                    "  const url = window.location.href;"
                    "  return c.includes('session') || c.includes('token')"
                    "    || url.includes('explore') || url.includes('homepage');"
                    "}",
                    timeout=_LOGIN_TIMEOUT_SECONDS * 1000,
                    polling=1,
                )
                logger.info("检测到小红书登录成功")
            except PwTimeout:
                try:
                    _ = page.url
                except PwError as e:
                    if "closed" in str(e).lower() or "detached" in str(e).lower():
                        msg_queue.put(("error", "登录窗口已关闭"))
                        browser.close()
                        return
                msg_queue.put(("error", f"登录超时（{_LOGIN_TIMEOUT_SECONDS // 60} 分钟），请重试"))
                browser.close()
                return
            except PwError as e:
                if "closed" in str(e).lower() or "detached" in str(e).lower():
                    msg_queue.put(("error", "登录窗口已关闭"))
                    browser.close()
                    return
                raise

            msg_queue.put(("progress", "登录成功，正在提取用户信息..."))

            # 等待页面稳定
            try:
                page.wait_for_load_state("networkidle", timeout=15000)
            except Exception:
                pass
            time.sleep(2)

            # ── 用户信息提取 ───────────────────────────────
            screen_name = ""
            avatar = ""
            uid = ""

            # 1) 尝试从页面 JS state 提取（最可靠，不依赖网络请求）
            for attempt in range(3):
                try:
                    result = page.evaluate("""
                        () => {
                            try {
                                const state = window.__INITIAL_STATE__;
                                if (state) {
                                    const user = state.user || state.userInfo || state.currentUser || {};
                                    if (user.nickname || user.name) {
                                        return {
                                            nickname: user.nickname || user.name || '',
                                            avatar: user.avatar || user.image || '',
                                            userId: user.userId || user.user_id || String(user.id || ''),
                                        };
                                    }
                                }
                                return null;
                            } catch(e) { return null; }
                        }
                    """)
                    if result:
                        screen_name = result.get("nickname", "") or result.get("name", "")
                        avatar = result.get("avatar", "") or result.get("image", "")
                        uid = str(result.get("userId", "") or result.get("user_id", "") or result.get("id", ""))
                        if screen_name:
                            logger.info("页面状态提取到用户信息: %s", screen_name)
                            break
                except Exception as exc:
                    logger.debug("页面状态提取失败(第%d次): %s", attempt + 1, exc)
                time.sleep(1)

            # 2) 尝试通过页面 API 获取用户信息（可能被反爬拦截）
            if not screen_name:
                for attempt in range(3):
                    try:
                        result = page.evaluate("""
                            async () => {
                                try {
                                    const r = await fetch('/api/sns/web/v1/user/self', {
                                        credentials: 'include',
                                        headers: {
                                            'Accept': 'application/json, text/plain, */*',
                                            'X-Requested-With': 'XMLHttpRequest'
                                        }
                                    });
                                    const d = await r.json();
                                    if (d && d.success) return d;
                                    return null;
                                } catch(e) { return null; }
                            }
                        """)
                        if result and result.get("success"):
                            user_data = result.get("data", {})
                            screen_name = user_data.get("nickname", "") or user_data.get("name", "")
                            avatar = user_data.get("avatar", "") or user_data.get("image", "") or ""
                            uid = user_data.get("user_id", "") or str(user_data.get("id", ""))
                            logger.info("页面 API 获取到用户信息: %s", screen_name)
                            break
                    except Exception as exc:
                        logger.debug("页面 API 获取用户信息失败(第%d次): %s", attempt + 1, exc)
                    time.sleep(1)

            # 3) 从页面 DOM 提取用户信息作为兜底
            if not screen_name:
                try:
                    html = page.content()
                    name_match = re.search(r'"nickname"\s*:\s*"([^"]+)"', html)
                    if name_match:
                        screen_name = name_match.group(1)
                    uid_match = re.search(r'"userId"\s*:\s*"(\d+)"', html)
                    if uid_match and not uid:
                        uid = uid_match.group(1)
                    avatar_match = re.search(r'"avatar"\s*:\s*"([^"]+)"', html)
                    if avatar_match and not avatar:
                        avatar = avatar_match.group(1)
                    # 也尝试从 img 标签提取头像
                    if not avatar:
                        img_match = re.search(r'<img[^>]+class="[^"]*avatar[^"]*"[^>]+src="([^"]+)"', html)
                        if img_match:
                            avatar = img_match.group(1)
                    if screen_name:
                        logger.info("页面 DOM 提取到用户信息: %s", screen_name)
                except Exception as exc:
                    logger.debug("页面 DOM 提取用户信息失败: %s", exc)

            cookies = context.cookies()
            logger.info("Playwright 获取到 %d 个 cookie", len(cookies))

            if not cookies:
                msg_queue.put(("error", "登录成功但未获取到 Cookie，请重试"))
                browser.close()
                return

            # 格式化 cookie 串
            cookie_parts: list[str] = []
            for c in cookies:
                cookie_parts.append(f"{c['name']}={c['value']}")
                if not uid and c["name"] in ("uid", "user_id", "userId", "webid", "device_id") and c["value"]:
                    uid = c["value"]

            cookie_str = "; ".join(cookie_parts)

            # 保存完整浏览器状态（含 localStorage、IndexedDB 等）
            try:
                context.storage_state(path=STORAGE_STATE_PATH)
                logger.info("已保存浏览器完整状态到 %s", STORAGE_STATE_PATH)
            except Exception as exc:
                logger.warning("保存浏览器状态失败: %s", exc)

            browser.close()

            msg_queue.put(("progress", f"已提取 Cookie（{len(cookie_str)} 字符，共 {len(cookies)} 个）"))
            logger.info("Cookie 列表: %s", [c["name"] for c in cookies])

            # 外部兜底：补全缺失的 uid/avatar（即使已有 screen_name）
            if not uid or not avatar:
                fetched_name, fetched_avatar, fetched_uid = _fetch_user_info(cookie_str)
                screen_name = screen_name or fetched_name
                avatar = avatar or fetched_avatar
                uid = uid or fetched_uid

            if screen_name:
                msg_queue.put(("progress", f"小红书用户：{screen_name}"))
            msg_queue.put(("done", {"cookie": cookie_str, "uid": uid, "screen_name": screen_name, "avatar": avatar}))

    except Exception as exc:
        logger.exception("小红书登录流程异常")
        msg_queue.put(("error", str(exc)))
