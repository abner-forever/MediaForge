"""AI 内容生成 — OpenAI 兼容接口，支持多供应商。"""

from services.ai.client import strip_emoji
from services.ai.content import (
    chat_article,
    de_ai_article,
    generate_article,
    generate_article_title,
    generate_article_title_candidates,
    generate_content,
    optimize_layout,
    polish_article,
    polish_queue_caption,
    recommend_celebrities,
)

__all__ = [
    "chat_article",
    "de_ai_article",
    "generate_article",
    "generate_article_title",
    "generate_article_title_candidates",
    "generate_content",
    "optimize_layout",
    "polish_article",
    "polish_queue_caption",
    "recommend_celebrities",
]
