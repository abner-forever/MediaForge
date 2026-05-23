import random
import re
import time
from datetime import datetime
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


def _ensure_login(page, state_path: Optional[Path] = None,
                   on_scan_needed: Optional[Callable[[], None]] = None) -> None:
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


def _resolve_editor_frame(page):
    for f in page.frames:
        if "appmsg_edit" in f.url or "cgi-bin/appmsg" in f.url:
            return f
    return page.main_frame


def _log_frames(page) -> None:
    for i, f in enumerate(page.frames):
        logger.info("  frame[%d] url=%s", i, f.url[:200] if f.url else "(empty)")


def _fill_title_robustly(page, title: str) -> bool:
    """在所有 frame 中快速填写标题，优先匹配 placeholder。"""
    targets = [(page, "page")] + [(f, f.url[:60]) for f in page.frames]

    # 先瞬间检测一遍，不等 timeout
    quick_selectors = [
        "input[placeholder*='标题']",
        "textarea[placeholder*='标题']",
        "[placeholder*='标题']",
        "[data-placeholder*='标题']",
        "input[placeholder*='请输入']",
        "#js_title",
        "input.js_title",
        "[contenteditable][data-role='title']",
    ]
    for scope, label in targets:
        if _fill_first_quick(scope, quick_selectors, title):
            logger.info("  在 %s 中找到标题输入框", label)
            return True

    # 降级：带短 timeout 的 wait_for 重试
    wait_selectors = [
        "input[placeholder*='标题']",
        "textarea[placeholder*='标题']",
        "[placeholder*='标题']",
        "[data-placeholder*='标题']",
        "#js_title",
        ".title_editor input, .title_editor [contenteditable]",
        ".editor_title input, .editor_title [contenteditable]",
        "[contenteditable][data-role='title']",
    ]
    for scope, label in targets:
        if _fill_first_available(scope, wait_selectors, title, wait_ms=800):
            logger.info("  在 %s 中找到标题输入框(等待后)", label)
            return True

    # 兜底：找"标题"文字附近的可编辑区域
    for scope, label in targets:
        for text in ["标题", "请在这里输入标题"]:
            try:
                loc = scope.get_by_text(text, exact=False).first
                box = loc.bounding_box()
                if box:
                    page.mouse.click(box["x"] + box["width"] / 2, box["y"] + box["height"] + 25)
                    _human_sleep(0.3, 0.2)
                    page.keyboard.type(title, delay=20)
                    return True
            except Exception:
                continue

    return False


def _find_content_editor_js(page, editor_frame, content: str) -> bool:
    """通过 JavaScript 在所有 frame 中查找正文编辑器并直接填入内容。
    返回 True 表示填写成功，False 表示未找到正文区域。
    """
    frames_to_check = [editor_frame] + [f for f in page.frames if f != editor_frame and not f.is_detached()]
    # 去重但保持顺序
    seen = set()
    unique_frames = []
    for f in frames_to_check:
        fid = id(f)
        if fid not in seen:
            seen.add(fid)
            unique_frames.append(f)

    for f in unique_frames:
        try:
            success = f.evaluate("""(htmlContent) => {
                function findContentEditor() {
                    // 1) 按 ID 精确查找
                    const byId = document.getElementById('js_content');
                    if (byId && byId.isConnected) return byId;

                    // 2) 按 data-placeholder / placeholder 包含"正文"
                    const allEd = document.querySelectorAll('[contenteditable="true"]');
                    for (const el of allEd) {
                        const ph = (el.getAttribute('data-placeholder') || el.getAttribute('placeholder') || '').trim();
                        if (ph.includes('正文') || ph.includes('编辑区')) return el;
                    }

                    // 3) 有 ≥2 个可编辑区域 → 排除标题，取最大的
                    if (allEd.length >= 2) {
                        let best = null, bestArea = 0;
                        for (const el of allEd) {
                            const ph = (el.getAttribute('data-placeholder') || el.getAttribute('placeholder') || '').trim();
                            if (ph.includes('标题')) continue;
                            const r = el.getBoundingClientRect();
                            if (r.width < 50 || r.height < 30) continue;
                            const area = r.width * r.height;
                            if (area > bestArea) { bestArea = area; best = el; }
                        }
                        if (best) return best;
                        // 没有排除到标题 → 取面积第二大的（标题通常比正文小）
                        const sorted = [...allEd].sort((a, b) => {
                            const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
                            return (rb.width * rb.height) - (ra.width * ra.height);
                        });
                        if (sorted.length >= 2) return sorted[0]; // 最大的可能是正文
                    }

                    // 4) 仅一个 contenteditable
                    if (allEd.length === 1) {
                        const ph = (allEd[0].getAttribute('data-placeholder') || allEd[0].getAttribute('placeholder') || '').trim();
                        if (!ph.includes('标题')) return allEd[0];
                    }

                    return null;
                }

                const el = findContentEditor();
                if (!el) return false;

                el.focus();
                el.innerHTML = htmlContent;
                el.dispatchEvent(new Event('input', { bubbles: true }));
                return true;
            }""", content)
            if success:
                _emit(f"在 frame {f.url[:60] or '(empty)'} 中找到正文编辑器", None)
                return True
        except Exception as e:
            logger.debug("frame 查找失败: %s", e)
            continue

    return False


