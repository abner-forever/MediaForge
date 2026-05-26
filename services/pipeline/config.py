"""PipelineConfig 数据类。"""

from dataclasses import dataclass, field
from typing import List


@dataclass
class PipelineConfig:
    """流水线运行配置。"""
    platform: str = "weibo"
    mode: str = ""
    celebrities: List[str] = field(default_factory=list)
    search_tags: List[str] = field(default_factory=list)
    super_topics: List[str] = field(default_factory=list)
    max_pages: int = 2
    post_limit: int = 3
    dry_run: bool = False
    require_confirm: bool = True
    account_id: str | None = None
    filter_watermark: bool = True
    min_clean_images: int = 3
    allow_watermark_fallback: bool = True
    min_images_per_post: int = 5
    max_retries: int = 3
    ai_decisions: bool = True
    ai_decision_mode: str = "auto"  # "auto" 全自动 | "interactive" 交互确认
