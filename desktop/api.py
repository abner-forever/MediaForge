"""FastAPI 路由定义。"""

from __future__ import annotations

import json
import os
import sys
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import FileResponse, HTMLResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

# 确保项目根目录在 sys.path 中
PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from config import DATA_DIR, DOWNLOAD_DIR, LOG_DIR, settings
from desktop.app_state import app_state
from services.ai import generate_content
from services.downloader import download_images
from services.extensions import build_html, score_images_batch, select_cover
from services.platforms import get_platform, list_platforms
from services.weibo_login import run_weibo_login
from utils.env_manager import read_env, update_env
from utils.audit import create_run_log_path, append_audit
from utils.file import read_json

app = FastAPI(title="图文工坊")

# 静态文件（Vite 构建输出 + logo 等资源）
STATIC_DIR = Path(__file__).parent / "static"

app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

# React 构建产物中的 JS/CSS chunk
_assets_dir = STATIC_DIR / "assets"
if _assets_dir.exists():
    app.mount("/assets", StaticFiles(directory=str(_assets_dir)), name="assets")


# ── Pydantic 模型 ──────────────────────────────────────


class SearchRequest(BaseModel):
    platform: str = "weibo"
    mode: str = "celebrities"
    celebrities: List[str] = []
    search_tags: List[str] = ["美图", "日常"]
    super_topics: List[str] = []
    max_pages: int = 2
    post_limit: int = 5


class DownloadRequest(BaseModel):
    post_indices: List[int] = []


class ScoreRequest(BaseModel):
    image_paths: List[str] = []
    use_vision: bool = True


class QueueAddRequest(BaseModel):
    title: str = ""
    desc: str = ""
    images: List[str] = []
    cover: str = ""


class QueueUpdateRequest(BaseModel):
    title: Optional[str] = None
    desc: Optional[str] = None
    images: Optional[List[str]] = None
    cover: Optional[str] = None


class EnqueueRequest(BaseModel):
    images: List[str] = []


class PublishRequest(BaseModel):
    dry_run: bool = False
    save_draft: bool = True


# ── 首页 ──────────────────────────────────────────────


@app.get("/", response_class=HTMLResponse)
async def index():
    html_path = STATIC_DIR / "index.html"
    return HTMLResponse(html_path.read_text(encoding="utf-8"))


# ── Settings API ──────────────────────────────────────


def _mask_key(key: str) -> str:
    """Mask API key: show first 4 and last 4 chars, middle replaced with dots."""
    if not key or len(key) <= 8:
        return key
    return f"{key[:4]}{'*' * (len(key) - 8)}{key[-4:]}"


