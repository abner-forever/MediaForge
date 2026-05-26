"""流水线事件与步骤常量。"""

from typing import Callable, Dict, List

# ── 事件类型常量 ───────────────────────────────────────
EVENT_STEP_START = "step_start"
EVENT_STEP_PROGRESS = "step_progress"
EVENT_STEP_COMPLETE = "step_complete"
EVENT_STEP_ERROR = "step_error"
EVENT_AGENT_DECISION = "agent_decision"
EVENT_CHECKPOINT = "checkpoint_required"
EVENT_DECISION_REQUIRED = "decision_required"
EVENT_COMPLETED = "completed"
EVENT_CANCELLED = "cancelled"

# ── 步骤常量 ───────────────────────────────────────────
STEP_HEALTH = "health_check"
STEP_FETCH = "fetch"
STEP_DOWNLOAD = "download"
STEP_SCORE = "score"
STEP_GENERATE = "generate"
STEP_ENQUEUE = "enqueue"
STEP_PUBLISH = "publish"

STEP_NAMES = {
    STEP_HEALTH: "健康检查",
    STEP_FETCH: "抓取帖子",
    STEP_DOWNLOAD: "下载图片",
    STEP_SCORE: "AI 评分",
    STEP_GENERATE: "生成内容",
    STEP_ENQUEUE: "加入队列",
    STEP_PUBLISH: "发布",
}

# ── 回调签名 ───────────────────────────────────────────
PipelineEventCallback = Callable[[str, str, dict], None]