def _confirm_cover_dialogs(page, on_log=None) -> bool:
    """封面上传/选择后的确认和裁剪弹窗序列。"""
    _emit("封面弹窗：点击下一步...", on_log)
    _click_first_available(page, [
        "button:has-text('下一步')",
        "button:has-text('下一张')",
        "[class*='next']",
        ".weui-desktop-btn_primary",
    ], wait_ms=4000)
    _human_sleep(0.5, 0.3)

    _emit("封面弹窗：确认选择...", on_log)
    _click_first_available(page, [
        "button:has-text('确定')",
        "button:has-text('确认')",
        "button:has-text('完成')",
        "button:has-text('保存')",
    ], wait_ms=4000)
    _human_sleep(0.5, 0.3)

    _emit("封面弹窗：裁剪完成...", on_log)
    _click_first_available(page, [
        "button:has-text('完成')",
        "button:has-text('确定')",
        "button:has-text('保存')",
    ], wait_ms=4000)
    _human_sleep(0.5, 0.3)

    _emit("封面设置流程完成", on_log)
    return True


def _select_cover(page, editor_frame, on_log=None, cover_path: Optional[str] = None, force_from_body: bool = False) -> bool:
    """选择封面：有封面图片则从正文选择，否则尝试直接上传或从正文选择。

    微信编辑器当前封面选择弹窗有三个 tab：
      AI配图 / 从正文选择 / 上传
    force_from_body=True 时强制使用「从正文选择」（封面已预先上传到正文首张）。
    """
    _human_sleep(1.0, 0.5)
    _emit("正在查找封面设置区域...", on_log)

    # 1. 点击"选择封面"
    if not _click_first_available(page, [
        "text=选择封面",
        "text=点击选择封面",
        "text=设置封面",
        "text=添加封面",
        "a:has-text('选择封面')",
        "button:has-text('选择封面')",
        "span:has-text('选择封面')",
        ".js_cover_area",
        "#js_cover_area",
        "[class*='cover_set']",
        "[class*='cover_setting']",
        "[class*='js_cover']",
        ".appmsg_cover",
        "[data-role='cover']",
    ], wait_ms=4000):
        _emit("未找到选择封面按钮，跳过封面设置", on_log)
        return False
    _emit("已点击选择封面", on_log)
    _human_sleep(0.8, 0.3)

    # 2. 有封面图片路径且非强制从正文选择 → 尝试直接上传
    if cover_path and Path(cover_path).exists() and not force_from_body:
        _emit("已有封面图片，尝试直接上传...", on_log)
        # 弹窗中找"上传" tab/选项
        upload_tab_found = False
        for scope in [page, editor_frame]:
            for sel in [
                "text=上传封面",
                "text=上传",
                "button:has-text('上传')",
                "span:has-text('上传')",
                "div:has-text('上传')",
                ".weui-desktop-dialog__wrapper >> text=上传",
                "[class*='tab'] >> text=上传",
                "[class*='Tab'] >> text=上传",
            ]:
                try:
                    loc = scope.locator(sel).first
                    if loc.is_visible(timeout=1000):
                        loc.click()
                        _emit("已切换到上传 tab", on_log)
                        _human_sleep(0.5, 0.3)
                        upload_tab_found = True
                        break
                except Exception:
                    continue
            if upload_tab_found:
                break

        if upload_tab_found:
            # 找到文件输入框上传封面
            for f in [page] + page.frames:
                try:
                    fi = f.locator("input[type='file']").first
                    fi.wait_for(state="attached", timeout=3000)
                    fi.set_input_files(cover_path)
                    _emit(f"封面图片已上传: {Path(cover_path).name}", on_log)
                    _human_sleep(3.0, 1.0)

                    # 封面上传后直接点击确定/完成，不需要再选缩略图
                    _emit("封面弹窗：确认上传...", on_log)
                    _click_first_available(page, [
                        "button:has-text('确定')",
                        "button:has-text('确认')",
                        "button:has-text('完成')",
                        "button:has-text('保存')",
                        ".weui-desktop-btn_primary",
                    ], wait_ms=4000)
                    _human_sleep(0.8, 0.3)
                    _emit("封面设置流程完成", on_log)
                    return True
                except Exception as e:
                    _emit(f"上传封面失败: {e}", on_log)
                    continue

            _emit("未能找到文件输入框上传封面", on_log)

    # 3. 降级：从正文选择
    _emit("尝试从正文选择封面...", on_log)
    from_body_selectors = [
        "text=从正文选择",
        "text=从正文选择图片",
        "a:has-text('从正文选择')",
        "li:has-text('从正文选择')",
        "div:has-text('从正文选择')",
        "span:has-text('从正文选择')",
        "[class*='tab'] >> text=从正文选择",
        "[class*='Tab'] >> text=从正文选择",
        ".weui-desktop-dialog__wrapper >> text=从正文选择",
        "[class*='dropdown'] >> text=从正文选择",
        ".weui-desktop-dropdown__menu >> text=从正文选择",
        ".weui-desktop-dropdown__menu li:first-child",
        "[class*='menu'] >> text=从正文选择",
    ]
    clicked = False
    for scope in [editor_frame, page]:
        for sel in from_body_selectors:
            try:
                loc = scope.locator(sel).first
                if loc.is_visible(timeout=1500):
                    loc.click()
                    clicked = True
                    break
            except Exception:
                continue
        if clicked:
            break
    if not clicked:
        # 兜底：get_by_text 在整个页面中找
        try:
            loc = page.get_by_text("从正文选择", exact=False).first
            if loc.is_visible(timeout=1000):
                loc.click()
                clicked = True
        except Exception:
            pass

    if not clicked:
        _emit("未找到从正文选择，跳过封面设置", on_log)
        return False
    _emit("已点击从正文选择", on_log)
    _human_sleep(0.5, 0.3)

    # 4. 在弹窗中选择第一张图片（已上传到正文的图片）
    for attempt in range(3):
        if attempt > 0:
            _emit(f"重试查找封面图片（第{attempt+1}次）...", on_log)
            _human_sleep(2.0, 0.5)
        img_selectors = [
            ".weui-desktop-dialog__body img",
            ".weui-desktop-dialog__bd img",
            ".weui-desktop-dialog img",
            ".weui-desktop-dialog li",
            "[role='dialog'] img",
            "[role='dialog'] li",
            ".weui-desktop-grid__item",
            "[class*='img-picker'] li",
            "[class*='imgPicker'] li",
        ]
        if _click_first_available(page, img_selectors, wait_ms=3000):
            _emit("已选择封面图片", on_log)
            return _confirm_cover_dialogs(page, on_log)

        # 降级：dialog 内任何可见图片
        for scope in [page] + page.frames:
            for role_sel in ["[role='dialog']", ".weui-desktop-dialog"]:
                try:
                    dialog = scope.locator(role_sel).first
                    if dialog.is_visible(timeout=500):
                        imgs = dialog.locator("img")
                        if imgs.count() > 0:
                            imgs.first.click()
                            _emit("降级选择封面图片", on_log)
                            return _confirm_cover_dialogs(page, on_log)
                except Exception:
                    continue

    _emit("未找到可选封面图片", on_log)
    return False