@app.get("/api/settings")
async def get_settings():
    env = read_env()
    return {
        "platform": env.get("PLATFORM", "weibo"),
        "ai_provider": env.get("AI_PROVIDER", "mimo"),
        "ai_model": env.get("AI_MODEL", "mimo-chat"),
        "ai_base_url": env.get("AI_BASE_URL", ""),
        "ai_api_key_set": bool(
            env.get("AI_API_KEY")
            or env.get("MIMO_API_KEY")
            or env.get("GLM_API_KEY")
            or env.get("DEEPSEEK_API_KEY")
            or env.get("OPENAI_API_KEY")
        ),
        "ai_api_key_masked": _mask_key(
            env.get("AI_API_KEY")
            or env.get("MIMO_API_KEY")
            or env.get("GLM_API_KEY")
            or env.get("DEEPSEEK_API_KEY")
            or env.get("OPENAI_API_KEY")
            or ""
        ),
        "weibo_cookie_set": bool(env.get("WEIBO_COOKIE")),
        "weibo_uid": env.get("WEIBO_UID", ""),
        "weibo_fetch_mode": env.get("WEIBO_FETCH_MODE", "celebrities"),
        "weibo_celebrities": env.get("WEIBO_CELEBRITIES", ""),
        "weibo_search_tags": env.get("WEIBO_SEARCH_TAGS", "美图,日常,时装周,美妆,穿搭"),
        "weibo_scene_extra_tags": env.get("WEIBO_SCENE_EXTRA_TAGS", ""),
        "weibo_super_topics": env.get("WEIBO_SUPER_TOPICS", ""),
        # ── 今日头条 ──
        "toutiao_cookie_set": bool(env.get("TOUTIAO_COOKIE")),
        "toutiao_user_id": env.get("TOUTIAO_USER_ID", ""),
        "toutiao_fetch_mode": env.get("TOUTIAO_FETCH_MODE", "feed"),
        "toutiao_search_tags": env.get("TOUTIAO_SEARCH_TAGS", "时尚,明星,穿搭"),
        "post_limit": int(env.get("POST_LIMIT", "3")),
        "weibo_pages": int(env.get("WEIBO_PAGES", "2")),
        "publish_interval": int(env.get("PUBLISH_INTERVAL_SECONDS", "10")),
        "request_timeout": int(env.get("REQUEST_TIMEOUT", "20")),
        "retry_times": int(env.get("RETRY_TIMES", "3")),
        "require_confirm": env.get("REQUIRE_CONFIRM", "true").lower() == "true",
        "watermark_filter": env.get("WATERMARK_FILTER", "true").lower() == "true",
        "watermark_strict_mode": env.get("WATERMARK_STRICT_MODE", "true").lower() == "true",
        "min_clean_images": int(env.get("MIN_CLEAN_IMAGES", "3")),
        "watermark_corner_ratio": float(env.get("WATERMARK_CORNER_RATIO", "1.38")),
        "watermark_bottom_ratio": float(env.get("WATERMARK_BOTTOM_RATIO", "1.48")),
        "allow_watermark_fallback": env.get("ALLOW_WATERMARK_FALLBACK", "false").lower() == "true",
    }


@app.post("/api/settings")
async def save_settings(data: Dict[str, Any]):
    updates = {}
    for k, v in data.items():
        if isinstance(v, bool):
            updates[k] = "true" if v else "false"
        else:
            updates[k] = str(v)
    update_env(updates)
    return {"success": True, "message": "配置已保存"}


@app.get("/api/settings/api-key")
async def get_api_key():
    env = read_env()
    key = (
        env.get("AI_API_KEY")
        or env.get("MIMO_API_KEY")
        or env.get("GLM_API_KEY")
        or env.get("DEEPSEEK_API_KEY")
        or env.get("OPENAI_API_KEY")
        or ""
    )
    return {"key": key}


@app.get("/api/settings/weibo-login-stream")
async def weibo_login_stream():
    """SSE 流：打开 Playwright 浏览器让用户扫码登录微博，捕获 Cookie 和 UID 后推送给前端。"""
    import json as _json
    from queue import Empty, Queue
    from concurrent.futures import ThreadPoolExecutor

    msg_queue: Queue = Queue()
    ThreadPoolExecutor(1).submit(run_weibo_login, msg_queue)

    def event_stream():
        while True:
            try:
                msg = msg_queue.get(timeout=0.5)
            except Empty:
                yield ": keepalive\n\n"
                continue

            if msg[0] == "progress":
                yield f"data: {_json.dumps({'type': 'progress', 'message': msg[1]}, ensure_ascii=False)}\n\n"
            elif msg[0] == "done":
                _, cookie, uid = msg
                yield f"data: {_json.dumps({'type': 'done', 'cookie': cookie, 'uid': uid}, ensure_ascii=False)}\n\n"
                break
            elif msg[0] == "error":
                yield f"data: {_json.dumps({'type': 'error', 'message': msg[1]}, ensure_ascii=False)}\n\n"
                break

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@app.get("/api/platforms")
async def get_platforms():
    """返回所有已注册平台的元数据，供前端动态构建平台选择器。"""
    platforms = list_platforms()
    from services.platforms import get_default_platform

    return {
        "platforms": {pid: {
            "id": meta.id,
            "name": meta.name,
            "auth_fields": meta.auth_fields,
            "fetch_modes": meta.fetch_modes,
            "default_fetch_mode": meta.default_fetch_mode,
            "search_params_description": meta.search_params_description,
        } for pid, meta in platforms.items()},
        "default": get_default_platform(),
    }


