import os
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Tuple


# ── 路径配置 ──────────────────────────────────────────
# 打包模式下使用系统标准应用数据目录（可写），开发模式使用项目根目录
def _get_data_dir() -> Path:
    if getattr(sys, "frozen", False):
        if sys.platform == "darwin":
            base = Path.home() / "Library" / "Application Support" / "com.mediaforge.app"
        elif sys.platform == "win32":
            base = Path(os.environ.get("APPDATA", "")) / "MediaForge"
        else:
            base = Path.home() / ".local" / "share" / "MediaForge"
        return base / "data"
    else:
        return Path(__file__).resolve().parent / "data"


BASE_DIR = Path(__file__).resolve().parent  # 项目根目录（开发模式）
DATA_DIR = _get_data_dir()

# 素材（图片）目录：可通过 MATERIALS_PATH 环境变量自定义
_materials_override = os.getenv("MATERIALS_PATH", "").strip()
if _materials_override:
    DOWNLOAD_DIR = Path(_materials_override)
else:
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


def _resolve_api_key_from_store(provider: str) -> str:
    """从本地 key 存储中读取当前供应商的 API key（无依赖导入，避免循环引用）。"""
    from utils.api_key_store import get_api_key
    return get_api_key(provider)


def _resolve_weibo_cookie_from_store() -> str:
    from utils.weibo_auth_store import get_weibo_cookie
    return get_weibo_cookie()


def _resolve_weibo_uid_from_store() -> str:
    from utils.weibo_auth_store import get_weibo_uid
    return get_weibo_uid()


def _resolve_toutiao_cookie_from_store() -> str:
    from utils.toutiao_auth_store import get_toutiao_cookie
    return get_toutiao_cookie()


def _resolve_toutiao_uid_from_store() -> str:
    from utils.toutiao_auth_store import get_toutiao_uid
    return get_toutiao_uid()


