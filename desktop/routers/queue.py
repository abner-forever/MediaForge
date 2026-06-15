"""Publish Queue API 路由。"""

from __future__ import annotations

import logging
import sys
import threading
from pathlib import Path
from typing import List, Optional

from fastapi import APIRouter, HTTPException, Query

# 确保项目根目录在 sys.path 中
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from config import DOWNLOAD_DIR
from desktop.app_state import app_state
from desktop.api_helpers import (
    EnqueueRequest,
    PublishRequest,
    QueueAddRequest,
    QueueUpdateRequest,
    friendly_error_message,
    raise_friendly,
)
from services.ai import generate_content, polish_queue_caption, strip_emoji
from services.extensions import select_cover

router = APIRouter(tags=["queue"])
logger = logging.getLogger(__name__)


@router.get("/api/queue")
async def get_queue():
    return {"queue": app_state.get_queue()}


@router.post("/api/queue")
async def add_to_queue(req: QueueAddRequest):
    item = {
        "title": req.title,
        "desc": req.desc,
        "images": list(req.images),
        "cover": req.cover or (req.images[0] if req.images else ""),
    }
    app_state.add_to_queue(item)
    return {"success": True, "queue": app_state.get_queue()}


@router.put("/api/queue/{item_id}")
async def update_queue_item(item_id: str, req: QueueUpdateRequest):
    updates = {}
    if req.title is not None:
        updates["title"] = strip_emoji(req.title)
    if req.desc is not None:
        updates["desc"] = req.desc
    if req.images is not None:
        updates["images"] = req.images
    if req.cover is not None:
        updates["cover"] = req.cover
    if req.account_id is not None:
        updates["account_id"] = req.account_id
    if req.status is not None:
        updates["status"] = req.status
    if app_state.update_queue_item_by_id(item_id, updates):
        return {"success": True, "queue": app_state.get_queue()}
    raise HTTPException(404, "队列项不存在")


@router.delete("/api/queue/{item_id}")
async def remove_from_queue(item_id: str, delete_local: bool = Query(False)):
    item = app_state.get_queue_item_by_id(item_id)
    if not item:
        raise HTTPException(404, "队列项不存在")
    if delete_local:
        images = item.get("images", [])
        for img_path in images:
            try:
                full_path = Path(img_path) if Path(img_path).is_absolute() else DOWNLOAD_DIR / img_path
                if full_path.exists():
                    full_path.unlink()
            except Exception as e:
                logger.debug("删除图片文件失败: %s", e)
        if images:
            try:
                first = Path(images[0]) if Path(images[0]).is_absolute() else DOWNLOAD_DIR / images[0]
                post_dir = first.parent
                if post_dir.exists() and post_dir != DOWNLOAD_DIR and not any(post_dir.iterdir()):
                    post_dir.rmdir()
            except Exception as e:
                logger.debug("删除空目录失败: %s", e)
    if app_state.remove_from_queue_by_id(item_id):
        return {"success": True, "queue": app_state.get_queue()}
    raise HTTPException(404, "队列项不存在")


@router.delete("/api/queue/{item_id}/image")
async def remove_image_from_queue(item_id: str, image_path: str = Query(...), delete_local: bool = Query(False)):
    item = app_state.get_queue_item_by_id(item_id)
    if not item:
        raise HTTPException(404, "队列项不存在")
    images = list(item.get("images", []))
    if image_path not in images:
        raise HTTPException(404, "图片不存在")
    images.remove(image_path)
    updates: dict = {"images": images}
    if item.get("cover") == image_path:
        updates["cover"] = images[0] if images else ""
    if delete_local:
        try:
            full_path = Path(image_path) if Path(image_path).is_absolute() else DOWNLOAD_DIR / image_path
            if full_path.exists():
                full_path.unlink()
        except Exception as e:
            logger.debug("删除图片文件失败: %s", e)
    app_state.update_queue_item_by_id(item_id, updates)
    return {"success": True, "queue": app_state.get_queue()}


@router.post("/api/queue/{item_id}/remove-watermark")
async def remove_watermark_from_image(item_id: str, image_path: str = Query(...)):
    from services.watermark_remover import remove_watermark

    item = app_state.get_queue_item_by_id(item_id)
    if not item:
        raise HTTPException(404, "队列项不存在")
    images = list(item.get("images", []))
    if image_path not in images:
        raise HTTPException(404, "图片不存在")

    full_path = Path(image_path) if Path(image_path).is_absolute() else DOWNLOAD_DIR / image_path
    if not full_path.exists():
        raise HTTPException(404, "图片文件不存在")

    result = remove_watermark(str(full_path))
    return {**result, "queue": app_state.get_queue()}


