"""Pipeline Agent API 路由。"""

from __future__ import annotations

import json
import sys
import threading
import time
import uuid
from pathlib import Path
from typing import Any, Dict

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

# 确保项目根目录在 sys.path 中
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from desktop.app_state import app_state
from desktop.api_helpers import PipelineRunRequest, _req_logger
from utils.audit import create_run_log_path, append_audit

router = APIRouter(tags=["pipeline"])

# ── Pipeline Agent 跨线程通信 ────────────────────────
pipeline_cancel_events: Dict[str, threading.Event] = {}
pipeline_confirm_events: Dict[str, threading.Event] = {}
pipeline_decision_events: Dict[str, threading.Event] = {}
pipeline_decision_results: Dict[str, str] = {}


@router.post("/api/pipeline/run")
async def pipeline_run(req: PipelineRunRequest):
    """启动 AI 流水线，返回 SSE 事件流。"""
    from queue import Empty, Queue

    msg_queue: Queue = Queue()
    cancel_event = threading.Event()
    run_id = uuid.uuid4().hex[:8]
    pipeline_cancel_events[run_id] = cancel_event

    def _cleanup() -> None:
        time.sleep(30)
        pipeline_cancel_events.pop(run_id, None)
        pipeline_confirm_events.pop(run_id, None)

    from services.pipeline import PipelineAgent, PipelineConfig

    audit_path = create_run_log_path(run_id)

    def _on_event(event_type: str, step: str, data: dict) -> None:
        """同时推送到 SSE 队列和写入审计日志。"""
        msg_queue.put((event_type, step, data))
        if event_type in ("step_start", "step_complete", "step_error", "agent_decision", "completed", "cancelled"):
            audit_entry = {"step": step}
            for key in ("reasoning", "decision", "error", "message", "result", "name"):
                if key in data:
                    val = data[key]
                    if key == "result" and isinstance(val, dict):
                        audit_entry[key] = {k: v for k, v in val.items() if not isinstance(v, list)}
                    else:
                        audit_entry[key] = str(val)[:200]
            append_audit(audit_path, event_type, audit_entry)

    def run_pipeline() -> None:
        try:
            config = PipelineConfig(**req.model_dump())
            agent = PipelineAgent(config, _on_event, cancel_event)

            append_audit(audit_path, "run_started", {
                "platform": req.platform,
                "mode": req.mode,
                "celebrities": req.celebrities,
                "search_tags": req.search_tags,
                "super_topics": req.super_topics,
                "max_pages": req.max_pages,
                "post_limit": req.post_limit,
                "dry_run": req.dry_run,
                "require_confirm": req.require_confirm,
                "account_id": req.account_id,
                "filter_watermark": req.filter_watermark,
                "min_images_per_post": req.min_images_per_post,
                "ai_decision_mode": req.ai_decision_mode,
            })

            summary = agent.run()

            status = "completed" if summary.get("failed", 0) == 0 else "partial_failure"
            append_audit(audit_path, "run_finished", {
                "status": status,
                "total_posts": summary.get("total_posts", 0),
                "published": summary.get("published", 0),
                "skipped": summary.get("skipped", 0),
                "failed": summary.get("failed", 0),
                "elapsed_seconds": summary.get("elapsed_seconds", 0),
                "prompt_tokens": summary.get("prompt_tokens", 0),
                "completion_tokens": summary.get("completion_tokens", 0),
            })

            detail = (
                f"平台={req.platform} 模式={req.mode} "
                f"处理 {summary.get('total_posts', 0)} 条 "
                f"发布 {summary.get('published', 0)} 条 "
                f"跳过 {summary.get('skipped', 0)} 条 "
                f"失败 {summary.get('failed', 0)} 条"
            )
            app_state.add_operation("流水线", detail)
        except Exception as err:
            msg_queue.put(("error", "", {"error": str(err)}))
        finally:
            msg_queue.put(("__done__", "", {}))
            threading.Thread(target=_cleanup, daemon=True).start()

    threading.Thread(target=run_pipeline, daemon=True).start()

    async def event_stream():
        while True:
            try:
                event_type, step, data = msg_queue.get(timeout=0.5)
            except Empty:
                if cancel_event.is_set():
                    yield f"data: {json.dumps({'type': 'cancelled', 'reason': 'user cancelled'}, ensure_ascii=False)}\n\n"
                    break
                yield ": keepalive\n\n"
                continue

            if event_type == "__done__":
                break

            sse_data = {"type": event_type, "step": step, **data}
            yield f"data: {json.dumps(sse_data, ensure_ascii=False)}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@router.post("/api/pipeline/confirm/{run_id}")
async def pipeline_confirm(run_id: str):
    """用户确认发布。"""
    evt = pipeline_confirm_events.get(run_id)
    if not evt:
        raise HTTPException(404, "流水线不存在或已处理")
    evt.set()
    return {"success": True}


@router.post("/api/pipeline/cancel/{run_id}")
async def pipeline_cancel(run_id: str):
    """取消正在运行的流水线。"""
    evt = pipeline_cancel_events.get(run_id)
    if not evt:
        raise HTTPException(404, "流水线不存在或已结束")
    evt.set()
    return {"success": True}


@router.post("/api/pipeline/decide/{run_id}")
async def pipeline_decide(run_id: str, data: Dict[str, Any]):
    """用户提交交互决策结果。"""
    evt = pipeline_decision_events.get(run_id)
    option_id = data.get("option_id", "")
    if not evt:
        raise HTTPException(404, "流水线不存在或已处理")
    if option_id:
        pipeline_decision_results[run_id] = option_id
    evt.set()
    return {"success": True}


@router.get("/api/pipeline/runs/{run_id}")
async def pipeline_run_detail(run_id: str):
    """读取指定流水线运行的审计事件。"""
    path = create_run_log_path(run_id)
    if not path.exists():
        raise HTTPException(404, "运行记录不存在")
    try:
        lines = path.read_text(encoding="utf-8").strip().splitlines()
        events = [json.loads(line) for line in lines if line.strip()]
    except Exception:
        raise HTTPException(500, "读取运行记录失败")
    return {"run_id": run_id, "events": events}
