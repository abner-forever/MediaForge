"""Discovery API 路由（搜索、下载、评分、选择、趋势）。"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import List, Optional

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse

# 确保项目根目录在 sys.path 中
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from config import DOWNLOAD_DIR, settings
from desktop.app_state import app_state
from desktop.api_helpers import (
    DownloadRequest,
    IMAGE_EXT,
    ScoreRequest,
    SearchRequest,
    _req_logger,
    img_rel,
)
from services.downloader import download_images
from services.extensions import score_images_batch, select_cover
from services.platforms import get_platform

router = APIRouter(tags=["discovery"])


@router.get("/api/discovery")
async def get_discovery():
    """返回当前搜索结果。"""
    return {"posts": app_state.get_discovery_results()}


@router.post("/api/discovery/search")
async def discovery_search(req: SearchRequest):
    try:
        platform_svc = get_platform(req.platform)
        if not platform_svc:
            raise HTTPException(400, f"未知平台: {req.platform}")

        settings.weibo_celebrities = tuple(req.celebrities)
        settings.weibo_search_tags = tuple(req.search_tags)
        settings.weibo_super_topics = tuple(req.super_topics)

        posts = platform_svc.fetch_posts(
            mode=req.mode,
            max_pages=req.max_pages,
        )
        posts = posts[: req.post_limit]
        app_state.set_discovery_results(posts)
        total_images = sum(len(p.get("images", [])) for p in posts)
        app_state.add_operation("搜索", f"平台={req.platform} 模式={req.mode}，发现 {len(posts)} 篇帖子共 {total_images} 张图")
        return {
            "success": True,
            "posts": posts,
            "total_posts": len(posts),
            "total_images": total_images,
        }
    except HTTPException:
        raise
    except Exception as err:
        raise HTTPException(500, f"搜索失败: {err}")


@router.get("/api/discovery/search-stream")
async def discovery_search_stream(
    platform: str = Query("weibo"),
    mode: str = Query("celebrities"),
    celebrities: str = Query(""),
    search_tags: str = Query(""),
    super_topics: str = Query(""),
    max_pages: int = Query(1),
    post_limit: int = Query(5),
    page: int = Query(1),
):
    """SSE 流式搜索，逐条推送进度消息。"""
    platform_svc = get_platform(platform)
    if not platform_svc:
        def err_stream():
            yield f"data: {json.dumps({'type': 'error', 'message': f'未知平台: {platform}'}, ensure_ascii=False)}\n\n"
        return StreamingResponse(err_stream(), media_type="text/event-stream")

    celeb_list = [s.strip() for s in celebrities.split(",") if s.strip()]
    tag_list = [s.strip() for s in search_tags.split(",") if s.strip()]
    topic_list = [s.strip() for s in super_topics.split(",") if s.strip()]

    from queue import Empty, Queue
    from concurrent.futures import ThreadPoolExecutor

    msg_queue: Queue = Queue()

    def progress_callback(msg: str):
        msg_queue.put(("progress", msg))

    def run_search():
        try:
            progress_callback(f"开始 {platform_svc.meta.name} 搜索（第{page}页）…")
            new_posts = platform_svc.fetch_posts(
                mode=mode,
                max_pages=1,
                specific_page=page,
                celebrities=celeb_list,
                search_tags=tag_list,
                super_topics=topic_list,
                progress_callback=progress_callback,
            )
            new_posts = new_posts[:post_limit]

            if page > 1:
                existing = app_state.get_discovery_results()
                seen = {str(p.get("id", "")) for p in existing if p.get("id")}
                for p in new_posts:
                    pid = str(p.get("id", ""))
                    if pid and pid in seen:
                        continue
                    if pid:
                        seen.add(pid)
                    existing.append(p)
                posts = existing
            else:
                posts = new_posts

            app_state.set_discovery_results(posts)
            total_images = sum(len(p.get("images", [])) for p in posts)
            app_state.add_operation("搜索", f"平台={platform} 模式={mode}，发现 {len(posts)} 篇帖子共 {total_images} 张图（第{page}页）")
            progress_callback(f"搜索完成！共 {len(posts)} 条帖子，{total_images} 张图片")

            safe_posts = []
            for p in posts:
                sp = dict(p)
                sp["images"] = sp.get("images", [])[:4]
                safe_posts.append(sp)

            msg_queue.put(("done", {"total_posts": len(posts), "total_images": total_images}))
        except HTTPException:
            raise
        except Exception as err:
            msg_queue.put(("error", str(err)))

    ThreadPoolExecutor(1).submit(run_search)

    def event_stream():
        while True:
            try:
                msg = msg_queue.get(timeout=0.5)
            except Empty:
                yield ": keepalive\n\n"
                continue

            if msg[0] == "progress":
                yield f"data: {json.dumps({'type': 'progress', 'message': msg[1]}, ensure_ascii=False)}\n\n"
            elif msg[0] == "done":
                yield f"data: {json.dumps({'type': 'done', **msg[1]}, ensure_ascii=False)}\n\n"
                break
            elif msg[0] == "error":
                yield f"data: {json.dumps({'type': 'error', 'message': msg[1]}, ensure_ascii=False)}\n\n"
                break

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@router.post("/api/discovery/download")
async def discovery_download(req: Optional[DownloadRequest] = None):
    posts = app_state.get_discovery_results()
    if not posts:
        raise HTTPException(400, "没有搜索结果，请先搜索")

    indices = req.post_indices if req and req.post_indices else list(range(len(posts)))
    valid_indices = [i for i in indices if 0 <= i < len(posts)]

    results = []
    for i in valid_indices:
        post = posts[i]
        celebrity = post.get("celebrity", "未命名")
        scene = post.get("scene", "日常")
        post_text = (post.get("text") or "").strip()
        slug = post_text[:12] if post_text else str(post.get("id") or "")[:12]
        _req_logger.info("[下载] text=%r post_id=%s -> slug=%s", post_text[:20], post.get('id'), slug)
        try:
            images, dropped = download_images(
                post["images"],
                celebrity=celebrity,
                scene=scene,
                post_slug=slug,
                prefix=slug[:8],
                overwrite=False,
            )
            post["local_images"] = [img_rel(p) for p in images]
            post["dropped_count"] = dropped
            results.append({
                "celebrity": celebrity,
                "scene": scene,
                "downloaded": len(images),
                "dropped": dropped,
            })
        except Exception as err:
            post["local_images"] = []
            post["dropped_count"] = 0
            results.append({
                "celebrity": celebrity,
                "scene": scene,
                "error": str(err),
            })

    app_state.set_discovery_results(posts)
    all_images = [img for p in posts for img in p.get("local_images", [])]
    app_state.add_operation("下载图片", f"共下载 {len(all_images)} 张图片")
    return {
        "success": True,
        "posts": posts,
        "results": results,
        "total_downloaded": len(all_images),
    }


@router.delete("/api/discovery/post/{index}")
async def remove_discovery_post(index: int):
    posts = app_state.get_discovery_results()
    if index < 0 or index >= len(posts):
        raise HTTPException(404, "帖子不存在")
    removed = posts.pop(index)
    app_state.set_discovery_results(posts)
    return {"success": True, "removed": removed.get("celebrity", ""), "remaining": len(posts)}


@router.post("/api/discovery/score")
async def discovery_score(req: ScoreRequest):
    paths = req.image_paths
    if not paths:
        posts = app_state.get_discovery_results()
        paths = [str(DOWNLOAD_DIR / img) for p in posts for img in p.get("local_images", [])]
    else:
        paths = [str(DOWNLOAD_DIR / img) if not Path(img).is_absolute() else img for img in paths]
    if not paths:
        raise HTTPException(400, "没有可评分的图片")

    scores = score_images_batch(paths, use_vision=req.use_vision)
    scores_rel = {img_rel(k): v for k, v in scores.items()}
    app_state.set_image_scores(scores_rel)

    vision_count = sum(1 for v in scores.values() if v["method"] == "vision")
    heuristic_count = sum(1 for v in scores.values() if v["method"] == "heuristic")

    return {
        "success": True,
        "scores": scores_rel,
        "vision_count": vision_count,
        "heuristic_count": heuristic_count,
    }


@router.get("/api/discovery/trending-celebrities")
async def get_trending_celebrities():
    """今日推荐：分析当前发文流量最大的女明星。"""
    if not settings.ai_api_key:
        raise HTTPException(400, "当前未配置大模型 API Key，请先在设置页配置")
    try:
        import asyncio
        from services.ai import recommend_celebrities
        loop = asyncio.get_event_loop()
        celebs = await loop.run_in_executor(None, recommend_celebrities)
        # 持久化推荐结果到 settings.json，刷新页面后不丢失
        if celebs:
            from utils.settings_store import write_settings
            write_settings({"AI_RECOMMENDED_CELEBS": ",".join(celebs)})
        return {"celebrities": celebs}
    except Exception as e:
        _req_logger.warning("AI 推荐热门明星失败，使用兜底列表: %s", e)
        fallback = ["迪丽热巴", "杨幂", "赵丽颖", "刘亦菲", "杨紫", "白鹿", "虞书欣", "赵露思", "关晓彤", "周也"]
        return {"celebrities": fallback}


@router.get("/api/discovery/download-stream")
async def download_stream(indices: str = Query(""), filter_watermark: bool = Query(True)):
    """SSE 流式下载图片，逐图推送进度。"""
    from services.downloader import _download_one
    from utils.pathsafe import sanitize_segment
    from utils.file import hash_text

    posts = app_state.get_discovery_results()
    if not posts:
        raise HTTPException(400, "没有搜索结果，请先搜索")

    idx_list = [int(i) for i in indices.split(",") if i.strip().isdigit()] if indices else list(range(len(posts)))
    valid_indices = [i for i in idx_list if 0 <= i < len(posts)]

    def event_stream():
        total = 0
        for i in valid_indices:
            total += len(posts[i].get("images", []))
        yield f"data: {json.dumps({'type': 'start', 'total': total}, ensure_ascii=False)}\n\n"

        current = 0
        total_downloaded = 0
        total_dropped = 0

        for i in valid_indices:
            post = posts[i]
            celebrity = post.get("celebrity", "未命名")
            scene = post.get("scene", "日常")
            post_text = (post.get("text") or "").strip()
            slug = post_text[:12] if post_text else str(post.get("id") or "")[:12]
            images = post.get("images", [])
            if not images:
                continue

            celeb_dir = sanitize_segment(str(celebrity).strip() or "未命名艺人")
            slug_dir = sanitize_segment(str(slug).strip() or "post")
            pref = sanitize_segment(str(slug)[:8] or "img")
            base_dir = DOWNLOAD_DIR.expanduser().resolve() / celeb_dir / slug_dir
            base_dir.mkdir(parents=True, exist_ok=True)

            post_local_images: list[str] = []
            post_dropped = 0
            for idx, url in enumerate(images, start=1):
                current += 1
                ext = ".jpg"
                tail = url.rsplit("/", 1)[-1]
                if "." in tail:
                    ext_candidate = "." + tail.rsplit(".", 1)[-1].split("?")[0][:5]
                    if len(ext_candidate) <= 6 and ext_candidate.startswith("."):
                        ext = ext_candidate
                filename = base_dir / f"{pref}_{idx}_{hash_text(url)[:8]}{ext}"
                result = _download_one(url, filename, overwrite=False, filter_watermark=filter_watermark)
                if result:
                    total_downloaded += 1
                    post_local_images.append(img_rel(result))
                else:
                    total_dropped += 1
                    post_dropped += 1
                yield f"data: {json.dumps({'type': 'progress', 'current': current, 'total': total, 'celebrity': celebrity, 'scene': scene, 'downloaded': total_downloaded, 'dropped': total_dropped}, ensure_ascii=False)}\n\n"

            post["local_images"] = post_local_images
            post["dropped_count"] = post_dropped

        app_state.set_discovery_results(posts)
        yield f"data: {json.dumps({'type': 'done', 'downloaded': total_downloaded, 'dropped': total_dropped}, ensure_ascii=False)}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@router.post("/api/discovery/check-watermark")
async def check_watermark(paths: List[str]):
    """检查图片是否有水印。"""
    from services.watermark import watermark_metrics
    from config import settings as cfg

    watermarked = []
    for p in paths:
        full = Path(p)
        if not full.is_absolute():
            full = DOWNLOAD_DIR / p
        if not full.exists():
            continue
        try:
            corner_ratio, bottom_ratio = watermark_metrics(str(full))
            if corner_ratio >= cfg.watermark_corner_ratio or bottom_ratio >= cfg.watermark_bottom_ratio:
                watermarked.append(p)
        except Exception as e:
            _req_logger.debug("水印检测失败 %s: %s", p, e)
    return {"watermarked": watermarked}


# ── Selection API ──────────────────────────────────────


@router.get("/api/selection")
async def get_selection():
    return {
        "selected": app_state.get_selected_images(),
        "scores": app_state.get_image_scores(),
    }


@router.post("/api/selection/add")
async def add_selection(data: dict):
    path = data.get("path", "")
    if path:
        app_state.add_selected_image(path)
    return {"selected": app_state.get_selected_images()}


@router.post("/api/selection/remove")
async def remove_selection(data: dict):
    path = data.get("path", "")
    if path:
        app_state.remove_selected_image(path)
    return {"selected": app_state.get_selected_images()}


@router.post("/api/selection/clear")
async def clear_selection():
    app_state.clear_selected_images()
    return {"selected": []}
