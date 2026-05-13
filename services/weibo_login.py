"""微博扫码登录 — 通过系统 WebView 弹出窗口让用户扫码或账号密码登录，捕获 Cookie 和 UID。

替代旧版 Playwright 方案，在桌面 GUI 模式下使用 PyWebView 弹出窗口加载
passport.weibo.com 登录页，用户完成登录后通过 macOS WebKit 原生 API
获取所有 cookie（含 HTTP-only）。
"""

from __future__ import annotations

import threading
import time
from queue import Queue

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


def _is_logged_in_url(url: str) -> bool:
    """检查 URL 是否表示已成功登录（从 passport.weibo.com 跳转到了 weibo.com）。"""
    if not url:
        return False
    return "weibo.com" in url and "passport.weibo.com" not in url


def _format_cookie_string(cookies: list[dict]) -> str:
    return "; ".join(f"{c['name']}={c['value']}" for c in cookies)


def _pick_uid(cookies: list[dict]) -> str:
    for c in cookies:
        if c.get("name") == "uid":
            return c.get("value", "")
    return ""


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
                "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36"
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


def _check_for_sub_cookie(window) -> bool:
    """快速检查 WKWebView cookie store 中是否存在 SUB cookie（不执行完整提取）。"""
    try:
        from webview.platforms.cocoa import BrowserView
        from AppKit import AppHelper
        from Foundation import NSURL

        found_cookie = []  # mutable marker
        done = threading.Event()

        def on_cookies(cookies):
            for c in cookies:
                if getattr(c, "name", "") == "SUB" and getattr(c, "value", ""):
                    found_cookie.append(True)
                    done.set()
                    return
            done.set()

        def check():
            try:
                bv = BrowserView.instances.get(window.uid)
                if bv and bv.webview:
                    store = bv.webview.configuration.websiteDataStore
                    cookie_store = store.httpCookieStore()
                    try:
                        cookie_store.getAllCookies_(on_cookies)
                    except Exception:
                        weibo_url = NSURL.URLWithString_("https://weibo.com/")
                        cookie_store.getCookiesForURL_completionHandler_(weibo_url, on_cookies)
                else:
                    done.set()
            except Exception:
                done.set()

        AppHelper.callAfter(check)
        done.wait(timeout=5)
        return bool(found_cookie)
    except Exception:
        return False


def _get_all_window_cookies(window) -> list[dict]:
    """从 WKWebView cookie store 获取全部 cookie（无域名限制）。"""
    try:
        from webview.platforms.cocoa import BrowserView
        from AppKit import AppHelper
        from Foundation import NSURL

        collected: list[dict] = []
        done = threading.Event()

        def on_cookies(cookies):
            for c in cookies:
                domain = getattr(c, "domain", "") or ""
                collected.append({
                    "name": c.name,
                    "value": c.value,
                    "domain": domain,
                })
            done.set()

        def get_all():
            try:
                bv = BrowserView.instances.get(window.uid)
                if bv and bv.webview:
                    store = bv.webview.configuration.websiteDataStore
                    cookie_store = store.httpCookieStore()
                    try:
                        cookie_store.getAllCookies_(on_cookies)
                    except Exception:
                        weibo_url = NSURL.URLWithString_("https://weibo.com/")
                        cookie_store.getCookiesForURL_completionHandler_(weibo_url, on_cookies)
                else:
                    logger.warning("BrowserView 实例未找到，uid=%s", window.uid)
                    done.set()
            except Exception as e:
                logger.warning("WKWebView getCookies error: %s", e)
                done.set()

        AppHelper.callAfter(get_all)
        done.wait(timeout=15)
        return collected
    except Exception as exc:
        logger.warning("WKWebView 提取 cookie 失败: %s", exc)
        return []


