"""微信编辑器 frame 检测与内容填写。"""

import time

from services.wechat.helpers import _emit, _fill_first_available, _fill_first_quick, _human_sleep


def _match_editor_frame(f) -> bool:
    """判断 frame 的 URL 是否为微信编辑器。"""
    try:
        url = f.url or ""
        return "appmsg_edit" in url or "cgi-bin/appmsg" in url
    except Exception:
        return False


def _resolve_editor_frame(page):
    """查找编辑器 iframe，优先 URL 匹配，兜底内容检测。"""
    # 优先级 1：URL 匹配
    for f in page.frames:
        if _match_editor_frame(f):
            return f
    # 优先级 2：直接找内容编辑器（处理 URL 变化或未匹配场景）
    for f in page.frames:
        try:
            if f.locator("#js_content, [contenteditable]").first.count() > 0:
                return f
        except Exception:
            continue
    return page.main_frame


def _wait_for_editor_frame(page, on_log, timeout=15):
    """等待编辑器 iframe 出现并加载完成。

    图片上传等操作会使 iframe 刷新，此时需要等待新 frame 出现
    或已有 frame 完成导航。结合 event-driven（新 frame attach）
    和轮询（in-place 导航）两种策略。
    """
    try:
        frame = _resolve_editor_frame(page)
        if frame != page.main_frame:
            return frame

        _emit("编辑器 iframe 未就绪，等待重试...", on_log)
        deadline = time.time() + timeout

        while time.time() < deadline:
            remaining = deadline - time.time()
            wait_ms = min(3000, int(remaining * 1000))
            if wait_ms < 200:
                break

            # 策略 A：等待新 frame attach（event-driven，不浪费 CPU）
            try:
                new_frame = page.wait_for_frame(_match_editor_frame, timeout=wait_ms)
                _emit("编辑器 iframe 已就绪", on_log)
                return new_frame
            except Exception:
                pass

            # 策略 B：检查已有 frame（处理 in-place 导航）
            frame = _resolve_editor_frame(page)
            if frame != page.main_frame:
                _emit("编辑器 iframe 已就绪", on_log)
                return frame

        _emit("编辑器 iframe 等待超时，将在主页面中继续操作", on_log)
    except Exception as e:
        logger.warning("等待编辑器 iframe 时出现异常: %s", e)
    return page.main_frame


# 延迟导入避免循环依赖
from utils.logger import get_logger
logger = get_logger(__name__)


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