# ── Dashboard API ──────────────────────────────────────


@app.get("/api/dashboard/health")
async def health_check():
    active_platform = settings.platform or "weibo"
    platform_svc = get_platform(active_platform)
    return {
        "platform": active_platform,
        "platform_name": platform_svc.meta.name if platform_svc else active_platform,
        "platform_auth": platform_svc.check_auth() if platform_svc else False,
        "weibo_cookie": bool(settings.weibo_cookie),
        "weibo_uid_or_celebrities": bool(settings.weibo_uid or settings.weibo_celebrities),
        "ai_api_key": bool(settings.ai_api_key),
        "ai_base_url": bool(settings.ai_base_url),
    }


@app.get("/api/dashboard/stats")
async def stats():
    img_count = sum(1 for _ in DOWNLOAD_DIR.rglob("*.jpg")) + sum(
        1 for _ in DOWNLOAD_DIR.rglob("*.png")
    )
    return {
        "local_images": img_count,
        "queue_size": len(app_state.publish_queue),
        "selected_count": len(app_state.selected_images),
        "discovery_count": len(app_state.discovery_results),
    }


@app.get("/api/dashboard/runs")
async def recent_runs():
    runs_dir = LOG_DIR / "runs"
    if not runs_dir.exists():
        return []
    run_files = sorted(runs_dir.glob("*.jsonl"), reverse=True)[:5]
    results = []
    for run_file in run_files:
        try:
            lines = run_file.read_text(encoding="utf-8").strip().splitlines()
            events = [json.loads(line) for line in lines if line.strip()]
        except Exception:
            continue
        start = next((e for e in events if e.get("event") == "run_started"), None)
        finish = next((e for e in events if e.get("event") == "run_finished"), None)
        processed = sum(1 for e in events if e.get("event") == "post_processed")
        failed = sum(1 for e in events if e.get("event") == "post_failed")
        results.append({
            "run_id": run_file.stem,
            "status": "completed" if finish else "running",
            "processed": processed,
            "failed": failed,
            "payload": start.get("payload", {}) if start else {},
        })
    return results


@app.get("/api/dashboard/operations")
async def recent_operations():
    return app_state.get_operations()


# ── Discovery API ──────────────────────────────────────


@app.get("/api/discovery")
async def get_discovery():
    """返回当前搜索结果。"""
    return {"posts": app_state.get_discovery_results()}


@app.post("/api/discovery/search")
async def discovery_search(req: SearchRequest):
    try:
        platform_svc = get_platform(req.platform)
        if not platform_svc:
            raise HTTPException(400, f"未知平台: {req.platform}")

        # 临时更新平台专属配置
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