def publish_article(
    title: str,
    content: str,
    images: List[str],
    cover: Optional[str] = None,
    dry_run: bool = False,
    save_draft: bool = False,
    account_id: Optional[str] = None,
    on_scan_needed: Optional[Callable[[], None]] = None,
    on_confirm_needed: Optional[Callable[[str], bool]] = None,
    on_log: Optional[Callable[[str], None]] = None,
) -> Dict[str, Any]:
    """
    发布文章到微信公众号。

    Args:
        save_draft: True 则保存草稿不发布，False 则直接发布
        cover: 封面图片的绝对路径，有则直接上传，无则从正文选择
        account_id: 多账号 ID，指定使用哪个公众号的浏览器配置
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
            # 根据 account_id 解析浏览器配置文件和 state 路径
            if account_id:
                from utils.wechat_auth_store import get_account_paths, update_account
                user_data_dir, state_path = get_account_paths(account_id)
                state_path_global = state_path
            else:
                user_data_dir = DATA_DIR / "state" / "wechat_chromium_profile"
                state_path_global = WECHAT_STATE_PATH
            user_data_dir.mkdir(parents=True, exist_ok=True)
            state_path_global.parent.mkdir(parents=True, exist_ok=True)
            context = p.chromium.launch_persistent_context(
                user_data_dir=str(user_data_dir),
                headless=False,
            )
            # 使用浏览器默认打开的页面，避免创建新页面导致出现空白窗口
            pages = context.pages
            page = pages[0] if pages else context.new_page()
            page.goto("https://mp.weixin.qq.com/", wait_until="domcontentloaded")
            _emit("正在登录微信公众号...", on_log)
            _ensure_login(page, state_path=state_path_global, on_scan_needed=on_scan_needed)
            _emit("登录成功", on_log)

            # 直接用 token 跳转新建图文页，避免逐个点击导航链接的等待
            if not _goto_new_article_direct(page):
                raise RuntimeError("无法从当前页面提取 token 进入编辑器")
            _emit("已通过直达链接进入新建图文页，等待编辑器加载...", on_log)
            # 注意：微信编辑器有后台轮询（自动保存、统计），networkidle 几乎不会触发
            # 用 load 确保 DOM 加载完成即可，然后直接等标题输入框
            page.wait_for_load_state("load")
            _human_sleep(2.0, 1.0)
            _log_frames(page)
            editor_frame = _resolve_editor_frame(page)

            _emit("正在填写标题...", on_log)
            if not _fill_title_robustly(page, title):
                raise RuntimeError("未找到标题输入框")
            _emit("标题填写完成", on_log)

            # 有正文内容时才填写
            content_frame = None
            if content and content.strip():
                _emit("正在填写正文内容...", on_log)
                if _find_content_editor_js(page, editor_frame, content):
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

            # 有封面时：先把封面上传到正文最顶部，再传其他图片
            all_images = list(images)
            has_cover_uploaded = cover and Path(cover).exists()
            if has_cover_uploaded and cover not in all_images:
                all_images.insert(0, cover)

            for i, img in enumerate(all_images):
                if Path(img).exists():
                    upload.set_input_files(img)
                    _emit(f"已上传图片 {i+1}/{len(all_images)}: {Path(img).name}", on_log)
                    _human_sleep(2.0, 1.0)

            # 等待图片上传完成并渲染（多图需更长时间）
            _emit("等待图片上传完成...", on_log)
            _human_sleep(max(3.0, len(images) * 0.5), 1.0)

            # 有封面时：将封面图移动到正文最前面（封面在上传列表第一个，对应正文中第一个 img）
            if has_cover_uploaded:
                _emit("正在将封面图移动到正文最前面...", on_log)
                for f in [editor_frame, page.main_frame] + page.frames:
                    if f.is_detached():
                        continue
                    try:
                        moved = f.evaluate("""() => {
                            const ed = document.querySelector('#js_content') || document.querySelector('[contenteditable="true"]');
                            if (!ed) return false;
                            const firstImg = ed.querySelector('img');
                            if (!firstImg) return false;
                            const firstChild = ed.firstChild;
                            if (firstChild && firstChild.contains(firstImg)) return true;
                            const para = firstImg.closest('p') || firstImg.parentElement;
                            if (para && para !== ed) {
                                ed.insertBefore(para, ed.firstChild);
                            } else {
                                ed.insertBefore(firstImg, ed.firstChild);
                            }
                            ed.dispatchEvent(new Event('input', { bubbles: true }));
                            return true;
                        }""")
                        if moved:
                            _emit("封面图已移动到正文最前面", on_log)
                            break
                    except Exception as e:
                        logger.debug("移动封面图失败: %s", e)
                        continue

            if cover:
                _emit("正在选择封面...", on_log)
                cover_ok = _select_cover(page, editor_frame, on_log, cover, force_from_body=has_cover_uploaded)
                if not cover_ok:
                    _emit("封面未设置（不影响草稿保存）", on_log)
            else:
                cover_ok = False
                _emit("无封面设置要求，跳过", on_log)

            # 保存草稿或发布
            if save_draft:
                _emit("正在保存草稿（第一遍：含封面）...", on_log)
                if not _click_first_available(
                    editor_frame,
                    [
                        "button:has-text('保存为草稿')",
                        "a:has-text('保存为草稿')",
                        "button:has-text('保存草稿')",
                        "a:has-text('保存草稿')",
                        "button:has-text('保存')",
                    ],
                    wait_ms=5000,
                ):
                    raise RuntimeError("未找到保存草稿按钮")
                # 等待保存确认（微信编辑器异步保存，需等待成功提示出现）
                def _wait_save_done(page) -> bool:
                    for s in range(15):
                        for hint in ["保存成功", "已保存", "草稿已保存"]:
                            try:
                                if page.locator(f"text={hint}").first.is_visible(timeout=800):
                                    return True
                            except Exception:
                                continue
                        _human_sleep(1.0, 0.3)
                    return False

                save_ok = _wait_save_done(page)
                if not save_ok:
                    _emit("未检测到第一次保存成功的提示，但可能已保存", on_log)

                # 有正文内容的文章才执行两步保存（删除正文首张封面图），纯图片帖子保留所有图片
                if has_cover_uploaded and cover_ok and content and content.strip():
                    _emit("正在删除正文中的封面图（两步保存）...", on_log)
                    _human_sleep(1.0, 0.5)

                    # 重新获取 editor_frame（第一次保存后 iframe 可能已刷新）
                    editor_frame = _resolve_editor_frame(page)

                    # 在编辑器 frame 中删除正文第一个 img（封面）
                    removed = False
                    for f in [editor_frame, page.main_frame] + page.frames:
                        if f.is_detached():
                            continue
                        try:
                            ok = f.evaluate("""() => {
                                const ed = document.querySelector('#js_content') || document.querySelector('[contenteditable="true"]');
                                if (!ed) return false;
                                const imgs = ed.querySelectorAll('img');
                                if (imgs.length === 0) return false;
                                const first = imgs[0];
                                // 删除图片所在的整个段落，避免留空行
                                let target = first;
                                const parent = first.parentElement;
                                if (parent && parent.tagName === 'P' && parent.closest('#js_content, [contenteditable]')) {
                                    target = parent;
                                }
                                target.remove();
                                ed.dispatchEvent(new Event('input', { bubbles: true }));
                                // 确认图片已删除
                                return ed.querySelectorAll('img').length === imgs.length - 1;
                            }""")
                            if ok:
                                _emit("正文首张封面图片已删除", on_log)
                                removed = True
                                break
                        except Exception as e:
                            logger.debug("删除封面图失败 (frame %s): %s", f.url[:60], e)
                            continue

                    if not removed:
                        _emit("未能在正文中找到封面图片，但封面已在第一步设置完成", on_log)

                    _human_sleep(0.5, 0.3)

                    _emit("正在保存草稿（第二遍：已删除封面）...", on_log)
                    if not _click_first_available(
                        editor_frame,
                        [
                            "button:has-text('保存为草稿')",
                            "a:has-text('保存为草稿')",
                            "button:has-text('保存草稿')",
                            "a:has-text('保存草稿')",
                            "button:has-text('保存')",
                        ],
                        wait_ms=5000,
                    ):
                        _emit("未找到第二遍保存草稿按钮，但封面已上传设置完成", on_log)
                    else:
                        save_ok2 = _wait_save_done(page)
                        if save_ok2:
                            _emit("第二遍草稿保存成功（封面已从正文移除）", on_log)
                        else:
                            _emit("第二遍保存未检测到确认提示", on_log)

                context.storage_state(path=str(state_path_global))
                if account_id:
                    update_account(account_id, last_used=datetime.now().isoformat())
                context.close()
                _emit("草稿保存成功", on_log)
                msg = "已保存为草稿" + ("（未设置封面）" if not cover_ok else "")
                return {"success": True, "message": msg, "title": title}
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
                context.storage_state(path=str(state_path_global))
                if account_id:
                    update_account(account_id, last_used=datetime.now().isoformat())
                context.close()

        _emit("发布成功", on_log)
        msg = "发布成功" + ("（未设置封面）" if not cover_ok else "")
        return {"success": True, "message": msg, "title": title}
    except Exception as err:
        err_msg = str(err)
        if "Executable doesn't exist" in err_msg:
            err_msg = "未找到 Playwright 浏览器引擎，请在终端运行: playwright install chromium"
        _emit(f"发布失败: {err_msg}", on_log)
        return {"success": False, "message": err_msg, "title": title}
