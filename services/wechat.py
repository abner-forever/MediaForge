import random
import re
import time
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional

from playwright.sync_api import sync_playwright

from config import DATA_DIR, WECHAT_STATE_PATH
from utils.logger import get_logger


logger = get_logger(__name__)


def _human_sleep(base: float = 1.0, jitter: float = 0.8) -> None:
    time.sleep(base + random.random() * jitter)


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


def _ensure_login(page, on_scan_needed: Optional[Callable[[], None]] = None) -> None:
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
            if _looks_logged_in(page):
                break
            if i % 5 == 0:
                logger.info("登录状态确认中...(%ss)", (i + 1) * 2)
            page.wait_for_timeout(2000)
        if not _looks_logged_in(page):
            raise RuntimeError("扫码后仍未检测到登录成功，请确认浏览器页面已进入公众号后台")
    logger.info("登录成功，当前页面: %s", page.url)
    page.context.storage_state(path=str(WECHAT_STATE_PATH))


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


def _resolve_editor_frame(page):
    for f in page.frames:
        if "appmsg_edit" in f.url or "cgi-bin/appmsg" in f.url:
            return f
    return page.main_frame


def publish_article(
    title: str,
    content: str,
    images: List[str],
    dry_run: bool = False,
    save_draft: bool = False,
    on_scan_needed: Optional[Callable[[], None]] = None,
    on_confirm_needed: Optional[Callable[[str], bool]] = None,
) -> Dict[str, Any]:
    """
    发布文章到微信公众号。

    Args:
        save_draft: True 则保存草稿不发布，False 则直接发布
        on_scan_needed: 需要扫码时的回调（UI 模式下用于显示提示）
        on_confirm_needed: 需要确认时的回调，接收 title，返回 True 确认发布
                           为 None 时使用 input() 阻塞等待（CLI 模式）

    Returns:
        {"success": bool, "message": str, "title": str}
    """
    if dry_run:
        logger.info("[DRY-RUN] 跳过发布: title=%s, images=%s", title, len(images))
        return {"success": True, "message": "DRY-RUN 模式，跳过发布", "title": title}

    try:
        with sync_playwright() as p:
            user_data_dir = DATA_DIR / "state" / "wechat_chromium_profile"
            user_data_dir.mkdir(parents=True, exist_ok=True)
            context = p.chromium.launch_persistent_context(
                user_data_dir=str(user_data_dir),
                headless=False,
            )
            page = context.new_page()
            page.goto("https://mp.weixin.qq.com/", wait_until="domcontentloaded")
            _ensure_login(page, on_scan_needed=on_scan_needed)
            _human_sleep()

            opened = _click_first_available(
                page,
                [
                    "a:has-text('图文消息')",
                    "a:has-text('内容与互动')",
                    "a:has-text('发表')",
                    "a[href*='appmsg']",
                    "a[href*='masssend']",
                ],
            )
            if opened:
                _human_sleep()
                _click_first_available(
                    page,
                    [
                        "button:has-text('新建图文')",
                        "a:has-text('新建图文')",
                        "a:has-text('写新图文')",
                    ],
                )
                _human_sleep(1.5, 1.0)
            if not _resolve_editor_frame(page).url or 'appmsg' not in _resolve_editor_frame(page).url:
                if _goto_new_article_direct(page):
                    logger.info("已通过直达链接进入新建图文页")
                    _human_sleep(1.5, 1.0)
                else:
                    raise RuntimeError("未找到图文入口，且无法直达新建图文页")

            editor_frame = _resolve_editor_frame(page)

            # 编辑器打开后可能定位在正文区域，先滚动到顶部找到标题
            page.evaluate("window.scrollTo(0, 0)")
            _human_sleep(0.5, 0.3)

            if not _fill_first_available(
                editor_frame,
                [
                    "#js_title",
                    "input[id='js_title']",
                    "textarea[id='js_title']",
                    "input[placeholder*='请在这里输入标题']",
                    "input[placeholder*='标题']",
                    "textarea[placeholder*='请在这里输入标题']",
                    "input.js_title",
                    ".title_editor input",
                    ".title_editor textarea",
                ],
                title,
                wait_ms=8000,
            ):
                # 最后尝试点击标题区域再输入
                try:
                    page.locator("text=请在这里输入标题").first.click(timeout=3000)
                    _human_sleep(0.3, 0.2)
                    page.keyboard.type(title, delay=30)
                except Exception:
                    raise RuntimeError("未找到标题输入框")
            if not _fill_first_available(
                editor_frame,
                [
                    "[contenteditable='true']",
                    "div[role='textbox']",
                ],
                content,
            ):
                raise RuntimeError("未找到正文输入区域")

            upload = editor_frame.locator("input[type='file']").first
            upload.wait_for(state="attached", timeout=6000)
            for img in images:
                if Path(img).exists():
                    upload.set_input_files(img)
                    _human_sleep(1.2, 1.2)

            # 保存草稿或发布
            if save_draft:
                logger.info("正在保存草稿...")
                if not _click_first_available(
                    editor_frame,
                    [
                        "button:has-text('保存草稿')",
                        "a:has-text('保存草稿')",
                        "button:has-text('保存')",
                    ],
                    wait_ms=5000,
                ):
                    raise RuntimeError("未找到保存草稿按钮")
                _human_sleep(1.5, 0.8)
                context.storage_state(path=str(WECHAT_STATE_PATH))
                context.close()
                return {"success": True, "message": "已保存为草稿", "title": title}
            else:
                logger.info("已填充内容，请人工检查后手动点击发布")
                if on_confirm_needed:
                    if not on_confirm_needed(title):
                        context.close()
                        return {"success": False, "message": "用户取消发布", "title": title}
                else:
                    input("确认后按回车继续，程序将尝试点击发布按钮...")

                if not _click_first_available(
                    editor_frame,
                    [
                        "button:has-text('发表')",
                        "button:has-text('发布')",
                        "a:has-text('发表')",
                    ],
                ):
                    raise RuntimeError("未找到发布按钮")
                _human_sleep(2.0, 1.0)
                context.storage_state(path=str(WECHAT_STATE_PATH))
                context.close()

        return {"success": True, "message": "发布成功", "title": title}
    except Exception as err:
        logger.error("发布失败: %s", err)
        return {"success": False, "message": str(err), "title": title}
