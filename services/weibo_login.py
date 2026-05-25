"""微博扫码登录 — 通过 Playwright Chromium 弹出浏览器窗口让用户扫码或账号密码登录，
捕获完整的 Cookie 串（包含 HTTP-only 的 SUB、SCF、WBPSESS 等）。

替代 PyWebView WKWebView 方案（macOS 15 上 WKWebView cookie store API 无法返回完整
cookie），使用 Chromium 的完整 cookie API 保证 cookie 100% 捕获。
"""

from __future__ import annotations

import time
from queue import Queue

from playwright.sync_api import Error as PwError, TimeoutError as PwTimeout

from utils.logger import get_logger

logger = get_logger(__name__)

_WEIBO_LOGIN_URL = (
    "https://passport.weibo.com/sso/signin"
    "?entry=miniblog&source=miniblog&disp=popup"
    "&url=https%3A%2F%2Fweibo.com%2Fnewlogin%3Ftabtype%3Dweibo"
    "%26gid%3D102803%26openLoginLayer%3D0%26url%3Dhttps%3A%2F%2Fweibo.com%2F"
    "&from=weibopro"
)

_LOGIN_TIMEOUT_SECONDS = 300


def _fetch_user_info(cookie: str, uid: str) -> tuple:
    """通过微博 API 根据 UID 获取用户昵称和头像 URL。

    返回 (screen_name, avatar_url) 元组。
    """
    if not cookie or not uid:
        return ("", "")
    try:
        import requests
        url = f"https://weibo.com/ajax/profile/info?uid={uid}"
        headers = {
            "User-Agent": (
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36"
            ),
            "Cookie": cookie,
            "Referer": "https://weibo.com/",
            "Accept": "application/json, text/plain, */*",
        }
        resp = requests.get(url, headers=headers, timeout=10)
        data = resp.json()
        if data.get("ok") == 1:
            user = (data.get("data", {}).get("user", {}) or {})
            screen_name = user.get("screen_name", "")
            avatar_hd = user.get("avatar_hd", "") or user.get("profile_image_url", "")
            return (screen_name, avatar_hd)
    except Exception as exc:
        logger.warning("获取用户信息失败: %s", exc)
    return ("", "")