@dataclass
class Settings:
    weibo_cookie: str = field(default_factory=lambda: (
        os.getenv("WEIBO_COOKIE", "")
        or _resolve_weibo_cookie_from_store()
    ))
    weibo_uid: str = field(default_factory=lambda: (
        os.getenv("WEIBO_UID", "")
        or _resolve_weibo_uid_from_store()
    ))
    weibo_fetch_mode: str = field(default_factory=lambda: os.getenv("WEIBO_FETCH_MODE", ""))
    weibo_celebrities: Tuple[str, ...] = ()
    weibo_search_tags: Tuple[str, ...] = field(
        default_factory=lambda: _csv_tuple(os.getenv("WEIBO_SEARCH_TAGS", "美图,日常,时装周,美妆,穿搭"))
    )
    weibo_keyword_pages: int = field(default_factory=lambda: int(os.getenv("WEIBO_KEYWORD_PAGES", "1")))
    weibo_scene_extra_tags: Tuple[str, ...] = field(default_factory=lambda: _csv_tuple(os.getenv("WEIBO_SCENE_EXTRA_TAGS", "")))
    weibo_super_topics: Tuple[str, ...] = field(default_factory=lambda: _csv_tuple(os.getenv("WEIBO_SUPER_TOPICS", "")))
    ai_provider: str = field(default_factory=lambda: os.getenv("AI_PROVIDER", "mimo").lower())
    ai_model: str = field(default_factory=lambda: os.getenv("AI_MODEL", "mimo-v2.5-pro"))
    ai_api_key: str = field(default_factory=lambda: (
        os.getenv("AI_API_KEY", "")
        or _resolve_api_key_from_store(os.getenv("AI_PROVIDER", "mimo").lower())
        or {
            "mimo": os.getenv("MIMO_API_KEY", ""),
            "deepseek": os.getenv("DEEPSEEK_API_KEY", ""),
            "glm": os.getenv("GLM_API_KEY", ""),
            "openai": os.getenv("OPENAI_API_KEY", ""),
        }.get(os.getenv("AI_PROVIDER", "mimo").lower(), "")
    ))
    ai_base_url: str = field(default_factory=lambda: os.getenv("AI_BASE_URL", ""))
    post_limit: int = field(default_factory=lambda: int(os.getenv("POST_LIMIT", "3")))
    weibo_pages: int = field(default_factory=lambda: int(os.getenv("WEIBO_PAGES", "2")))
    request_timeout: int = field(default_factory=lambda: int(os.getenv("REQUEST_TIMEOUT", "120")))
    ai_timeout: int = field(default_factory=lambda: int(os.getenv("AI_TIMEOUT", "120")))
    retry_times: int = field(default_factory=lambda: int(os.getenv("RETRY_TIMES", "3")))
    min_publish_interval: int = field(default_factory=lambda: int(os.getenv("PUBLISH_INTERVAL_SECONDS", "10")))
    no_publish_without_confirm: bool = field(default_factory=lambda: os.getenv("REQUIRE_CONFIRM", "true").lower() == "true")
    watermark_filter: bool = field(default_factory=lambda: os.getenv("WATERMARK_FILTER", "true").lower() == "true")
    watermark_corner_ratio: float = field(default_factory=lambda: float(os.getenv("WATERMARK_CORNER_RATIO", "1.38")))
    watermark_bottom_ratio: float = field(default_factory=lambda: float(os.getenv("WATERMARK_BOTTOM_RATIO", "1.48")))
    watermark_strict_mode: bool = field(default_factory=lambda: os.getenv("WATERMARK_STRICT_MODE", "true").lower() == "true")
    min_clean_images: int = field(default_factory=lambda: int(os.getenv("MIN_CLEAN_IMAGES", "3")))
    allow_watermark_fallback: bool = field(default_factory=lambda: os.getenv("ALLOW_WATERMARK_FALLBACK", "false").lower() == "true")
    # ── 平台选择 ──
    platform: str = field(default_factory=lambda: os.getenv("PLATFORM", "weibo"))
    # ── 今日头条 ──
    toutiao_cookie: str = field(default_factory=lambda: (
        os.getenv("TOUTIAO_COOKIE", "")
        or _resolve_toutiao_cookie_from_store()
    ))
    toutiao_user_id: str = field(default_factory=lambda: (
        os.getenv("TOUTIAO_USER_ID", "")
        or _resolve_toutiao_uid_from_store()
    ))
    toutiao_fetch_mode: str = field(default_factory=lambda: os.getenv("TOUTIAO_FETCH_MODE", "feed"))
    toutiao_search_tags: Tuple[str, ...] = field(
        default_factory=lambda: _csv_tuple(os.getenv("TOUTIAO_SEARCH_TAGS", "时尚,明星,穿搭"))
    )
    toutiao_keyword_pages: int = field(default_factory=lambda: int(os.getenv("TOUTIAO_KEYWORD_PAGES", "1")))


CELEBRITY_NAMES = _csv_tuple(os.getenv("WEIBO_CELEBRITIES", ""))
settings = Settings(weibo_celebrities=CELEBRITY_NAMES)


def reload_settings() -> None:
    """重新从 settings.json 加载配置到全局 settings 单例。"""
    global CELEBRITY_NAMES, DOWNLOAD_DIR

    # 从 settings.json 加载并注入环境变量
    try:
        from utils.settings_store import read_settings
        store = read_settings()
        for k, v in store.items():
            os.environ[k] = v
    except Exception:
        pass

    CELEBRITY_NAMES = _csv_tuple(os.getenv("WEIBO_CELEBRITIES", ""))
    # 重新计算素材目录（支持运行时修改 MATERIALS_PATH）
    _materials_override = os.getenv("MATERIALS_PATH", "").strip()
    if _materials_override:
        DOWNLOAD_DIR = Path(_materials_override)
    else:
        DOWNLOAD_DIR = DATA_DIR / "images"
    new_settings = Settings(weibo_celebrities=CELEBRITY_NAMES)
    for field_name in new_settings.__dataclass_fields__:
        setattr(settings, field_name, getattr(new_settings, field_name))


# 启动时加载 settings.json 合并到 settings 单例，确保桌面 UI 保存的配置立即生效
reload_settings()


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
