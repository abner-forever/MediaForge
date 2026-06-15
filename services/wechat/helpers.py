"""微信发布辅助函数：日志、登录、Cookie 注入、通用 UI 操作。"""

import json
import re
import time
from pathlib import Path
from typing import Callable, Optional

from config import WECHAT_STATE_PATH
from utils.logger import get_logger

logger = get_logger(__name__)


def _normalize_same_site(same_site: str) -> str:
    """标准化 sameSite 值，Playwright 只认 Strict/Lax/None。

    WebView2 CookieManager 可能返回 Unspecified/NoRestriction/none/lax/strict 等格式。
    """
    if not same_site or not isinstance(same_site, str):
        return 'None'
    s = same_site.strip().lower()
    if s in ('strict', 'lax', 'none'):
        return s.capitalize()
    return 'None'


def inject_cookies_from_state(context, state_path: Path | None) -> None:
    """从 state.json 注入 Cookie 到 Playwright Context。

    同时修复 WebView2 来源 Cookie 的 sameSite 格式（Playwright 只认 Strict/Lax/None）。
    新方案：登录时通过 WebView2 CookieManager 将 Cookie 写入 state.json，
    发布/同步/状态检查时从此注入，避免依赖 Chromium Profile 原生 Cookie 存储。
    旧方案（Playwright 直接登录）的 state.json 格式也兼容。
    """
    if not state_path or not state_path.exists():
        return
    try:
        data = json.loads(state_path.read_text("utf-8"))
        cookies = data.get("cookies", [])
        if not cookies:
            return
        # 标准化 sameSite（修复 WebView2 来源 Cookie 兼容性问题）
        for c in cookies:
            if 'sameSite' in c:
                c['sameSite'] = _normalize_same_site(c.get('sameSite', ''))
        context.add_cookies(cookies)
        logger.debug("从 state.json 注入了 %d 条 Cookie", len(cookies))
    except Exception as e:
        logger.warning("注入 Cookie 失败: %s", e)


def _emit(msg: str, on_log: Optional[Callable[[str], None]] = None) -> None:
    logger.info(msg)
    if on_log:
        try:
            on_log(msg)
        except Exception:
            logger.exception("发布日志回调失败: %s", msg)


def _cleanup_stale_lock(profile_dir: Path) -> None:
    """清除 Chromium 遗留的 SingletonLock 文件，避免启动失败。

    Chromium 使用 SingletonLock（符号链接或普通文件）防止多实例。
    如果上次未正常退出，该文件会残留导致后续启动失败。
    """
    for name in ("SingletonLock", "SingletonSocket", "SingletonCookie"):
        lock = profile_dir / name
        if not lock.exists():
            continue
        try:
            # 如果是符号链接，unlink 不会删除目标
            lock.unlink()
            logger.info("已清除残留锁文件: %s", lock)
        except OSError as e:
            logger.warning("清除 %s 失败: %s，尝试强制删除", name, e)
            try:
                import subprocess
                subprocess.run(["rm", "-f", str(lock)], check=False, capture_output=True)
                if not lock.exists():
                    logger.info("强制清除成功: %s", lock)
                else:
                    logger.error("强制清除仍然失败: %s", lock)
            except Exception as e2:
                logger.error("强制清除异常: %s", e2)


def _human_sleep(base: float = 1.0, jitter: float = 0.8) -> None:
    time.sleep(base + __import__("random").random() * jitter)


def _looks_logged_in(page) -> bool:
    url = page.url or ""
    if "mp.weixin.qq.com/cgi-bin/" in url:
        return True
    checks = [
        "a:has-text('图文消息')",
        "a:has-text('内容与互动')",
        "a:has-text('发表')",
    ]
    for selector in checks:
        try:
            if page.locator(selector).first.is_visible(timeout=800):
                return True
        except Exception:
            continue
    return False


def _ensure_login(page, state_path: Optional[Path] = None,
                   on_scan_needed: Optional[Callable[[], None]] = None) -> None:
    from playwright.sync_api import Error as PlaywrightError

    if "mp.weixin.qq.com" not in page.url:
        page.goto("https://mp.weixin.qq.com/", wait_until="domcontentloaded")
    if not _looks_logged_in(page):
        if on_scan_needed:
            on_scan_needed()
        else:
            logger.info("检测到未登录，请扫码登录后回车继续")
            input("请完成微信扫码登录，然后按回车继续...")
        logger.info("正在确认登录状态...")
        for i in range(60):
            try:
                if _looks_logged_in(page):
                    break
                if i % 5 == 0:
                    logger.info("登录状态确认中...(%ss)", (i + 1) * 2)
                page.wait_for_timeout(2000)
            except PlaywrightError:
                raise RuntimeError("浏览器已关闭，登录流程中止")
        else:
            raise RuntimeError("扫码后仍未检测到登录成功，请确认浏览器页面已进入公众号后台")
    logger.info("登录成功，当前页面: %s", page.url)
    path_to_use = state_path or WECHAT_STATE_PATH
    page.context.storage_state(path=str(path_to_use))


def _extract_token_from_url(url: str) -> str:
    m = re.search(r"[?&]token=(\d+)", url or "")
    return m.group(1) if m else ""


def _goto_new_article_direct(page) -> bool:
    token = _extract_token_from_url(page.url or "")
    if not token:
        return False
    direct = (
        "https://mp.weixin.qq.com/cgi-bin/appmsg?"
        f"token={token}&lang=zh_CN&t=media/appmsg_edit_v2&action=edit&isNew=1&type=10"
    )
    try:
        page.goto(direct, wait_until="domcontentloaded")
        return True
    except Exception:
        return False


def _click_first_available(scope, selectors: list[str], wait_ms: int = 5000) -> bool:
    for selector in selectors:
        locator = scope.locator(selector).first
        try:
            locator.wait_for(state="visible", timeout=wait_ms)
            locator.click()
            return True
        except Exception:
            continue
    return False


def _fill_first_available(scope, selectors: list[str], value: str, wait_ms: int = 5000) -> bool:
    for selector in selectors:
        locator = scope.locator(selector).first
        try:
            locator.wait_for(state="visible", timeout=wait_ms)
            locator.fill(value)
            return True
        except Exception:
            continue
    return False


def _fill_first_quick(scope, selectors: list[str], value: str) -> bool:
    """即时检测元素是否存在且可见，不等 timeout。"""
    for selector in selectors:
        locator = scope.locator(selector).first
        try:
            if locator.count() > 0 and locator.is_visible():
                locator.fill(value)
                return True
        except Exception:
            continue
    return False


def _log_frames(page) -> None:
    for i, f in enumerate(page.frames):
        logger.info("  frame[%d] url=%s", i, f.url[:200] if f.url else "(empty)")