def run_weibo_login(msg_queue: Queue) -> None:
    """
    通过 Playwright Chromium 打开微博登录页面，用户扫码/账号密码登录后，
    提取完整 cookie 并获取用户信息。

    使用 Chromium 而非 WKWebView，因为：
    - WKWebView 在 macOS 15 上的 cookie store API 返回的 cookie 不完整
    - Chromium 的 context.cookies() 返回所有 cookie（含 HTTP-only）

    向 msg_queue 推送三类消息：
        ("progress", message_str)
        ("done", cookie_str, uid_str, screen_name_str, avatar_str)
        ("error", error_str)
    """
    try:
        from playwright.sync_api import sync_playwright, TimeoutError as PwTimeout

        msg_queue.put(("progress", "正在启动浏览器..."))

        with sync_playwright() as pw:
            # 非无头模式：用户需要看到 QR 码并扫码
            try:
                browser = pw.chromium.launch(
                    headless=False,
                    args=["--window-size=680,820"],
                )
            except PwError as e:
                # 常见错误：Playwright 已安装但浏览器二进制缺失，提示用户运行安装命令
                msg = str(e)
                logger.exception("启动 Chromium 失败: %s", msg)
                if "Executable doesn't exist" in msg or "not found" in msg or "was not downloaded" in msg:
                    hint = (
                        "Playwright 浏览器未安装。请运行：\n"
                        "  python -m playwright install\n"
                        "或在 CI/打包流程中确保浏览器已包含。"
                    )
                    msg_queue.put(("error", "启动浏览器失败：未找到可执行文件。"))
                    msg_queue.put(("error", hint))
                    return
                else:
                    # 非二进制缺失的其他 Playwright 错误，继续抛出以便上层捕获并记录
                    raise
            context = browser.new_context(
                viewport={"width": 620, "height": 740},
                user_agent=(
                    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36"
                ),
            )
            page = context.new_page()

            msg_queue.put(("progress", "正在打开微博登录页面..."))
            page.goto(_WEIBO_LOGIN_URL)

            # 等待登录：使用 wait_for_function 在页面 JS 上下文中检测 URL，
            # 这比 Python 侧轮询 page.url 更可靠——能正确处理导航期间的上下文切换
            msg_queue.put(("progress", "请在浏览器窗口中扫码或使用账号密码登录微博"))
            logged_in = False
            try:
                page.wait_for_function(
                    "() => window.location.hostname.includes('weibo.com') "
                    "&& !window.location.hostname.includes('passport')",
                    timeout=_LOGIN_TIMEOUT_SECONDS * 1000,
                    polling=1,
                )
                logged_in = True
                logger.info("检测到登录成功，当前 URL: %s", page.url)
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
                # Playwright 内部错误（如页面关闭）
                if "closed" in str(e).lower() or "detached" in str(e).lower():
                    msg_queue.put(("error", "登录窗口已关闭"))
                    browser.close()
                    return
                raise

            msg_queue.put(("progress", "登录成功，正在提取 Cookie..."))

            # 如果当前不在 weibo.com 主页，导航过去以触发 cookie 同步
            # 如果已经在主页则跳过导航，避免不必要的重定向
            current_url = page.url
            if "weibo.com" not in current_url:
                try:
                    page.goto("https://weibo.com/", wait_until="domcontentloaded", timeout=30000)
                except Exception as exc:
                    logger.warning("导航到 weibo.com/ 失败: %s", exc)

            # 等待页面完全加载，确保所有 XHR 完成的 cookie 已同步
            try:
                page.wait_for_load_state("networkidle", timeout=15000)
            except Exception:
                pass
            time.sleep(2)

            # 从 Chromium cookie store 读取所有 cookie
            cookies = context.cookies()
            logger.info("Playwright 获取到 %d 个 cookie", len(cookies))

            if not cookies:
                msg_queue.put(("error", "登录成功但未获取到 Cookie，请重试"))
                browser.close()
                return

            # 格式化 cookie 串
            cookie_parts: list[str] = []
            uid = ""
            for c in cookies:
                cookie_parts.append(f"{c['name']}={c['value']}")
                if c["name"] == "uid" and c["value"]:
                    uid = c["value"]

            cookie_str = "; ".join(cookie_parts)
            browser.close()

            msg_queue.put(("progress", f"已提取 Cookie（{len(cookie_str)} 字符，共 {len(cookies)} 个）"))
            logger.info(
                "Cookie 列表: %s",
                [c["name"] for c in cookies],
            )

            # 获取用户信息
            screen_name = ""
            avatar = ""
            if cookie_str and uid:
                screen_name, avatar = _fetch_user_info(cookie_str, uid)

            # 如果还没有 uid，尝试从 API 推断
            if not uid and cookie_str:
                try:
                    import requests as _requests
                    import re as _re
                    headers = {
                        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
                        "Cookie": cookie_str,
                        "Referer": "https://weibo.com/",
                    }
                    resp = _requests.get(
                        "https://weibo.com/ajax/feed/allGroups", headers=headers, timeout=10,
                    )
                    m = _re.search(r'"uid"\s*:\s*"(\d+)"', resp.text)
                    if m:
                        uid = m.group(1)
                        screen_name, avatar = _fetch_user_info(cookie_str, uid)
                except Exception as exc:
                    logger.warning("从 API 推断 uid 失败: %s", exc)

            if screen_name:
                msg_queue.put(("progress", f"微博用户：{screen_name}（{uid}）"))
            msg_queue.put(("done", cookie_str, uid, screen_name, avatar))

    except Exception as exc:
        logger.exception("微博登录流程异常")
        msg_queue.put(("error", str(exc)))
