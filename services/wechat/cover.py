"""封面选择弹窗操作。"""

from pathlib import Path
from typing import Optional

from services.wechat.helpers import _click_first_available, _emit, _human_sleep


def _confirm_cover_dialogs(page, on_log=None) -> bool:
    """封面上传/选择后的确认和裁剪弹窗序列。"""
    # 需要在所有 frame 中查找按钮，裁剪弹窗可能在 iframe 中
    def _scopes():
        return [page] + [f for f in page.frames if not f.is_detached()]

    _emit("封面弹窗：点击下一步...", on_log)
    for scope in _scopes():
        if _click_first_available(scope, [
            "button:has-text('下一步')",
            "button:has-text('下一张')",
            "[class*='next']",
            ".weui-desktop-btn_primary",
        ], wait_ms=1500):
            break
    _human_sleep(0.5, 0.3)

    _emit("封面弹窗：确认选择...", on_log)
    for scope in _scopes():
        if _click_first_available(scope, [
            "button:has-text('确定')",
            "button:has-text('确认')",
            "button:has-text('完成')",
            "button:has-text('保存')",
        ], wait_ms=1500):
            break
    _human_sleep(0.5, 0.3)

    _emit("封面弹窗：裁剪完成...", on_log)
    for scope in _scopes():
        if _click_first_available(scope, [
            "button:has-text('完成')",
            "button:has-text('确定')",
            "button:has-text('保存')",
        ], wait_ms=1500):
            break
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
    _human_sleep(1.5, 0.5)

    # 4. 在弹窗中选择第一张图片（已上传到正文的图片）
    # 等待弹窗中图片加载
    _emit("等待弹窗图片加载...", on_log)
    for scope in [page] + page.frames:
        try:
            if scope.is_detached():
                continue
        except Exception:
            continue
        try:
            scope.wait_for_function("""() => {
                const dialogs = document.querySelectorAll(
                    '[role="dialog"], .weui-desktop-dialog, .weui-dialog, ' +
                    '[class*="dialog"], [class*="Dialog"], .weui-desktop-dialog__wrapper, ' +
                    '.appmsg_cover_selector');
                for (const dlg of dialogs) {
                    if (dlg.offsetParent === null) continue;
                    const imgs = dlg.querySelectorAll('img, [style*="background-image"]');
                    for (const img of imgs) {
                        const r = img.getBoundingClientRect();
                        if (r.width >= 50 && r.height >= 30) return true;
                    }
                }
                return false;
            }""", timeout=8000)
            _emit("弹窗图片已加载", on_log)
            break
        except Exception:
            continue

    for attempt in range(3):
        if attempt > 0:
            _emit(f"重试查找封面图片（第{attempt+1}次）...", on_log)
            _human_sleep(2.0, 0.5)

        # 方案 A: JS 查找弹窗中图片并点击其父容器（直接点击 img 可能不触发选择）
        for scope in [page] + page.frames:
            try:
                if scope.is_detached():
                    continue
                clicked = scope.evaluate("""() => {
                    const dialogs = document.querySelectorAll(
                        '[role="dialog"], .weui-desktop-dialog, .weui-dialog, ' +
                        '[class*="dialog"], [class*="Dialog"], .weui-desktop-dialog__wrapper, ' +
                        '.appmsg_cover_selector');
                    for (const dlg of dialogs) {
                        if (dlg.offsetParent === null) continue;
                        // 找图片项容器（li / item / label），点击容器而非 img
                        const items = dlg.querySelectorAll('li, [class*="item"], [class*="media"], ' +
                            'label, [class*="cover_item"], [class*="img_item"]');
                        for (const item of items) {
                            const r = item.getBoundingClientRect();
                            if (r.width >= 50 && r.height >= 30) {
                                item.click();
                                return true;
                            }
                        }
                        // 兜底：点击弹窗中第一张可见图片的父容器
                        const imgs = dlg.querySelectorAll('img');
                        for (const img of imgs) {
                            const r = img.getBoundingClientRect();
                            if (r.width >= 50 && r.height >= 30) {
                                const parent = img.closest('li, [class*="item"], [class*="media"], ' +
                                    'label, div[class], a') || img.parentElement;
                                parent.click();
                                return true;
                            }
                        }
                    }
                    // 兜底2：页面中任何宽高大于 80x60 的可见图片的父容器
                    const allImgs = document.querySelectorAll('img');
                    for (const img of allImgs) {
                        const r = img.getBoundingClientRect();
                        if (r.width >= 80 && r.height >= 60 && r.top >= 0) {
                            const parent = img.closest('li, [class*="item"], [class*="media"], ' +
                                'label, div[class], a') || img.parentElement;
                            parent.click();
                            return true;
                        }
                    }
                    return false;
                }""")
                if clicked:
                    _emit("已选择封面图片", on_log)
                    return _confirm_cover_dialogs(page, on_log)
            except Exception:
                continue

        # 方案 B: Playwright 原生方式——遍历 dialog 并点击图片的父容器
        for scope in [page] + page.frames:
            try:
                if scope.is_detached():
                    continue
            except Exception:
                continue

            for dialog_sel in ["[role='dialog']", ".weui-desktop-dialog", ".weui-dialog",
                               "[class*='dialog']", "[class*='Dialog']",
                               ".weui-desktop-dialog__wrapper",
                               ".appmsg_cover_selector"]:
                try:
                    dialog = scope.locator(dialog_sel).first
                    if not dialog.is_visible(timeout=300):
                        continue
                    # 找 dialog 中的图片项容器并点击
                    items = dialog.locator("li, [class*='item'], [class*='media'], "
                                           "label, [class*='cover_item'], [class*='img_item']")
                    count = items.count()
                    if count > 0:
                        box = items.first.bounding_box()
                        if box and box["width"] >= 50:
                            items.first.click()
                            _emit("已选择封面图片(原生方式)", on_log)
                            return _confirm_cover_dialogs(page, on_log)
                except Exception:
                    continue

    _emit("未找到可选封面图片", on_log)
    return False
