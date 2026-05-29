"""文章发布主流程 — Playwright 自动化保存草稿或发布到微信公众号。"""

import random
import time
from datetime import datetime
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional

from playwright.sync_api import sync_playwright

from config import DATA_DIR, WECHAT_STATE_PATH
from utils.logger import get_logger

from services.wechat.helpers import (
    _click_first_available,
    _emit,
    _ensure_login,
    _goto_new_article_direct,
    _human_sleep,
    _log_frames,
)
from services.wechat.editor import (
    _fill_title_robustly,
    _find_content_editor_js,
    _resolve_editor_frame,
    _wait_for_editor_frame,
)
from services.wechat.cover import _select_cover
from services.wechat.upload import _resize_image_if_needed

logger = get_logger(__name__)


def publish_article(
    title: str,
    content: str,
    images: List[str],
    cover: Optional[str] = None,
    dry_run: bool = False,
    save_draft: bool = False,
    account_id: Optional[str] = None,
    headless: bool = False,
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

    _save_result = None
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
                headless=headless,
                channel="chromium",
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

            uploaded_tmp_files: List[str] = []
            try:
                for i, img in enumerate(all_images):
                    if Path(img).exists():
                        upload_path = _resize_image_if_needed(img)
                        if upload_path != img:
                            uploaded_tmp_files.append(upload_path)
                        upload.set_input_files(upload_path)
                        _emit(f"已上传图片 {i+1}/{len(all_images)}: {Path(img).name}", on_log)
                        _human_sleep(2.0, 1.0)
            finally:
                for tmp in uploaded_tmp_files:
                    try:
                        Path(tmp).unlink(missing_ok=True)
                    except Exception:
                        pass

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
                # 上传图片和设置封面后，编辑器 iframe 可能正在重新加载
                def _ensure_save_scopes():
                    scopes = [editor_frame]
                    if editor_frame != page.main_frame:
                        scopes.append(page.main_frame)
                    for f in page.frames:
                        if f not in scopes:
                            scopes.append(f)
                    return scopes

                save_selectors = [
                    "button:has-text('保存为草稿')",
                    "a:has-text('保存为草稿')",
                    "button:has-text('保存草稿')",
                    "a:has-text('保存草稿')",
                    "button:has-text('保存')",
                ]

                def _click_save_button() -> bool:
                    scopes = _ensure_save_scopes()
                    for scope in scopes:
                        try:
                            if scope.is_detached():
                                continue
                        except Exception:
                            continue
                        if _click_first_available(scope, save_selectors, wait_ms=5000):
                            return True
                    return False

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

                # 重试循环：最多 3 次
                save_ok = False
                for retry in range(3):
                    if retry > 0:
                        _emit(f"正在重试保存草稿（第{retry+1}次）...", on_log)
                        _human_sleep(1.0, 0.5)
                    editor_frame = _wait_for_editor_frame(page, on_log)

                    _emit("正在保存草稿...", on_log)
                    if not _click_save_button():
                        if retry < 2:
                            continue
                        raise RuntimeError("未找到保存草稿按钮")
                    save_ok = _wait_save_done(page)
                    if save_ok:
                        break

                if save_ok:
                    _emit("草稿保存成功", on_log)
                    msg = "已保存为草稿" + ("（未设置封面）" if not cover_ok else "")
                    _save_result = {"success": True, "message": msg, "title": title}
                else:
                    _emit("草稿保存失败：重试 3 次后仍未检测到保存成功提示", on_log)
                try:
                    context.storage_state(path=str(state_path_global))
                    if account_id:
                        update_account(account_id, last_used=datetime.now().isoformat())
                    context.close()
                except Exception:
                    pass
            else:
                _emit("已填充内容，正在发布...", on_log)
                if on_confirm_needed:
                    if not on_confirm_needed(title):
                        context.close()
                        return {"success": False, "message": "用户取消发布", "title": title}
                else:
                    input("确认后按回车继续，程序将尝试点击发布按钮...")

                # 图片上传后 iframe 可能已刷新，重新获取编辑器 frame
                editor_frame = _resolve_editor_frame(page)
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
                _save_result = {"success": True, "message": "发布成功" + ("（未设置封面）" if not cover_ok else ""), "title": title}
                try:
                    context.storage_state(path=str(state_path_global))
                    if account_id:
                        update_account(account_id, last_used=datetime.now().isoformat())
                    context.close()
                except Exception:
                    pass

        if _save_result:
            return _save_result
        if save_draft:
            # save_draft=True 但 _save_result 没被设置 → 保存失败
            msg = "保存草稿失败：未能确认草稿已保存"
            _emit(msg, on_log)
            return {"success": False, "message": msg, "title": title}
        _emit("发布成功", on_log)
        msg = "发布成功" + ("（未设置封面）" if not cover_ok else "")
        return {"success": True, "message": msg, "title": title}
    except Exception as err:
        err_msg = str(err)
        if "Executable doesn't exist" in err_msg:
            err_msg = "未找到 Playwright 浏览器引擎，请在终端运行: playwright install chromium"
        _emit(f"发布失败: {err_msg}", on_log)
        return {"success": False, "message": err_msg, "title": title}