def _get_native_weibo_cookies(window=None) -> list[dict]:
    """通过 macOS WebKit API 及系统 HTTP cookie 存储获取 weibo.com 的所有 cookie。

    包含 HTTP-only cookie（如 SUB），这是 JS document.cookie 无法读取的。

    从多个来源收集并合并结果，确保不遗漏任何重要 cookie。
    """

    def _dump_all(cookies, source: str):
        names = [c.get("name", "?") for c in cookies]
        domains = set(c.get("domain", "?") for c in cookies)
        if cookies:
            logger.info("[%s] 共 %d 个 cookie: %s | domains: %s", source, len(cookies), names, domains)
        else:
            logger.warning("[%s] 未获取到任何 cookie", source)

    all_sources: list[tuple[str, list[dict]]] = []

    # 0) 直接从 PyWebView 窗口的 WKWebView cookie store 获取（含 HTTP-only，无域名限制）
    wk_cookies = _get_all_window_cookies(window) if window is not None else []
    _dump_all(wk_cookies, "WKWebView")
    all_sources.append(("WKWebView", wk_cookies))

    # 1) NSHTTPCookieStorage — 系统级共享 cookie 存储（补充）
    try:
        from Foundation import NSHTTPCookieStorage
        ns_cookies: list[dict] = []
        shared_store = NSHTTPCookieStorage.sharedHTTPCookieStorage()
        for c in shared_store.cookies():
            domain = getattr(c, "domain", "") or ""
            ns_cookies.append({"name": c.name, "value": c.value, "domain": domain})
        _dump_all(ns_cookies, "NSHTTPCookieStorage")
        all_sources.append(("NSHTTPCookieStorage", ns_cookies))
    except Exception as exc:
        logger.warning("NSHTTPCookieStorage 不可用: %s", exc)

    # ── 合并所有来源 ──
    merged: dict[str, dict] = {}
    source_order: list[str] = []
    for _src_name, src_cookies in all_sources:
        for c in src_cookies:
            name = c["name"]
            if name not in merged:
                merged[name] = c
                source_order.append(name)

    result = [merged[name] for name in source_order]
    logger.info(
        "[合并] 共 %d 个 cookie（来自 %d 个来源）: %s",
        len(result), len(all_sources), [c["name"] for c in result],
    )
    return result