@app.get("/api/discovery/search-stream")
async def discovery_search_stream(
    platform: str = Query("weibo"),
    mode: str = Query("celebrities"),
    celebrities: str = Query(""),
    search_tags: str = Query(""),
    super_topics: str = Query(""),
    max_pages: int = Query(2),
    post_limit: int = Query(5),
):
    """SSE 流式搜索，逐条推送进度消息。"""
    import asyncio
    import json as _json
    from queue import Empty, Queue
    from concurrent.futures import ThreadPoolExecutor

    platform_svc = get_platform(platform)
    if not platform_svc:
        def err_stream():
            yield f"data: {_json.dumps({'type': 'error', 'message': f'未知平台: {platform}'}, ensure_ascii=False)}\n\n"
        return StreamingResponse(err_stream(), media_type="text/event-stream")

    celeb_list = [s.strip() for s in celebrities.split(",") if s.strip()]
    tag_list = [s.strip() for s in search_tags.split(",") if s.strip()]
    topic_list = [s.strip() for s in super_topics.split(",") if s.strip()]

    msg_queue: Queue = Queue()

    def progress_callback(msg: str):
        msg_queue.put(("progress", msg))

    def run_search():
        try:
            # 临时更新平台专属配置
            settings.weibo_celebrities = tuple(celeb_list)
            settings.weibo_search_tags = tuple(tag_list)
            settings.weibo_super_topics = tuple(topic_list)

            progress_callback(f"开始 {platform_svc.meta.name} 搜索…")
            posts = platform_svc.fetch_posts(
                mode=mode,
                max_pages=max_pages,
                progress_callback=progress_callback,
            )
            posts = posts[:post_limit]
            app_state.set_discovery_results(posts)
            total_images = sum(len(p.get("images", [])) for p in posts)
            app_state.add_operation("搜索", f"平台={platform} 模式={mode}，发现 {len(posts)} 篇帖子共 {total_images} 张图")
            progress_callback(f"搜索完成！共 {len(posts)} 条帖子，{total_images} 张图片")

            safe_posts = []
            for p in posts:
                sp = dict(p)
                sp["images"] = sp.get("images", [])[:4]
                safe_posts.append(sp)

            msg_queue.put(("done", safe_posts, len(posts), total_images, _json.dumps([p.get("id") for p in posts])))
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
                yield f"data: {_json.dumps({'type': 'progress', 'message': msg[1]}, ensure_ascii=False)}\n\n"
            elif msg[0] == "done":
                _, safe_posts, total, total_imgs, _ = msg
                yield f"data: {_json.dumps({'type': 'done', 'total_posts': total, 'total_images': total_imgs}, ensure_ascii=False)}\n\n"
                break
            elif msg[0] == "error":
                yield f"data: {_json.dumps({'type': 'error', 'message': msg[1]}, ensure_ascii=False)}\n\n"
                break

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@app.post("/api/discovery/download")
async def discovery_download(req: Optional[DownloadRequest] = None):
    posts = app_state.get_discovery_results()
    if not posts:
        raise HTTPException(400, "没有搜索结果，请先搜索")

    # 筛选要下载的帖子索引
    indices = req.post_indices if req and req.post_indices else list(range(len(posts)))
    valid_indices = [i for i in indices if 0 <= i < len(posts)]

    results = []
    for i in valid_indices:
        post = posts[i]
        celebrity = post.get("celebrity", "未命名")
        scene = post.get("scene", "日常")
        post_id = str(post.get("id") or "")[:12]
        try:
            images, dropped = download_images(
                post["images"],
                celebrity=celebrity,
                scene=scene,
                post_slug=post_id,
                prefix=post_id[:8],
                overwrite=False,
            )
            post["local_images"] = images
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


@app.delete("/api/discovery/post/{index}")
async def remove_discovery_post(index: int):
    posts = app_state.get_discovery_results()
    if index < 0 or index >= len(posts):
        raise HTTPException(404, "帖子不存在")
    removed = posts.pop(index)
    app_state.set_discovery_results(posts)
    return {"success": True, "removed": removed.get("celebrity", ""), "remaining": len(posts)}


@app.post("/api/discovery/score")
async def discovery_score(req: ScoreRequest):
    paths = req.image_paths
    if not paths:
        # 自动从 discovery results 收集
        posts = app_state.get_discovery_results()
        paths = [img for p in posts for img in p.get("local_images", [])]
    if not paths:
        raise HTTPException(400, "没有可评分的图片")

    scores = score_images_batch(paths, use_vision=req.use_vision)
    app_state.set_image_scores(scores)

    vision_count = sum(1 for v in scores.values() if v["method"] == "vision")
    heuristic_count = sum(1 for v in scores.values() if v["method"] == "heuristic")

    return {
        "success": True,
        "scores": scores,
        "vision_count": vision_count,
        "heuristic_count": heuristic_count,
    }


# ── Selection API ──────────────────────────────────────


