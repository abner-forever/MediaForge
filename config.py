import os
from dataclasses import dataclass
from pathlib import Path
from typing import Tuple

from dotenv import load_dotenv


load_dotenv()


BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
DOWNLOAD_DIR = DATA_DIR / "images"
POSTS_CACHE_PATH = DATA_DIR / "posts.json"
QUEUE_CACHE_PATH = DATA_DIR / "queue.json"
WECHAT_STATE_PATH = DATA_DIR / "state" / "wechat.json"
WEIBO_UID_CACHE_PATH = DATA_DIR / "state" / "weibo_uid_map.json"
WEIBO_TOPIC_CACHE_PATH = DATA_DIR / "state" / "weibo_topic_map.json"
LOG_DIR = DATA_DIR / "logs"


def _csv_tuple(value: str) -> Tuple[str, ...]:
    if not value.strip():
        return ()
    normalized = value.replace("，", ",").replace(";", ",")
    return tuple(s.strip() for s in normalized.split(",") if s.strip())


def _effective_weibo_fetch_mode(raw_mode: str, celebrities: Tuple[str, ...]) -> str:
    mode = (raw_mode or "").strip().lower()
    if mode in ("own", "celebrities", "mixed", "super_topic", "keyword"):
        return mode
    return "celebrities" if celebrities else "own"


@dataclass
class Settings:
    weibo_cookie: str = os.getenv("WEIBO_COOKIE", "")
    weibo_uid: str = os.getenv("WEIBO_UID", "")
    weibo_fetch_mode: str = os.getenv("WEIBO_FETCH_MODE", "")
    weibo_celebrities: Tuple[str, ...] = ()
    weibo_search_tags: Tuple[str, ...] = _csv_tuple(
        os.getenv("WEIBO_SEARCH_TAGS", "美图,日常,时装周,美妆,穿搭")
    )
    weibo_keyword_pages: int = int(os.getenv("WEIBO_KEYWORD_PAGES", "1"))
    weibo_scene_extra_tags: Tuple[str, ...] = _csv_tuple(os.getenv("WEIBO_SCENE_EXTRA_TAGS", ""))
    weibo_super_topics: Tuple[str, ...] = _csv_tuple(os.getenv("WEIBO_SUPER_TOPICS", ""))
    ai_provider: str = os.getenv("AI_PROVIDER", "mimo").lower()
    ai_model: str = os.getenv("AI_MODEL", "mimo-chat")
    ai_api_key: str = (
        os.getenv("AI_API_KEY", "")
        or os.getenv("MIMO_API_KEY", "")
        or os.getenv("GLM_API_KEY", "")
        or os.getenv("DEEPSEEK_API_KEY", "")
        or os.getenv("OPENAI_API_KEY", "")
    )
    ai_base_url: str = os.getenv("AI_BASE_URL", "")
    post_limit: int = int(os.getenv("POST_LIMIT", "3"))
    weibo_pages: int = int(os.getenv("WEIBO_PAGES", "2"))
    request_timeout: int = int(os.getenv("REQUEST_TIMEOUT", "20"))
    retry_times: int = int(os.getenv("RETRY_TIMES", "3"))
    min_publish_interval: int = int(os.getenv("PUBLISH_INTERVAL_SECONDS", "10"))
    no_publish_without_confirm: bool = os.getenv("REQUIRE_CONFIRM", "true").lower() == "true"
    watermark_filter: bool = os.getenv("WATERMARK_FILTER", "true").lower() == "true"
    watermark_corner_ratio: float = float(os.getenv("WATERMARK_CORNER_RATIO", "1.38"))
    watermark_bottom_ratio: float = float(os.getenv("WATERMARK_BOTTOM_RATIO", "1.48"))
    watermark_strict_mode: bool = os.getenv("WATERMARK_STRICT_MODE", "true").lower() == "true"
    min_clean_images: int = int(os.getenv("MIN_CLEAN_IMAGES", "3"))
    allow_watermark_fallback: bool = os.getenv("ALLOW_WATERMARK_FALLBACK", "false").lower() == "true"
    # ── 平台选择 ──
    platform: str = os.getenv("PLATFORM", "weibo")
    # ── 今日头条 ──
    toutiao_cookie: str = os.getenv("TOUTIAO_COOKIE", "")
    toutiao_user_id: str = os.getenv("TOUTIAO_USER_ID", "")
    toutiao_fetch_mode: str = os.getenv("TOUTIAO_FETCH_MODE", "feed")
    toutiao_search_tags: Tuple[str, ...] = _csv_tuple(
        os.getenv("TOUTIAO_SEARCH_TAGS", "时尚,明星,穿搭")
    )
    toutiao_keyword_pages: int = int(os.getenv("TOUTIAO_KEYWORD_PAGES", "1"))


CELEBRITY_NAMES = _csv_tuple(os.getenv("WEIBO_CELEBRITIES", ""))
settings = Settings(weibo_celebrities=CELEBRITY_NAMES)


def reload_settings() -> None:
    """重新从 .env 文件加载配置到全局 settings 单例（原地更新字段，保留已有引用）。"""
    global CELEBRITY_NAMES
    load_dotenv(override=True)
    CELEBRITY_NAMES = _csv_tuple(os.getenv("WEIBO_CELEBRITIES", ""))
    new_settings = Settings(weibo_celebrities=CELEBRITY_NAMES)
    for field in new_settings.__dataclass_fields__:
        setattr(settings, field, getattr(new_settings, field))


def resolve_weibo_fetch_mode() -> str:
    return _effective_weibo_fetch_mode(settings.weibo_fetch_mode, settings.weibo_celebrities)


def ensure_dirs() -> None:
    DOWNLOAD_DIR.mkdir(parents=True, exist_ok=True)
    WECHAT_STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
    WEIBO_UID_CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    if not POSTS_CACHE_PATH.exists():
        POSTS_CACHE_PATH.write_text("[]", encoding="utf-8")
    if not QUEUE_CACHE_PATH.exists():
        QUEUE_CACHE_PATH.write_text("[]", encoding="utf-8")
