import random
import re
import time
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional

from playwright.sync_api import sync_playwright

from config import DATA_DIR, WECHAT_STATE_PATH
from utils.logger import get_logger


logger = get_logger(__name__)


def _emit(msg: str, on_log: Optional[Callable[[str], None]] = None) -> None:
    logger.info(msg)
    if on_log:
        try:
            on_log(msg)
        except Exception:
            pass


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


def _log_frames(page) -> None:
    for i, f in enumerate(page.frames):
        logger.info("  frame[%d] url=%s", i, f.url[:120] if f.url else "(empty)")


def _find_content_editor(page, editor_frame):
    """在编辑器 frame 和所有嵌套 frame 中查找正文编辑区域。
    返回 (locator, frame) 或 (None, None)。
    """
    content_selectors = [
        "[contenteditable='true']",
        "div[role='textbox']",
        "div[contenteditable]",
        ".ProseMirror",
        ".ql-editor",
        "#js_content",
        "body[contenteditable]",
    ]
    # 先在编辑器 frame 中找
    for sel in content_selectors:
        loc = editor_frame.locator(sel).first
        try:
            loc.wait_for(state="visible", timeout=3000)
            return loc, editor_frame
        except Exception:
            continue
    # 遍历所有 frame（包括嵌套 iframe 中的 UEditor）
    for f in page.frames:
        if f == editor_frame:
            continue
        for sel in content_selectors:
            loc = f.locator(sel).first
            try:
                loc.wait_for(state="visible", timeout=2000)
                return loc, f
            except Exception:
                continue
    return None, None


def _select_cover(page, editor_frame, on_log=None) -> None:
    """自动选择封面：选择封面 → 菜单从正文选择 → 选图弹窗确认 → 裁剪弹窗确认。"""
    # 1. 点击"选择封面"按钮（等待右侧边栏加载完成）
    _human_sleep(1.0, 0.5)
    cover_selectors = [
        "text=选择封面",
        "text=点击选择封面",
        "text=设置封面",
        "a:has-text('选择封面')",
        "button:has-text('选择封面')",
        ".js_cover_area",
        "#js_cover_area",
        "[class*='cover_set']",
    ]
    for sel in cover_selectors:
        try:
            loc = page.locator(sel).first
            loc.wait_for(state="visible", timeout=4000)
            loc.click()
            _emit("已点击选择封面", on_log)
            break
        except Exception:
            continue
    else:
        _emit("未找到选择封面按钮，跳过", on_log)
        return

    # 2. 菜单中点击"从正文选择"
    from_body_selectors = [
        "text=从正文选择",
        "a:has-text('从正文选择')",
        "li:has-text('从正文选择')",
        "div:has-text('从正文选择')",
        ".weui-desktop-dropdown__menu >> text=从正文选择",
    ]
    for sel in from_body_selectors:
        try:
            loc = page.locator(sel).first
            loc.wait_for(state="visible", timeout=2000)
            loc.click()
            _emit("已点击从正文选择", on_log)
            break
        except Exception:
            continue
    else:
        _emit("未找到从正文选择菜单项，跳过", on_log)
        return

    # 3. 选择图片弹窗 → 勾选第一张图
    img_selectors = [
        ".weui-desktop-img-picker__img-item",
        ".img_item",
        ".pic_list li",
        ".image_list li",
        "[class*='img-picker'] li",
        "[class*='upload'] li",
        ".weui-desktop-dialog img",
    ]
    for sel in img_selectors:
        try:
            loc = page.locator(sel).first
            loc.wait_for(state="visible", timeout=3000)
            loc.click()
            _emit("已勾选第一张封面图片", on_log)
            break
        except Exception:
            continue
    else:
        _emit("未找到可选图片，跳过封面设置", on_log)
        return

    # 4. 点击"下一步"
    for sel in ["button:has-text('下一步')", "a:has-text('下一步')"]:
        try:
            loc = page.locator(sel).first
            loc.wait_for(state="visible", timeout=2000)
            loc.click()
            _emit("已点击下一步", on_log)
            break
        except Exception:
            continue

    # 5. 编辑封面弹窗 → 确认
    for sel in ["button:has-text('确定')", "button:has-text('确认')"]:
        try:
            loc = page.locator(sel).first
            loc.wait_for(state="visible", timeout=2000)
            loc.click()
            _emit("编辑封面已确认", on_log)
            break
        except Exception:
            continue

    # 6. 裁剪封面弹窗 → 完成
    for sel in ["button:has-text('完成')", "button:has-text('确定')"]:
        try:
            loc = page.locator(sel).first
            loc.wait_for(state="visible", timeout=2000)
            loc.click()
            break
        except Exception:
            continue
    _emit("封面设置完成", on_log)