@app.get("/api/selection")
async def get_selection():
    return {
        "selected": app_state.get_selected_images(),
        "scores": app_state.get_image_scores(),
    }


@app.post("/api/selection/add")
async def add_selection(data: Dict[str, str]):
    path = data.get("path", "")
    if path:
        app_state.add_selected_image(path)
    return {"selected": app_state.get_selected_images()}


@app.post("/api/selection/remove")
async def remove_selection(data: Dict[str, str]):
    path = data.get("path", "")
    if path:
        app_state.remove_selected_image(path)
    return {"selected": app_state.get_selected_images()}


@app.post("/api/selection/clear")
async def clear_selection():
    app_state.clear_selected_images()
    return {"selected": []}


# ── Publish Queue API ──────────────────────────────────


@app.get("/api/queue")
async def get_queue():
    return {"queue": app_state.get_queue()}


@app.post("/api/queue")
async def add_to_queue(req: QueueAddRequest):
    item = {
        "title": req.title,
        "desc": req.desc,
        "images": list(req.images),
        "cover": req.cover or (req.images[0] if req.images else ""),
    }
    app_state.add_to_queue(item)
    return {"success": True, "queue": app_state.get_queue()}


@app.put("/api/queue/{index}")
async def update_queue_item(index: int, req: QueueUpdateRequest):
    updates = {}
    if req.title is not None:
        updates["title"] = req.title
    if req.desc is not None:
        updates["desc"] = req.desc
    if req.images is not None:
        updates["images"] = req.images
    if req.cover is not None:
        updates["cover"] = req.cover
    if app_state.update_queue_item(index, updates):
        return {"success": True, "queue": app_state.get_queue()}
    raise HTTPException(404, "队列项不存在")


@app.delete("/api/queue/{index}")
async def remove_from_queue(index: int):
    if app_state.remove_from_queue(index):
        return {"success": True, "queue": app_state.get_queue()}
    raise HTTPException(404, "队列项不存在")


@app.post("/api/queue/{index}/generate")
async def generate_queue_content(index: int):
    queue = app_state.get_queue()
    if index >= len(queue):
        raise HTTPException(404, "队列项不存在")
    item = queue[index]
    sample_text = item.get("desc", "") or "明星美图分享"
    from services.ai import generate_content
    _, desc = generate_content(sample_text)
    celebrity = item.get("celebrity", "")
    title = f"{celebrity} | {desc}" if celebrity else desc
    app_state.update_queue_item(index, {"title": title, "desc": desc})
    message = ""
    if desc == "精选高清美图，欢迎查看":
        message = "AI 生成失败，已使用默认文案"
    app_state.add_operation("AI 生成", f"为「{celebrity or '未知'}」生成文案")
    return {"success": True, "title": title, "desc": desc, "message": message}


@app.post("/api/queue/{index}/publish")
async def publish_from_queue(index: int, req: PublishRequest):
    queue = app_state.get_queue()
    if index >= len(queue):
        raise HTTPException(404, "队列项不存在")
    item = queue[index]
    title = item.get("title", "")
    desc = item.get("desc", "")
    images = item.get("images", [])
    if not images:
        raise HTTPException(400, "没有图片")
    if not title:
        raise HTTPException(400, "标题为空")

    content = desc
    from services.wechat import publish_article

    app_state.clear_publish_logs()

    def _on_log(msg: str) -> None:
        app_state.add_publish_log(msg)

    # Playwright Sync API 不能在 asyncio 事件循环中调用，放到独立线程
    import asyncio
    result = await asyncio.to_thread(
        publish_article,
        title=title,
        content=content,
        images=images,
        dry_run=req.dry_run,
        save_draft=req.save_draft,
        on_scan_needed=lambda: _on_log("请在弹出的浏览器窗口中扫码登录"),
        on_confirm_needed=lambda t: True,
        on_log=_on_log,
    )
    app_state.finish_publish()
    # 将发布日志持久化到队列项，切换页面后不丢失
    app_state.update_queue_item(index, {"publish_logs": app_state.get_publish_logs()})
    if result.get("success"):
        action = "保存草稿" if req.save_draft else "发布"
        app_state.add_operation(action, f"「{title}」")
    # 保存草稿不移除队列项，发布成功才移除
    if result.get("success") and not req.save_draft:
        app_state.remove_from_queue(index)
    return result