def run_weibo_login(msg_queue: Queue) -> None:
    """
    打开 PyWebView 弹出窗口 → 加载 passport.weibo.com 登录页面 → 等待用户登录 →
    提取 cookie 和 UID → 关闭窗口。

    向 msg_queue 推送三类消息：
        ("progress", message_str)
        ("done", cookie_str, uid_str)
        ("error", error_str)
    """
    import webview as wv

    logged_in = threading.Event()
    finished = threading.Event()

    def poll_loop(window):
        """在后台线程中轮询登录状态，检测到登录后提取 cookie。"""
        try:
            msg_queue.put(("progress", "请在弹出的窗口中扫码或使用账号密码登录微博"))
            fail_count = 0
            empty_count = 0  # 连续获取到空 URL 的次数（窗口可能已关闭）
            for i in range(_LOGIN_TIMEOUT_SECONDS):
                if logged_in.is_set():
                    return
                try:
                    url = window.get_current_url()
                    fail_count = 0
                    if url and _is_logged_in_url(url):
                        logged_in.set()
                        msg_queue.put(("progress", "登录成功，正在提取 Cookie..."))
                        extract_cookies(window)
                        return
                    if not url:
                        empty_count += 1
                        if empty_count > 10:
                            msg_queue.put(("error", "登录窗口已关闭"))
                            return
                    else:
                        empty_count = 0
                except Exception:
                    fail_count += 1
                    if fail_count > 10:  # 窗口很可能已被用户关闭
                        msg_queue.put(("error", "登录窗口已关闭"))
                        return
                if i > 0 and i % 30 == 0:
                    msg_queue.put(("progress", "等待登录..."))
                time.sleep(1)

            msg_queue.put(("error", f"登录超时（{_LOGIN_TIMEOUT_SECONDS // 60} 分钟），请重试"))
        except Exception as exc:
            logger.exception("轮询线程异常")
            msg_queue.put(("error", str(exc)))
        finally:
            finished.set()
            try:
                window.destroy()
            except Exception:
                pass

    def extract_cookies(window):
        """检测到登录后，提取所有可用的 cookie。

        等待关键鉴权 cookie（SUB）出现后才执行提取，最多等待 30 秒。
        如果超时未获取到 SUB，则用已获取的 cookie 继续（可能已过期，留待验证）。
        """
        # 阶段 1：等待页面完成重定向链（passport → weibo.com/newlogin → weibo.com/）
        msg_queue.put(("progress", "等待登录态同步..."))
        time.sleep(4)

        # 阶段 2：等待 SUB 这个关键鉴权 cookie 出现
        sub_found = False
        for i in range(30):
            if _check_for_sub_cookie(window):
                sub_found = True
                logger.info("SUB cookie 已就绪（等待约 %d 秒）", i + 1)
                break
            if i < 10:
                time.sleep(1)
            elif i == 10:
                # 10 秒后 SUB 仍未出现，尝试导航到 weibo.com/ 触发最终跳转
                try:
                    msg_queue.put(("progress", "正在跳转到微博首页..."))
                    window.load_url("https://weibo.com/")
                except Exception as exc:
                    logger.warning("导航到 weibo.com/ 失败: %s", exc)
                time.sleep(1)
            else:
                time.sleep(1)

        if not sub_found:
            logger.warning("SUB cookie 未在 30 秒内出现，可能登录未完全完成")

        # 阶段 3：完整提取所有 cookie
        # 通过 JS 读取先尝试获取非 HTTP-only cookie
        js_cookies: list[dict] = []
        try:
            js = window.evaluate_js("document.cookie") or ""
            for part in js.split(";"):
                part = part.strip()
                if "=" in part:
                    n, v = part.split("=", 1)
                    js_cookies.append({"name": n.strip(), "value": v.strip()})
            logger.info("通过 JS 获取到 %d 个 cookie: %s", len(js_cookies), [c["name"] for c in js_cookies])
        except Exception as exc:
            logger.warning("JS 获取 cookie 失败: %s", exc)

        # 原生 WebKit API（可获取 HTTP-only cookie）
        native_cookies = _get_native_weibo_cookies(window)

        # 合并：优先用原生（含 HTTP-only），不足时用 JS 补充
        all_cookies: list[dict] = []
        seen_names: set[str] = set()
        for src in (native_cookies, js_cookies):
            for c in src:
                if c["name"] not in seen_names:
                    seen_names.add(c["name"])
                    all_cookies.append(c)

        if all_cookies:
            cookie_str = _format_cookie_string(all_cookies)
            uid = _pick_uid(all_cookies)

            # 尝试从 cookie 或页面获取 uid 和用户名
            if not uid:
                try:
                    import re
                    url = window.get_current_url() or ""
                    m = re.search(r'/(\d{6,})', url)
                    if m:
                        uid = m.group(1)
                except Exception:
                    pass

            screen_name = ""
            avatar = ""
            if cookie_str:
                if uid:
                    screen_name, avatar = _fetch_user_info(cookie_str, uid)
                # 如果没有 uid，尝试直接从微博 API 推断
                if not uid:
                    try:
                        import requests, re as _re
                        headers = {
                            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
                            "Cookie": cookie_str,
                            "Referer": "https://weibo.com/",
                        }
                        resp = requests.get("https://weibo.com/ajax/feed/allGroups", headers=headers, timeout=10)
                        m = _re.search(r'"uid"\s*:\s*"(\d+)"', resp.text)
                        if m:
                            uid = m.group(1)
                            screen_name, avatar = _fetch_user_info(cookie_str, uid)
                    except Exception as exc:
                        logger.warning("从 API 推断 uid 失败: %s", exc)

            msg_queue.put(("progress", f"已提取 Cookie（{len(cookie_str)} 字符）"))
            if screen_name:
                msg_queue.put(("progress", f"微博用户：{screen_name}（{uid}）"))
            msg_queue.put(("done", cookie_str, uid, screen_name, avatar))
        else:
            msg_queue.put(("error", "登录成功但未获取到 Cookie，请重试"))

    try:
        msg_queue.put(("progress", "正在打开微博登录窗口..."))
        window = wv.create_window(
            "微博登录",
            _WEIBO_LOGIN_URL,
            width=620,
            height=740,
            on_top=True,
            text_select=True,
        )
        time.sleep(0.5)  # 等待窗口初始化完成
        threading.Thread(target=poll_loop, args=(window,), daemon=True).start()
        finished.wait()
    except Exception as exc:
        logger.exception("微博登录流程异常")
        msg_queue.put(("error", str(exc)))
