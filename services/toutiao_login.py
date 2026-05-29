"""今日头条登录 — 通过 Playwright Chromium 弹出浏览器窗口让用户扫码或手机号登录，
捕获完整的 Cookie 串（包含 HTTP-only 的 sessionid、tt_webid 等）。

参考微博登录实现，适配头条的登录流程。
"""

from __future__ import annotations

import time
from queue import Queue

from utils.logger import get_logger

logger = get_logger(__name__)

_TOUTIAO_LOGIN_URL = "https://www.toutiao.com/"
_LOGIN_TIMEOUT_SECONDS = 300
_MP_TOUTIAO_USER_INFO_API = "https://mp.toutiao.com/mp/agw/creator_center/user_info?app_id=1231"
_MP_TOUTIAO_REFERER = "https://mp.toutiao.com/profile_v4/index"


def _fetch_user_info(cookie: str, uid: str = "") -> tuple:
    """通过今日头条 API 获取用户昵称和头像 URL。

    尝试多个已知接口，返回 (screen_name, avatar_url) 元组。
    """
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
            "Referer": "https://www.toutiao.com/",
            "Accept": "application/json, text/plain, */*",
        }

        # 尝试 pgc/ma/profile/ 获取用户信息
        resp = requests.get(
            "https://www.toutiao.com/pgc/ma/profile/",
            headers=headers, timeout=10,
        )
        if resp.status_code == 200:
            data = resp.json()
            if data.get("message") == "success":
                user_data = data.get("data", {}).get("user", {})
                screen_name = user_data.get("name", "") or user_data.get("screen_name", "")
                avatar = user_data.get("avatar_url", "") or user_data.get("avatar", "")
                uid = user_data.get("user_id", "") or str(user_data.get("id", "")) or uid
                if screen_name:
                    return (screen_name, avatar)

        # 尝试 user 相关 API 兜底
        resp = requests.get(
            "https://www.toutiao.com/toutiao/c/user/article/",
            headers=headers, timeout=10,
        )
        if resp.status_code == 200:
            import re
            name_match = re.search(r'"name"\s*:\s*"([^"]+)"', resp.text)
            if name_match:
                screen_name = name_match.group(1)
            uid_match = re.search(r'"user_id"\s*:\s*"(\d+)"', resp.text)
            if uid_match and not uid:
                uid = uid_match.group(1)
            if screen_name:
                return (screen_name, "")
    except Exception as exc:
        logger.warning("获取头条用户信息失败: %s", exc)
    return ("", "")