@app.get("/api/publish-logs")
async def get_publish_logs(after: int = 0):
    """获取发布日志，支持增量拉取。after 为已获取的日志条数。"""
    logs = app_state.get_publish_logs()
    return {
        "logs": logs[after:],
        "total": len(logs),
        "active": app_state.publish_active,
    }


@app.post("/api/queue/enqueue-selected")
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

    title, desc = generate_content(sample_text or "明星美图分享")
    if celebrity and not title.startswith(celebrity):
        title = f"{celebrity} | {desc}"
    cover = select_cover(selected)

    app_state.add_to_queue({
        "title": title,
        "desc": desc,
        "images": list(selected),
        "cover": cover,
        "celebrity": celebrity,
    })
    app_state.clear_selected_images()
    app_state.add_operation("加入队列", f"「{title}」共 {len(selected)} 张图")
    return {"success": True, "title": title, "desc": desc}


# ── 图片服务 ──────────────────────────────────────────


@app.get("/images/{path:path}")
async def serve_image(path: str):
    file_path = DOWNLOAD_DIR / path
    if not file_path.exists():
        raise HTTPException(404, "图片不存在")
    return FileResponse(str(file_path))


_PLATFORM_REFERERS = {
    "weibo": "https://weibo.com/",
    "toutiao": "https://www.toutiao.com/",
}


@app.get("/proxy")
async def proxy_image(url: str, platform: str = Query("weibo")):
    """代理远程图片，解决 CORS 问题。"""
    import requests as req_lib
    from fastapi.responses import Response

    referer = _PLATFORM_REFERERS.get(platform, "https://weibo.com/")
    try:
        resp = req_lib.get(url, timeout=10, headers={
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
            "Referer": referer,
        })
        resp.raise_for_status()
        content_type = resp.headers.get("Content-Type", "image/jpeg")
        return Response(content=resp.content, media_type=content_type)
    except Exception as err:
        raise HTTPException(502, f"代理请求失败: {err}")


# ── 本地素材 API ──────────────────────────────────────


@app.get("/api/materials")
async def list_materials():
    """返回本地图片列表，按 celebrity/scene/post 三级分组。"""
    groups: Dict[str, Dict] = {}
    total_images = 0
    img_root = DOWNLOAD_DIR.expanduser().resolve()
    if not img_root.exists():
        return {"groups": [], "total_images": 0}

    for celeb_dir in sorted(img_root.iterdir()):
        if not celeb_dir.is_dir():
            continue
        celeb_name = celeb_dir.name
        celeb_group = {"celebrity": celeb_name, "scenes": [], "total": 0}
        for scene_dir in sorted(celeb_dir.iterdir()):
            if not scene_dir.is_dir():
                continue
            scene_name = scene_dir.name
            scene_data = {"scene": scene_name, "posts": [], "total": 0}
            for post_dir in sorted(scene_dir.iterdir()):
                if not post_dir.is_dir():
                    continue
                images = []
                for f in sorted(post_dir.iterdir()):
                    if f.suffix.lower() in (".jpg", ".jpeg", ".png", ".webp", ".gif"):
                        images.append(str(f))
                if images:
                    scene_data["posts"].append({
                        "post_id": post_dir.name,
                        "images": images,
                    })
                    scene_data["total"] += len(images)
                    total_images += len(images)
            if scene_data["posts"]:
                celeb_group["scenes"].append(scene_data)
                celeb_group["total"] += scene_data["total"]
        if celeb_group["scenes"]:
            groups[celeb_name] = celeb_group

    return {"groups": list(groups.values()), "total_images": total_images}