@router.post("/api/queue/{item_id}/remove-watermarks")
async def batch_remove_watermarks(item_id: str):
    from services.watermark_remover import remove_watermark

    item = app_state.get_queue_item_by_id(item_id)
    if not item:
        raise HTTPException(404, "队列项不存在")
    images = list(item.get("images", []))
    if not images:
        raise HTTPException(400, "没有图片")

    results = []
    processed = 0
    skipped = 0
    failed = 0
    for img in images:
        full_path = Path(img) if Path(img).is_absolute() else DOWNLOAD_DIR / img
        if not full_path.exists():
            results.append({"image": img, "success": False, "message": "文件不存在"})
            failed += 1
            continue
        r = remove_watermark(str(full_path))
        results.append({"image": img, **r})
        if r.get("success") and r.get("action") != "none":
            processed += 1
        elif r.get("success"):
            skipped += 1
        else:
            failed += 1

    return {
        "success": True,
        "processed": processed,
        "skipped": skipped,
        "failed": failed,
        "total": len(images),
        "results": results,
        "queue": app_state.get_queue(),
    }


@router.post("/api/queue/{item_id}/generate")
async def generate_queue_content(item_id: str):
    from config import settings

    item = app_state.get_queue_item_by_id(item_id)
    if not item:
        raise HTTPException(404, "队列项不存在")
    celebrity = item.get("celebrity", "")
    original_title = item.get("title", "")
    original_desc = item.get("desc", "")

    if not settings.ai_api_key:
        return {"success": False, "title": original_title, "desc": original_desc, "message": "暂未配置APIKey"}

    # 优先使用 desc，其次用 title
    input_text = (original_desc or original_title or "").strip()

    # 如果已有内容，确保带上「明星 | 」格式
    if input_text:
        if celebrity and not input_text.startswith(f"{celebrity} | "):
            input_text = f"{celebrity} | {input_text}"
    else:
        # 空内容，生成默认
        new_desc = f"{celebrity} | 今日美图分享" if celebrity else "今日美图分享"
        app_state.update_queue_item_by_id(item_id, {"title": new_desc[:20], "desc": new_desc})
        app_state.add_operation("AI 润色", f"为「{celebrity or '未知'}」生成默认文案")
        return {"success": True, "title": new_desc[:20], "desc": new_desc, "message": ""}

    # 调用 AI 润色图集文案
    ai_result = polish_queue_caption(input_text)
    ai_result = strip_emoji(ai_result).strip()

    # 校验结果
    if not ai_result or len(ai_result) < 4:
        msg = "AI 润色失败，已保留原内容"
        app_state.add_operation("AI 润色", f"为「{celebrity or '未知'}」生成文案失败")
        return {"success": False, "title": original_title, "desc": original_desc, "message": msg}

    # 确保输出格式符合要求
    if celebrity and not ai_result.startswith(f"{celebrity} | "):
        ai_result = f"{celebrity} | {ai_result}"

    # 限制长度，取前 200 字符
    ai_desc = ai_result[:200]
    # 从文案取前 20 字作为标题
    if " | " in ai_desc:
        name_part, desc_part = ai_desc.split(" | ", 1)
        ai_title = f"{name_part} | {desc_part[:16]}" if len(desc_part) > 16 else ai_desc
    else:
        ai_title = ai_desc[:20]

    app_state.update_queue_item_by_id(item_id, {"title": ai_title, "desc": ai_desc})
    app_state.add_operation("AI 润色", f"为「{celebrity or '未知'}」生成文案")
    return {"success": True, "title": ai_title, "desc": ai_desc, "message": ""}


def _run_queue_publish_background(
    item_id: str,
    title: str,
    desc: str,
    abs_images: List[str],
    abs_cover: Optional[str],
    dry_run: bool,
    save_draft: bool,
    account_id: Optional[str],
    headless: bool,
    publish_session_id: str,
    raw_images: List[str],
    item_account_id: str,
    item_type: Optional[str],
):
    """后台线程执行发布操作。"""
    from services.wechat import publish_article

    def _on_log(msg: str) -> None:
        app_state.add_publish_log(msg, session_id=publish_session_id)

    try:
        result = publish_article(
            title=title,
            content=desc,
            images=abs_images,
            cover=abs_cover,
            dry_run=dry_run,
            save_draft=save_draft,
            account_id=account_id,
            headless=headless,
            on_scan_needed=lambda: _on_log("请在弹出的浏览器窗口中扫码登录"),
            on_confirm_needed=lambda t: True,
            on_log=_on_log,
        )
    except Exception as err:
        msg = friendly_error_message(err)
        _on_log(msg)
        app_state.finish_publish()
        fail_updates = {"status": "failed", "error": msg, "publish_logs": app_state.get_publish_logs(session_id=publish_session_id)}
        app_state.update_queue_item_by_id(item_id, fail_updates)
        return

    app_state.finish_publish()
    updates = {"publish_logs": app_state.get_publish_logs(session_id=publish_session_id)}
    if result.get("success"):
        action = "保存草稿" if save_draft else "发布"
        app_state.add_operation(action, f"「{title}」")
        updates["status"] = "saved_to_wechat" if save_draft else "published"
        updates["account_id"] = account_id or item_account_id
        updates["error"] = ""
        # 发布成功后扣除积分（保存草稿不扣）
        if not save_draft:
            from desktop.app_state import PUBLISH_COST
            app_state.spend_credits(PUBLISH_COST, "publish", f"发布文章「{title}」")
        for img in raw_images:
            app_state.update_materials_meta(img, {"used_count": (app_state.get_materials_meta(img) or {}).get("used_count", 0) + 1})
    else:
        updates["status"] = "failed"
        updates["error"] = friendly_error_message(result.get("message", "发布失败"))
    app_state.update_queue_item_by_id(item_id, updates)


