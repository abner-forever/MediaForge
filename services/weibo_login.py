"""微博扫码登录 — 通过 Playwright 打开浏览器让用户扫码登录，捕获 Cookie 和 UID。"""

from __future__ import annotations

import re
import tempfile
from queue import Queue

from playwright.sync_api import sync_playwright

from utils.logger import get_logger

logger = get_logger(__name__)

_WEIBO_LOGIN_URL = "https://weibo.com/"


def _detect_logged_in(page) -> bool:
    """检测是否已登录微博。"""
    url = page.url or ""
    # 仍在登录页面则未登录
    if "passport.weibo.com" in url:
        return False
    # 在 weibo.com 域名下，进一步通过 DOM 确认
    if "weibo.com" in url:
        try:
            # 已登录用户的标志性元素
            if page.locator(".gn_name").first.is_visible(timeout=500):
                return True
            if page.locator("[node-type='userInfo']").first.is_visible(timeout=500):
                return True
            if page.locator(".gn_nickname").first.is_visible(timeout=500):
                return True
        except Exception:
            pass
        # DOM 检测失败时，只要不在 passport 子域名就视为已登录
        return True
    return False


def _extract_cookie_string(context) -> str:
    """将 Playwright cookies 格式化为分号分隔的字符串。"""
    cookies = context.cookies()
    parts = [f"{c['name']}={c['value']}" for c in cookies]
    return "; ".join(parts)


def _extract_uid(page, context) -> str:
    """从 URL 路径或 cookie 中提取微博 UID。"""
    url = page.url or ""
    m = re.search(r"/u/(\d+)", url)
    if m:
        return m.group(1)
    # 从 cookie 中尝试提取
    for c in context.cookies():
        if c["name"] in ("uid",):
            return c.get("value", "")
    return ""


def run_weibo_login(msg_queue: Queue) -> None:
    """
    打开 Playwright 浏览器 → 导航到微博 → 等待用户扫码登录 → 提取 cookie 和 UID。

    向 msg_queue 推送三类消息：
        ("progress", message_str)
        ("done", cookie_str, uid_str)
        ("error", error_str)
    """
    try:
        msg_queue.put(("progress", "正在启动浏览器..."))

        with sync_playwright() as p:
            # 每次登录使用临时用户数据目录，无状态残留
            with tempfile.TemporaryDirectory(prefix="weibo_login_") as user_data_dir:
                context = p.chromium.launch_persistent_context(
                    user_data_dir=str(user_data_dir),
                    headless=False,
                    viewport={"width": 1280, "height": 800},
                )
                page = context.new_page()

                msg_queue.put(("progress", "正在打开微博登录页面..."))
                page.goto(_WEIBO_LOGIN_URL, wait_until="domcontentloaded")

                msg_queue.put(("progress", "请在弹出的浏览器窗口中扫码登录微博"))

                # 轮询检测登录状态，最多等待 5 分钟（300 次 × 1 秒）
                logged_in = False
                for i in range(300):
                    try:
                        if _detect_logged_in(page):
                            logged_in = True
                            break
                        if i > 0 and i % 15 == 0:
                            msg_queue.put(("progress", "等待扫码登录..."))
                    except Exception:
                        pass
                    page.wait_for_timeout(1000)

                if not logged_in:
                    context.close()
                    msg_queue.put(("error", "登录超时（5 分钟），请重试"))
                    return

                msg_queue.put(("progress", "登录成功，正在提取 Cookie 和 UID..."))
                # 等待页面状态稳定
                page.wait_for_timeout(2000)

                cookie_string = _extract_cookie_string(context)
                uid = _extract_uid(page, context)

                msg_queue.put(("progress", f"已提取 Cookie（{len(cookie_string)} 字符）"))

                context.close()

        msg_queue.put(("done", cookie_string, uid))

    except Exception as err:
        logger.exception("微博登录流程异常")
        msg_queue.put(("error", str(err)))
