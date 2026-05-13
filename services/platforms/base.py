"""平台服务协议与元数据定义。"""

from dataclasses import dataclass, field
from typing import Callable, Dict, List, Optional, Protocol


@dataclass
class PlatformMeta:
    """平台元数据，供 UI / CLI 消费。"""

    id: str  # "weibo", "toutiao"
    name: str  # "微博", "今日头条"
    auth_fields: List[str] = field(default_factory=lambda: ["cookie"])  # 需要配置的认证字段
    fetch_modes: Dict[str, str] = field(default_factory=dict)  # mode_id → 中文标签
    default_fetch_mode: str = ""
    search_params_description: str = ""  # 发现页帮助文字


class PlatformService(Protocol):
    """每个平台抓取服务必须实现的协议（结构化类型，无需显式继承）。"""

    meta: PlatformMeta

    @staticmethod
    def check_auth() -> bool:
        """检查该平台是否已完成认证配置。"""
        ...

    @staticmethod
    def fetch_posts(
        mode: str,
        *,
        max_pages: int = 1,
        specific_page: int = 0,
        celebrities: Optional[List[str]] = None,
        search_tags: Optional[List[str]] = None,
        super_topics: Optional[List[str]] = None,
        progress_callback: Optional[Callable[[str], None]] = None,
    ) -> List[Dict]:
        """按指定模式抓取帖子，返回标准化 Post 字典列表。

        specific_page > 0 时仅抓取该页数据（代替 max_pages 控制的循环）。
        celebrities/search_tags/super_topics 用于直接指定参数（避免读写全局 settings）。
        """
        ...