@router.post("/api/queue/{item_id}/publish")
async def publish_from_queue(item_id: str, req: PublishRequest):
    item = app_state.get_queue_item_by_id(item_id)
    if not item:
        raise HTTPException(404, "队列项不存在")
    title = strip_emoji(item.get("title", ""))
    desc = item.get("desc", "")
    images = item.get("images", [])
    cover = item.get("cover", "")
    if not images and item.get("type") != "article":
        raise_friendly(400, "没有图片")
    if not title:
        raise_friendly(400, "标题为空")

    # 发布前检查积分（保存草稿不扣积分）
    if not req.save_draft and not req.dry_run:
        from desktop.app_state import PUBLISH_COST
        balance = app_state.get_credits_balance()
        if balance < PUBLISH_COST:
            raise HTTPException(
                402,
                f"积分不足，当前余额 {balance} 积分，发布需要 {PUBLISH_COST} 积分。请先签到或获取积分。"
            )

    publish_session_id = item.get("id", "")
    app_state.clear_publish_logs(session_id=publish_session_id)
    if publish_session_id:
        app_state.update_queue_item_by_id(publish_session_id, {"publish_logs": [], "status": "publishing"})

    abs_images = [str(DOWNLOAD_DIR / img) if not Path(img).is_absolute() else img for img in images]
    abs_cover: Optional[str] = None
    if cover:
        cover_abs = str(DOWNLOAD_DIR / cover) if not Path(cover).is_absolute() else cover
        if Path(cover_abs).exists():
            abs_cover = cover_abs

    if item.get("type") != "article" and abs_cover:
        abs_images = [abs_cover] + [img for img in abs_images if img != abs_cover]

    threading.Thread(
        target=_run_queue_publish_background,
        args=(
            item_id, title, desc, abs_images, abs_cover,
            req.dry_run, req.save_draft, req.account_id,
            req.headless,
            publish_session_id, list(images),
            item.get("account_id", ""), item.get("type"),
        ),
        daemon=True,
    ).start()

    return {"success": True, "started": True, "message": "发布任务已启动"}


@router.get("/api/publish-logs")
async def get_publish_logs(after: int = 0, session_id: str = ""):
    """获取发布日志。"""
    logs = app_state.get_publish_logs(session_id=session_id)
    return {
        "logs": logs[after:],
        "total": len(logs),
        "active": app_state.publish_active,
    }


@router.post("/api/queue/enqueue-selected")
async def enqueue_selected(req: EnqueueRequest):
    selected = req.images if req.images else app_state.get_selected_images()
    if not selected:
        raise HTTPException(400, "没有选中的图片")

    sample_text = ""
    celebrity = ""
    for post in app_state.get_discovery_results():
        if any(img in selected for img in post.get("local_images", [])):
            sample_text = post.get("text", "")
            celebrity = post.get("celebrity", "") or post.get("screen_name", "")
            break

    truncated_text = (sample_text or "").strip()[:20]
    if celebrity and truncated_text:
        title = f"{celebrity} | {truncated_text}"
    elif celebrity:
        title = celebrity
    elif truncated_text:
        title = truncated_text
    else:
        title = "美图分享"
    desc = ""
    cover = select_cover(selected)

    selected_list = list(selected)
    if cover in selected_list and selected_list[0] != cover:
        selected_list = [cover] + [img for img in selected_list if img != cover]

    app_state.add_to_queue({
        "title": title,
        "desc": desc,
        "images": selected_list,
        "cover": cover,
        "celebrity": celebrity,
    })
    app_state.clear_selected_images()
    app_state.add_operation("加入队列", f"「{title}」共 {len(selected)} 张图")
    return {"success": True, "title": title, "desc": desc}