class MaterialsDeleteRequest(BaseModel):
    paths: List[str] = []


@app.delete("/api/materials")
async def delete_materials(req: MaterialsDeleteRequest):
    """删除指定图片文件并清理空目录。"""
    deleted = 0
    for p in req.paths:
        fp = Path(p)
        if fp.exists() and fp.is_file():
            fp.unlink()
            deleted += 1
            # 清理空目录（向上最多 3 级到 images/）
            parent = fp.parent
            img_root = DOWNLOAD_DIR.expanduser().resolve()
            for _ in range(3):
                if parent == img_root or not parent.exists():
                    break
                try:
                    next(parent.iterdir())
                    break  # 目录非空，停止
                except StopIteration:
                    parent.rmdir()
                    parent = parent.parent
    return {"success": True, "deleted": deleted}


@app.get("/api/discovery/download-stream")
async def download_stream(indices: str = Query(""), filter_watermark: bool = Query(True)):
    """SSE 流式下载图片，逐图推送进度。"""
    import json as _json
    from services.downloader import _download_one
    from utils.pathsafe import sanitize_segment
    from utils.file import hash_text

    posts = app_state.get_discovery_results()
    if not posts:
        raise HTTPException(400, "没有搜索结果，请先搜索")

    idx_list = [int(i) for i in indices.split(",") if i.strip().isdigit()] if indices else list(range(len(posts)))
    valid_indices = [i for i in idx_list if 0 <= i < len(posts)]

    def event_stream():
        # 计算总图片数
        total = 0
        for i in valid_indices:
            total += len(posts[i].get("images", []))
        yield f"data: {_json.dumps({'type': 'start', 'total': total}, ensure_ascii=False)}\n\n"

        current = 0
        total_downloaded = 0
        total_dropped = 0

        for i in valid_indices:
            post = posts[i]
            celebrity = post.get("celebrity", "未命名")
            scene = post.get("scene", "日常")
            post_id = str(post.get("id") or "")[:12]
            images = post.get("images", [])
            if not images:
                continue

            celeb_dir = sanitize_segment(str(celebrity).strip() or "未命名艺人")
            scene_dir = sanitize_segment(str(scene).strip() or "未分类选题")
            slug_dir = sanitize_segment(str(post_id).strip() or "post")
            pref = sanitize_segment(str(post_id)[:8] or "img")
            base_dir = DOWNLOAD_DIR.expanduser().resolve() / celeb_dir / scene_dir / slug_dir
            base_dir.mkdir(parents=True, exist_ok=True)

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
                else:
                    total_dropped += 1
                yield f"data: {_json.dumps({'type': 'progress', 'current': current, 'total': total, 'celebrity': celebrity, 'scene': scene, 'downloaded': total_downloaded, 'dropped': total_dropped}, ensure_ascii=False)}\n\n"

            post["local_images"] = [str(f) for f in sorted(base_dir.iterdir()) if f.suffix.lower() in (".jpg", ".jpeg", ".png", ".webp", ".gif")]
            post["dropped_count"] = total_dropped

        app_state.set_discovery_results(posts)
        yield f"data: {_json.dumps({'type': 'done', 'downloaded': total_downloaded, 'dropped': total_dropped}, ensure_ascii=False)}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@app.post("/api/discovery/check-watermark")
async def check_watermark(paths: List[str]):
    """检查图片是否有水印（不删除），返回有水印的路径列表。"""
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
        except Exception:
            pass
    return {"watermarked": watermarked}


# ── SPA Catch-All（放在所有路由最后）─────────────────


@app.get("/{full_path:path}", response_class=HTMLResponse, include_in_schema=False)
async def spa_fallback(full_path: str):
    """React SPA 路由回退：所有非 API 路径返回 index.html。"""
    html_path = STATIC_DIR / "index.html"
    return HTMLResponse(html_path.read_text(encoding="utf-8"))