def run_toutiao_login(msg_queue: Queue) -> None:
    """
    通过 Playwright Chromium 打开今日头条首页，用户扫码/手机号登录后，
    提取完整 cookie 并获取用户信息。

    今日头条使用统一的 Web 登录入口（扫码或手机号），
    登录后会出现用户头像或用户名标识。

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

            msg_queue.put(("progress", "正在打开今日头条首页..."))
            page.goto(_TOUTIAO_LOGIN_URL)

            # 等待页面加载后，自动点击登录按钮弹起登录浮层
            try:
                page.wait_for_load_state("networkidle", timeout=15000)
            except Exception:
                pass
            login_selectors = [
                "text=登录",
                ".login-button",
                '[data-click="login"]',
                "button:has-text('登录')",
            ]
            clicked_login = False
            for sel in login_selectors:
                try:
                    if page.locator(sel).first.is_visible(timeout=3000):
                        page.locator(sel).first.click(timeout=5000)
                        logger.info("已自动点击登录按钮（选择器: %s）", sel)
                        clicked_login = True
                        break
                except Exception:
                    continue
            if not clicked_login:
                logger.info("未找到登录按钮，用户可手动点击页面上的登录按钮")

            # 等待登录：检测 cookie 或 URL query 参数
            msg_queue.put(("progress", "请在浏览器窗口中扫码或使用手机号登录今日头条"))
            try:
                page.wait_for_function(
                    "() => {"
                    "  const c = document.cookie;"
                    "  const url = window.location.href;"
                    "  return c.includes('sessionid') || c.includes('tt_sessionid')"
                    "    || url.includes('is_new_connect') || url.includes('is_new_user');"
                    "}",
                    timeout=_LOGIN_TIMEOUT_SECONDS * 1000,
                    polling=1,
                )
                logger.info("检测到头条登录成功")
            except PwTimeout:
                # 超时，检查是否页面已关闭
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

            # 优先利用已登录的页面上下文获取用户信息（浏览器尚未关闭）
            screen_name = ""
            avatar = ""
            page_uid = ""

            # 方法1：通过页面内 API 调用获取（自动携带完整 Cookie + 会话）
            import re as _re
            for attempt in range(3):
                try:
                    result = page.evaluate("""
                        async () => {
                            try {
                                const r = await fetch('/pgc/ma/profile/', {
                                    credentials: 'include',
                                    headers: {
                                        'Accept': 'application/json, text/plain, */*',
                                        'X-Requested-With': 'XMLHttpRequest'
                                    }
                                });
                                const d = await r.json();
                                if (d && d.message === 'success') return d;
                                return null;
                            } catch(e) { return null; }
                        }
                    """)
                    if result and result.get("message") == "success":
                        user_data = result.get("data", {}).get("user", {})
                        screen_name = user_data.get("name", "") or user_data.get("screen_name", "")
                        avatar = user_data.get("avatar_url", "") or user_data.get("avatar", "")
                        page_uid = user_data.get("user_id", "") or str(user_data.get("id", ""))
                        logger.info("页面 API 获取到用户信息: %s", screen_name)
                        break
                except Exception as exc:
                    logger.debug("页面 API 获取用户信息失败(第%d次): %s", attempt + 1, exc)
                time.sleep(1)

            # 方法2：通过创作者中心 API 获取（mp.toutiao.com 接口更可靠）
            if not screen_name:
                try:
                    page.goto(_MP_TOUTIAO_REFERER, timeout=20000)
                    page.wait_for_load_state("networkidle", timeout=15000)
                    time.sleep(1)
                    mp_result = page.evaluate("""
                        async () => {
                            try {
                                const r = await fetch('/mp/agw/creator_center/user_info?app_id=1231', {
                                    credentials: 'include',
                                    headers: {
                                        'Accept': 'application/json, text/plain, */*',
                                        'Referer': 'https://mp.toutiao.com/profile_v4/index'
                                    }
                                });
                                const d = await r.json();
                                if (d && d.message === 'success') return d;
                                return null;
                            } catch(e) { return null; }
                        }
                    """)
                    if mp_result and mp_result.get("message") == "success":
                        screen_name = mp_result.get("name", "") or screen_name
                        avatar = mp_result.get("avatar_url", "") or avatar
                        page_uid = str(mp_result.get("user_id", "")) or str(mp_result.get("media_id", "")) or page_uid
                        logger.info("创作者中心 API 获取到用户信息: %s", screen_name)
                except Exception as exc:
                    logger.debug("创作者中心 API 获取用户信息失败: %s", exc)

            # 方法3：尝试跳转到用户主页提取信息
            if not screen_name and page_uid:
                try:
                    page.goto(f"https://www.toutiao.com/c/user/{page_uid}/", timeout=15000)
                    page.wait_for_load_state("networkidle", timeout=10000)
                    html = page.content()
                    name_match = _re.search(r'"name"\s*:\s*"([^"]+)"', html)
                    if name_match:
                        screen_name = name_match.group(1)
                    logger.info("用户主页提取到用户信息: %s", screen_name)
                except Exception as exc:
                    logger.debug("用户主页提取失败: %s", exc)

            # 方法4：从头条首页 DOM 提取
            if not screen_name:
                try:
                    page.goto(_TOUTIAO_LOGIN_URL, timeout=15000)
                    page.wait_for_load_state("networkidle", timeout=10000)
                    html = page.content()
                    name_match = _re.search(r'"name"\s*:\s*"([^"]+)"', html)
                    if name_match:
                        screen_name = name_match.group(1)
                    uid_match = _re.search(r'"user_id"\s*:\s*"(\d+)"', html)
                    if uid_match:
                        page_uid = uid_match.group(1)
                    if screen_name:
                        logger.info("首页 DOM 提取到用户信息: %s", screen_name)
                except Exception as exc:
                    logger.debug("首页 DOM 提取用户信息失败: %s", exc)

            cookies = context.cookies()
            logger.info("Playwright 获取到 %d 个 cookie", len(cookies))

            if not cookies:
                msg_queue.put(("error", "登录成功但未获取到 Cookie，请重试"))
                browser.close()
                return

            # 格式化 cookie 串
            cookie_parts: list[str] = []
            uid = page_uid
            for c in cookies:
                cookie_parts.append(f"{c['name']}={c['value']}")
                if not uid and c["name"] in ("uid", "user_id", "tt_user_id") and c["value"]:
                    uid = c["value"]

            cookie_str = "; ".join(cookie_parts)
            browser.close()

            msg_queue.put(("progress", f"已提取 Cookie（{len(cookie_str)} 字符，共 {len(cookies)} 个）"))
            logger.info("Cookie 列表: %s", [c["name"] for c in cookies])

            # 若浏览器内未获取到用户信息，走外部 API 兜底
            if not screen_name:
                screen_name, avatar = _fetch_user_info(cookie_str, uid)

            if screen_name:
                msg_queue.put(("progress", f"头条用户：{screen_name}"))
            msg_queue.put(("done", {"cookie": cookie_str, "uid": uid, "screen_name": screen_name, "avatar": avatar}))

    except Exception as exc:
        logger.exception("头条登录流程异常")
        msg_queue.put(("error", str(exc)))
