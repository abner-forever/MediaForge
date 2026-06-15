"""积分系统 API 路由。"""

from __future__ import annotations

import sys
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse
from pydantic import BaseModel

# 确保项目根目录在 sys.path 中
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from desktop.app_state import app_state, VIDEOS_DIR

router = APIRouter(tags=["credits"])


# ── 请求模型 ──────────────────────────────────────────

class WatchVideoRequest(BaseModel):
    video_id: str
    watch_duration: int


@router.get("/api/credits")
async def get_credits():
    """查询积分余额和签到状态。"""
    balance = app_state.get_credits_balance()
    checkin_status = app_state.get_checkin_status()
    return {
        "balance": balance,
        "checkin_status": checkin_status,
    }


@router.get("/api/credits/history")
async def get_credits_history(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
):
    """获取积分流水记录。"""
    return app_state.get_credits_history(page, page_size)


@router.get("/api/credits/checkin-history")
async def get_checkin_history(
    year: int = Query(None, description="年份，默认当前年"),
    month: int = Query(None, ge=1, le=12, description="月份，默认当前月"),
):
    """获取指定月份的签到历史记录。"""
    now = datetime.now()
    year = year or now.year
    month = month or now.month

    # 验证日期范围：最多查看6个月前
    current_month = now.year * 12 + now.month
    target_month = year * 12 + month
    if current_month - target_month > 5 or current_month - target_month < 0:
        raise HTTPException(400, "只能查看最近6个月的签到记录")

    return app_state.get_checkin_history(year, month)


@router.post("/api/credits/checkin")
async def checkin():
    """每日签到获取积分。"""
    result = app_state.checkin()
    if not result["success"]:
        raise HTTPException(400, result["message"])
    app_state.add_operation("每日签到", f"获得 {result['earned']} 积分（连续第{result['streak']}天）")
    return result


# ── 视频看片赚积分 ──────────────────────────────────────

@router.post("/api/credits/watch-video")
async def watch_video(req: WatchVideoRequest):
    """观看视频获取积分。验证观看时长和每日上限。"""
    result = app_state.earn_video_reward(req.video_id, req.watch_duration)
    if not result["success"]:
        raise HTTPException(400, result.get("message", "领取失败"))
    app_state.add_operation("看视频赚积分", f"获得 {result['earned']} 积分（今日第{result['daily_count']}次）")
    return result


@router.get("/api/credits/tasks")
async def get_tasks():
    """获取今日任务列表及完成状态含今日已赚积分。"""
    return app_state.get_daily_tasks()


# ── 视频文件服务 ──────────────────────────────────────

@router.get("/api/videos/list")
async def get_video_list():
    """获取所有可观看视频的元数据列表。"""
    videos = app_state.get_video_list()
    return {"videos": videos}


@router.get("/api/videos/play/{video_id}")
async def play_video(video_id: str):
    """播放视频文件（返回 MP4 文件流）。"""
    video_path = VIDEOS_DIR / f"{video_id}.mp4"
    if not video_path.exists():
        raise HTTPException(404, "视频文件不存在")
    return FileResponse(str(video_path), media_type="video/mp4")