def publish_article(
    title: str,
    content: str,
    images: List[str],
    dry_run: bool = False,
    save_draft: bool = False,
    on_scan_needed: Optional[Callable[[], None]] = None,
    on_confirm_needed: Optional[Callable[[str], bool]] = None,
    on_log: Optional[Callable[[str], None]] = None,
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
            _emit("正在登录微信公众号...", on_log)
            _ensure_login(page, on_scan_needed=on_scan_needed)
            _emit("登录成功", on_log)

            # 直接用 token 跳转新建图文页，避免逐个点击导航链接的等待
            if not _goto_new_article_direct(page):
                raise RuntimeError("无法从当前页面提取 token 进入编辑器")
            _emit("已通过直达链接进入新建图文页，等待编辑器加载...", on_log)
            # 注意：微信编辑器有后台轮询（自动保存、统计），networkidle 几乎不会触发
            # 用 load 确保 DOM 加载完成即可，然后直接等标题输入框
            page.wait_for_load_state("load")
            editor_frame = _resolve_editor_frame(page)

            _emit("正在填写标题...", on_log)
            if not _fill_first_available(
                editor_frame,
                [
                    "#js_title",
                    "input[placeholder*='标题']",
                    "textarea[placeholder*='标题']",
                    "input.js_title",
                    ".title_editor input",
                ],
                title,
                wait_ms=8000,
            ):
                try:
                    page.locator("text=请在这里输入标题").first.click(timeout=3000)
                    _human_sleep(0.3, 0.2)
                    page.keyboard.type(title, delay=30)
                except Exception:
                    raise RuntimeError("未找到标题输入框")
            _emit("标题填写完成", on_log)
            content_frame = None

            # 有正文内容时才填写
            if content and content.strip():
                _emit("正在填写正文内容...", on_log)
                content_loc, content_frame = _find_content_editor(page, editor_frame)
                if content_loc:
                    content_loc.click()
                    _human_sleep(0.3, 0.2)
                    try:
                        content_loc.evaluate("el => { el.focus(); el.innerHTML = arguments[0]; el.dispatchEvent(new Event('input', {bubbles:true})); }", content)
                    except Exception:
                        page.keyboard.type(content, delay=10)
                    _emit("正文内容填写完成", on_log)
                else:
                    _emit("未找到正文区域，跳过", on_log)
            else:
                _emit("无正文内容，跳过", on_log)

            # 文件上传可能在编辑器 frame 或内容 frame 中
            upload = None
            upload_frame = None
            for frame in [editor_frame, content_frame]:
                if frame is None:
                    continue
                try:
                    loc = frame.locator("input[type='file']").first
                    loc.wait_for(state="attached", timeout=3000)
                    upload = loc
                    upload_frame = frame
                    break
                except Exception:
                    continue
            if not upload:
                for f in page.frames:
                    try:
                        loc = f.locator("input[type='file']").first
                        loc.wait_for(state="attached", timeout=2000)
                        upload = loc
                        upload_frame = f
                        break
                    except Exception:
                        continue
            if not upload:
                raise RuntimeError("未找到图片上传入口")
            _emit("正在上传图片...", on_log)
            for i, img in enumerate(images):
                if Path(img).exists():
                    upload.set_input_files(img)
                    _emit(f"已上传图片 {i+1}/{len(images)}: {Path(img).name}", on_log)
                    _human_sleep(2.0, 1.0)

            # 等待图片在正文中渲染完成
            _human_sleep(2.0, 1.0)
            _emit("正在选择封面...", on_log)
            _select_cover(page, editor_frame, on_log)

            # 保存草稿或发布
            if save_draft:
                _emit("正在保存草稿...", on_log)
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
                _emit("草稿保存成功", on_log)
                return {"success": True, "message": "已保存为草稿", "title": title}
            else:
                _emit("已填充内容，正在发布...", on_log)
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

        _emit("发布成功", on_log)
        return {"success": True, "message": "发布成功", "title": title}
    except Exception as err:
        _emit(f"发布失败: {err}", on_log)
        return {"success": False, "message": str(err), "title": title}
