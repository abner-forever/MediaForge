"""Dashboard API 路由。"""

from __future__ import annotations

import json
import logging
import os
import sys
from pathlib import Path
from typing import Any, Dict

from fastapi import APIRouter, HTTPException, Query

# 确保项目根目录在 sys.path 中
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from config import DOWNLOAD_DIR, LOG_DIR, settings
from desktop.app_state import app_state
from services.platforms import get_platform

router = APIRouter(tags=["dashboard"])
logger = logging.getLogger(__name__)


@router.get("/api/dashboard/health")
async def health_check():
    """从 os.environ / api_key_store 直接读取配置，绕过 Settings dataclass 缓存问题。"""
    from utils.api_key_store import get_api_key

    active_platform = settings.platform or "weibo"
    platform_svc = get_platform(active_platform)
    provider = os.environ.get("AI_PROVIDER", "mimo").lower()
    api_key = os.environ.get("AI_API_KEY", "") or get_api_key(provider) or ""
    base_url = os.environ.get("AI_BASE_URL", "")
    return {
        "platform": active_platform,
        "platform_name": platform_svc.meta.name if platform_svc else active_platform,
        "platform_auth": platform_svc.check_auth() if platform_svc else False,
        "weibo_cookie": bool(settings.weibo_cookie),
        "weibo_uid_or_celebrities": bool(settings.weibo_uid or settings.weibo_celebrities),
        "ai_api_key": bool(api_key),
        "ai_base_url": bool(base_url),
    }


@router.get("/api/dashboard/stats")
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


@router.get("/api/dashboard/runs")
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
        except Exception as e:
            logger.debug("解析运行记录失败 %s: %s", run_file.name, e)
            continue
        start = next((e for e in events if e.get("event") == "run_started"), None)
        finish = next((e for e in events if e.get("event") == "run_finished"), None)
        processed = sum(1 for e in events if e.get("event") == "step_complete")
        failed = sum(1 for e in events if e.get("event") == "step_error")
        fp = finish.get("payload", {}) if finish else {}
        sp = start.get("payload", {}) if start else {}
        status = "running"
        if finish:
            status = fp.get("status", "completed")
        celebrities = sp.get("celebrities", [])
        platform = sp.get("platform", "")
        title_parts = [f"[{platform}]"] if platform else []
        if celebrities:
            title_parts.append(", ".join(celebrities[:3]))
        results.append({
            "run_id": run_file.stem,
            "status": status,
            "processed": processed,
            "failed": failed,
            "payload": sp,
            "prompt_tokens": fp.get("prompt_tokens", 0),
            "completion_tokens": fp.get("completion_tokens", 0),
            "started_at": start.get("ts", "") if start else "",
            "title": " ".join(title_parts) if title_parts else run_file.stem,
            "elapsed_seconds": fp.get("elapsed_seconds"),
            "total_posts": fp.get("total_posts"),
            "published": fp.get("published"),
        })
    return results


@router.delete("/api/dashboard/runs/{run_id}")
async def delete_run(run_id: str):
    """删除指定的运行历史记录（JSONL 文件）。"""
    runs_dir = LOG_DIR / "runs"
    target = runs_dir / f"{run_id}.jsonl"
    if not target.exists():
        raise HTTPException(status_code=404, detail="运行记录不存在")
    target.unlink()
    return {"success": True}


@router.get("/api/dashboard/operations")
async def recent_operations(page: int = Query(1), page_size: int = Query(10)):
    items, total = app_state.get_operations(page=page, page_size=page_size)
    return {"items": items, "total": total, "page": page, "page_size": page_size}


@router.post("/api/dashboard/operations/delete")
async def delete_operations(data: Dict[str, Any]):
    """删除操作记录。data = {ids: ["uuid1", "uuid2"]} 或 {clear: true}。"""
    if data.get("clear"):
        app_state.clear_all_operations()
        return {"success": True, "deleted": -1}
    op_ids = data.get("ids", [])
    deleted = app_state.delete_operations_by_id(op_ids)
    return {"success": True, "deleted": deleted}
