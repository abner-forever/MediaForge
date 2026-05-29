"""API 共享辅助函数和 Pydantic 模型。

供 desktop/api.py 和 desktop/routers/ 下的路由模块共同使用。
"""

from __future__ import annotations

import re
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import HTTPException
from pydantic import BaseModel

# 确保项目根目录在 sys.path 中
PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from config import DATA_DIR, DOWNLOAD_DIR, LOG_DIR, settings
from desktop.app_state import app_state, MATERIALS_META_PATH
from utils.logger import get_logger as _get_logger

_req_logger = _get_logger("api")


# ── 通用辅助函数 ─────────────────────────────────────


def img_rel(path: str) -> str:
    """将图片绝对路径转为相对 DOWNLOAD_DIR 的正斜杠路径，用于前端 URL 构建。"""
    try:
        return str(Path(path).relative_to(DOWNLOAD_DIR).as_posix())
    except (ValueError, TypeError):
        return path


def mask_key(key: str) -> str:
    """Mask API key: show first 8 and last 4 chars, middle replaced with asterisks."""
    if not key or len(key) <= 12:
        return key
    return f"{key[:8]}{'*' * (len(key) - 12)}{key[-4:]}"


def get_provider_key(env: dict, provider: str) -> str:
    """获取当前 AI 服务商对应的 API key：env 覆盖 → 本地存储 → env 兜底。"""
    if env.get("AI_API_KEY"):
        return env["AI_API_KEY"]
    from utils.api_key_store import get_api_key
    local_key = get_api_key(provider)
    if local_key:
        return local_key
    key_map = {
        "mimo": "MIMO_API_KEY",
        "deepseek": "DEEPSEEK_API_KEY",
        "glm": "GLM_API_KEY",
        "openai": "OPENAI_API_KEY",
        "qwen": "QWEN_API_KEY",
        "minimax": "MINIMAX_API_KEY",
    }
    return env.get(key_map.get(provider, ""), "") or ""


def get_wechat_accounts_list() -> list:
    """获取微信账号列表（含登录状态）。"""
    try:
        from utils.wechat_auth_store import list_accounts
        return list_accounts()
    except Exception:
        return []


def friendly_error_message(err: Exception | str) -> str:
    """把常见技术错误翻译成可操作的用户提示。"""
    text = str(err)
    low = text.lower()
    rules = [
        (["weibo_cookie", "cookie 无效", "cookie失效"], "微博登录已失效，请到设置页重新扫码登录。"),
        (["xhs_cookie", "xhs 登录", "小红书"], "小红书登录已失效，请到设置页重新登录。"),
        (["ai_base_url", "base url", "base_url"], "当前 AI 服务需要配置 Base URL，请到设置页补全后重试。"),
        (["api_key", "api key", "apikey", "unauthorized", "401"], "当前 AI 服务 API Key 不可用，请检查密钥配置。"),
        (["公众号未登录", "wechat", "mp.weixin", "login", "扫码"], "公众号账号未登录，请先在设置页完成扫码登录。"),
        (["playwright", "locator", "editor", "iframe", "timeout"], "微信后台页面结构可能已更新或加载超时，请重试；若仍失败请保留日志排查。"),
        (["没有图片", "no image"], "当前内容没有可发布图片，请先选择图片或封面。"),
        (["标题为空"], "标题不能为空，请补充标题后再发布。"),
        (["正文为空"], "正文不能为空，请补充正文后再发布。"),
    ]
    for keys, message in rules:
        if any(k in low for k in keys):
            return message
    return text or "操作失败，请稍后重试。"


def raise_friendly(status_code: int, err: Exception | str) -> None:
    raise HTTPException(status_code, friendly_error_message(err))


IMAGE_EXT = {".jpg", ".jpeg", ".png", ".webp", ".gif"}


# ── Pydantic 请求模型 ──────────────────────────────────


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
    account_id: Optional[str] = None
    status: Optional[str] = None


class EnqueueRequest(BaseModel):
    images: List[str] = []


class PublishRequest(BaseModel):
    dry_run: bool = False
    save_draft: bool = True
    account_id: Optional[str] = None
    headless: bool = False


class ArticleCreateRequest(BaseModel):
    title: str = ""
    content: str = ""
    summary: str = ""
    cover: str = ""
    images: List[str] = []
    tags: List[str] = []
    celebrity: str = ""
    source: str = ""
    status: str = "draft"


class ArticleUpdateRequest(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None
    summary: Optional[str] = None
    cover: Optional[str] = None
    images: Optional[List[str]] = None
    tags: Optional[List[str]] = None
    celebrity: Optional[str] = None
    source: Optional[str] = None
    ai_generated: Optional[bool] = None
    status: Optional[str] = None


class ArticleGenerateRequest(BaseModel):
    topic: str = ""
    title: str = ""
    article_type: str = ""
    tone: str = ""
    word_count: str = ""
    with_subtitles: bool = True
    gallery_friendly: bool = False
    template_prompt: str = ""


class ArticleChatMessage(BaseModel):
    role: str  # 'user' | 'assistant'
    content: str


class ArticleChatRequest(BaseModel):
    instruction: str
    messages: Optional[List[ArticleChatMessage]] = None


class ArticlePublishRequest(BaseModel):
    save_draft: bool = False
    dry_run: bool = False
    account_id: Optional[str] = None


class PipelineRunRequest(BaseModel):
    platform: str = "weibo"
    mode: str = ""
    celebrities: List[str] = []
    search_tags: List[str] = []
    super_topics: List[str] = []
    max_pages: int = 2
    post_limit: int = 3
    dry_run: bool = False
    require_confirm: bool = True
    account_id: Optional[str] = None
    filter_watermark: bool = True
    min_images_per_post: int = 5
    ai_decision_mode: str = "auto"
