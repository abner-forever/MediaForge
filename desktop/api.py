"""FastAPI 路由定义。"""

from __future__ import annotations

import asyncio
import json
import os
import re
import sys
import threading
import time
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

import requests as http_requests
from PIL import Image as PILImage

PILImage.MAX_IMAGE_PIXELS = None  # 禁用 decompression bomb 限制，部分图片分辨率较高

from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import FileResponse, HTMLResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

# 确保项目根目录在 sys.path 中
PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from config import DATA_DIR, DOWNLOAD_DIR, LOG_DIR, settings
from desktop.app_state import app_state, MATERIALS_META_PATH
from services.ai import (
    chat_article,
    de_ai_article,
    generate_article,
    generate_article_title,
    generate_article_title_candidates,
    generate_content,
    optimize_layout,
    polish_article,
    recommend_celebrities,
    strip_emoji,
)
from services.downloader import download_images
from services.extensions import build_html, score_images_batch, select_cover
from services.platforms import get_platform, list_platforms
from services.toutiao_login import run_toutiao_login
from services.weibo_login import run_weibo_login
from services.xhs_login import run_xhs_login
from utils.audit import create_run_log_path, append_audit
from utils.file import read_json

# 初始化文件日志（桌面 GUI 启动时自动捕获日志到 data/logs/app.log）
from utils.logger import setup_file_logging
setup_file_logging(LOG_DIR)

# ── Pipeline Agent 跨线程通信 ────────────────────────
pipeline_cancel_events: Dict[str, threading.Event] = {}
pipeline_confirm_events: Dict[str, threading.Event] = {}
pipeline_decision_events: Dict[str, threading.Event] = {}
pipeline_decision_results: Dict[str, str] = {}

app = FastAPI(title="图文工坊")

# ── 请求日志中间件：记录所有 API 调用到 app.log ──────────
from utils.logger import get_logger as _get_req_logger
_req_logger = _get_req_logger("api")

@app.middleware("http")
async def _log_requests(request, call_next):
    start = time.time()
    response = await call_next(request)
    cost = time.time() - start
    if request.url.path.startswith("/api/"):
        _req_logger.info("%s %s → %s (%.0fms)", request.method, request.url.path, response.status_code, cost * 1000)
    return response

# ── Toast 日志写入（前端操作提示落地到 app.log）────────
class ToastLogRequest(BaseModel):
    message: str
    type: str = "info"

@app.post("/api/logs/toast")
async def log_toast(req: ToastLogRequest):
    _req_logger.info("[TOAST/%s] %s", req.type, req.message)
    return {"success": True}

# 静态文件（Vite 构建输出 + logo 等资源）
# 在冻结（PyInstaller）环境中，静态文件可能被放到 sys._MEIPASS 或 dist/<app>/_internal/desktop/static
def _resolve_static_dir() -> Path:
    # 优先寻找运行时的 _MEIPASS（onefile）或解包目录（one-folder）
    meipass = getattr(sys, '_MEIPASS', None)
    candidates = []
    if meipass:
        meipass = Path(meipass)
        candidates.extend([
            meipass / 'desktop' / 'static',
            meipass / 'static',
            meipass / '_internal' / 'desktop' / 'static',
            meipass / '_internal' / 'static',
        ])

    # 项目源代码目录（开发模式）
    candidates.append(Path(__file__).parent / 'static')

    # dist one-folder 可能将 datas 放到 dist/<app>/_internal/desktop/static
    project_root = Path(__file__).resolve().parent.parent
    candidates.append(project_root / 'dist' / project_root.name / '_internal' / 'desktop' / 'static')

    for c in candidates:
        try:
            if c.exists():
                return c
        except Exception:
            continue
    # 最后兜底为模块相对路径
    return Path(__file__).parent / 'static'


STATIC_DIR = _resolve_static_dir()
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

# React 构建产物中的 JS/CSS chunk
_assets_dir = STATIC_DIR / "assets"
if _assets_dir.exists():
    app.mount("/assets", StaticFiles(directory=str(_assets_dir)), name="assets")

_js_dir = STATIC_DIR / "js"
if _js_dir.exists():
    app.mount("/js", StaticFiles(directory=str(_js_dir)), name="js")

_vendor_dir = STATIC_DIR / "vendor"
if _vendor_dir.exists():
    app.mount("/vendor", StaticFiles(directory=str(_vendor_dir)), name="vendor")


# ── 图片路径辅助 ─────────────────────────────────────
def _img_rel(path: str) -> str:
    """将图片绝对路径转为相对 DOWNLOAD_DIR 的正斜杠路径，用于前端 URL 构建。"""
    try:
        return str(Path(path).relative_to(DOWNLOAD_DIR).as_posix())
    except (ValueError, TypeError):
        return path


# ── Pydantic 模型 ──────────────────────────────────────


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


# ── 文章请求模型 ───────────────────────────────────


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


class ArticleChatRequest(BaseModel):
    instruction: str


class ArticlePublishRequest(BaseModel):
    save_draft: bool = False
    dry_run: bool = False
    account_id: Optional[str] = None


def _friendly_error_message(err: Exception | str) -> str:
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


def _raise_friendly(status_code: int, err: Exception | str) -> None:
    raise HTTPException(status_code, _friendly_error_message(err))


# ── 首页 ──────────────────────────────────────────────


@app.get("/", response_class=HTMLResponse)
async def index():
    html_path = STATIC_DIR / "index.html"
    return HTMLResponse(html_path.read_text(encoding="utf-8"))


# ── Settings API ──────────────────────────────────────


def _mask_key(key: str) -> str:
    """Mask API key: show first 8 and last 4 chars, middle replaced with asterisks."""
    if not key or len(key) <= 12:
        return key
    return f"{key[:8]}{'*' * (len(key) - 12)}{key[-4:]}"


def _get_provider_key(env: dict, provider: str) -> str:
    """获取当前 AI 服务商对应的 API key：env 覆盖 → 本地存储 → env 兜底。"""
    # 1. AI_API_KEY env var 作为通用覆盖
    if env.get("AI_API_KEY"):
        return env["AI_API_KEY"]
    # 2. 本地 key 存储
    from utils.api_key_store import get_api_key
    local_key = get_api_key(provider)
    if local_key:
        return local_key
    # 3. 供应商专用 env var（向后兼容）
    key_map = {
        "mimo": "MIMO_API_KEY",
        "deepseek": "DEEPSEEK_API_KEY",
        "glm": "GLM_API_KEY",
        "openai": "OPENAI_API_KEY",
        "qwen": "QWEN_API_KEY",
        "minimax": "MINIMAX_API_KEY",
    }
    return env.get(key_map.get(provider, ""), "") or ""


def _get_wechat_accounts_list() -> list:
    """获取微信账号列表（含登录状态）。"""
    try:
        from utils.wechat_auth_store import list_accounts
        return list_accounts()
    except Exception:
        return []


@app.get("/api/settings")
async def get_settings():
    from utils.weibo_auth_store import read_weibo_auth
    from utils.settings_store import read_settings as read_json_settings

    store = read_json_settings()
    cfg = store

    provider = cfg.get("AI_PROVIDER", "mimo").lower()
    current_key = _get_provider_key(cfg, provider)

    # 收集所有供应商的 masked key，用于前端切换展示
    all_keys = {}
    for prov in ("mimo", "deepseek", "glm", "openai", "minimax"):
        k = _get_provider_key(cfg, prov)
        if k:
            all_keys[prov] = _mask_key(k)

    # 微博鉴权优先读取独立存储（支持清空），再回退
    auth = read_weibo_auth()
    weibo_cookie = auth.get("cookie", "") or cfg.get("WEIBO_COOKIE", "")
    weibo_uid = auth.get("uid", "") or cfg.get("WEIBO_UID", "")
    weibo_screen_name = auth.get("screen_name", "")
    weibo_avatar = auth.get("avatar", "")

    # 头条鉴权优先读取独立存储（支持清空），再回退
    from utils.toutiao_auth_store import read_toutiao_auth
    toutiao_auth = read_toutiao_auth()
    toutiao_cookie = toutiao_auth.get("cookie", "") or cfg.get("TOUTIAO_COOKIE", "")
    toutiao_uid = toutiao_auth.get("uid", "") or cfg.get("TOUTIAO_USER_ID", "")
    toutiao_screen_name = toutiao_auth.get("screen_name", "")
    toutiao_avatar = toutiao_auth.get("avatar", "")

    # 小红书鉴权优先读取独立存储（支持清空），再回退
    from utils.xhs_auth_store import read_xhs_auth
    xhs_auth = read_xhs_auth()
    xhs_cookie = xhs_auth.get("cookie", "") or cfg.get("XHS_COOKIE", "")
    xhs_uid = xhs_auth.get("uid", "") or cfg.get("XHS_UID", "")
    xhs_screen_name = xhs_auth.get("screen_name", "")
    xhs_avatar = xhs_auth.get("avatar", "")

    return {
        "platform": cfg.get("PLATFORM", "weibo"),
        "ai_provider": provider,
        "ai_model": cfg.get("AI_MODEL", "mimo-chat"),
        "ai_base_url": cfg.get("AI_BASE_URL", ""),
        "ai_api_key_set": bool(current_key),
        "ai_api_key_masked": _mask_key(current_key) if current_key else "",
        "ai_api_keys": all_keys,
        "weibo_uid": weibo_uid,
        "weibo_cookie_set": bool(weibo_cookie),
        "weibo_cookie": weibo_cookie,
        "weibo_screen_name": weibo_screen_name,
        "weibo_avatar": weibo_avatar,
        "weibo_fetch_mode": cfg.get("WEIBO_FETCH_MODE", "celebrities"),
        "weibo_celebrities": cfg.get("WEIBO_CELEBRITIES", ""),
        "weibo_search_tags": cfg.get("WEIBO_SEARCH_TAGS", "美图,日常,时装周,美妆,穿搭"),
        "weibo_scene_extra_tags": cfg.get("WEIBO_SCENE_EXTRA_TAGS", ""),
        "weibo_super_topics": cfg.get("WEIBO_SUPER_TOPICS", ""),
        # ── 今日头条 ──
        "toutiao_cookie_set": bool(toutiao_cookie),
        "toutiao_cookie": toutiao_cookie,
        "toutiao_uid": toutiao_uid,
        "toutiao_user_id": cfg.get("TOUTIAO_USER_ID", ""),
        "toutiao_screen_name": toutiao_screen_name,
        "toutiao_avatar": toutiao_avatar,
        "toutiao_fetch_mode": cfg.get("TOUTIAO_FETCH_MODE", "feed"),
        "toutiao_search_tags": cfg.get("TOUTIAO_SEARCH_TAGS", "时尚,明星,穿搭"),
        # ── 小红书 ──
        "xhs_cookie_set": bool(xhs_cookie),
        "xhs_cookie": xhs_cookie,
        "xhs_uid": xhs_uid,
        "xhs_screen_name": xhs_screen_name,
        "xhs_avatar": xhs_avatar,
        "xhs_fetch_mode": cfg.get("XHS_FETCH_MODE", "keyword"),
        "xhs_search_tags": cfg.get("XHS_SEARCH_TAGS", "穿搭,美妆,明星"),
        "post_limit": int(cfg.get("POST_LIMIT", "3")),
        "weibo_pages": int(cfg.get("WEIBO_PAGES", "2")),
        "publish_interval": int(cfg.get("PUBLISH_INTERVAL_SECONDS", "10")),
        "request_timeout": int(cfg.get("REQUEST_TIMEOUT", "20")),
        "retry_times": int(cfg.get("RETRY_TIMES", "3")),
        "require_confirm": cfg.get("REQUIRE_CONFIRM", "true").lower() == "true",
        "watermark_filter": cfg.get("WATERMARK_FILTER", "true").lower() == "true",
        "watermark_strict_mode": cfg.get("WATERMARK_STRICT_MODE", "true").lower() == "true",
        "min_clean_images": int(cfg.get("MIN_CLEAN_IMAGES", "3")),
        "watermark_corner_ratio": float(cfg.get("WATERMARK_CORNER_RATIO", "1.38")),
        "watermark_bottom_ratio": float(cfg.get("WATERMARK_BOTTOM_RATIO", "1.48")),
        "allow_watermark_fallback": cfg.get("ALLOW_WATERMARK_FALLBACK", "false").lower() == "true",
        # ── 素材保存路径 ──
        "materials_path": cfg.get("MATERIALS_PATH", ""),
        "download_dir": str(DOWNLOAD_DIR),
        # ── 主题设置 ──
        "theme": store.get("APP_THEME", ""),
        "accent": store.get("APP_ACCENT", ""),
        # ── 微信多账号 ──
        "wechat_accounts": _get_wechat_accounts_list(),
    }


@app.post("/api/settings")
async def save_settings(data: Dict[str, Any]):
    updates = {}
    for k, v in data.items():
        if isinstance(v, bool):
            updates[k] = "true" if v else "false"
        else:
            updates[k] = str(v)

    # 拦截供应商专用 API key → 写入本地存储，不写 .env
    _API_KEY_ENV_NAMES = {"MIMO_API_KEY", "DEEPSEEK_API_KEY", "GLM_API_KEY", "OPENAI_API_KEY", "QWEN_API_KEY", "MINIMAX_API_KEY"}
    local_keys = {}
    for key in _API_KEY_ENV_NAMES:
        if key in updates:
            provider = key.replace("_API_KEY", "").lower()
            local_keys[provider] = updates.pop(key)

    if local_keys:
        from utils.api_key_store import save_api_keys
        save_api_keys(local_keys)

    # 微博鉴权信息 → 写入独立存储（可清空）
    _WEIBO_AUTH_KEYS = {"WEIBO_COOKIE", "WEIBO_UID", "WEIBO_SCREEN_NAME", "WEIBO_AVATAR"}
    weibo_auth = {}
    for key in _WEIBO_AUTH_KEYS:
        if key in updates:
            weibo_auth[key] = updates.pop(key)

    if weibo_auth:
        from utils.weibo_auth_store import write_weibo_auth
        write_weibo_auth(
            cookie=weibo_auth.get("WEIBO_COOKIE", ""),
            uid=weibo_auth.get("WEIBO_UID", ""),
            screen_name=weibo_auth.get("WEIBO_SCREEN_NAME", ""),
            avatar=weibo_auth.get("WEIBO_AVATAR", ""),
        )

    # 头条鉴权信息 → 写入独立存储（可清空）
    _TOUTIAO_AUTH_KEYS = {"TOUTIAO_COOKIE", "TOUTIAO_UID", "TOUTIAO_SCREEN_NAME", "TOUTIAO_AVATAR"}
    toutiao_auth = {}
    for key in _TOUTIAO_AUTH_KEYS:
        if key in updates:
            toutiao_auth[key] = updates.pop(key)

    if toutiao_auth:
        from utils.toutiao_auth_store import write_toutiao_auth
        write_toutiao_auth(
            cookie=toutiao_auth.get("TOUTIAO_COOKIE", ""),
            uid=toutiao_auth.get("TOUTIAO_UID", ""),
            screen_name=toutiao_auth.get("TOUTIAO_SCREEN_NAME", ""),
            avatar=toutiao_auth.get("TOUTIAO_AVATAR", ""),
        )

    # 小红书鉴权信息 → 写入独立存储（可清空）
    _XHS_AUTH_KEYS = {"XHS_COOKIE", "XHS_UID", "XHS_SCREEN_NAME", "XHS_AVATAR"}
    xhs_auth = {}
    for key in _XHS_AUTH_KEYS:
        if key in updates:
            xhs_auth[key] = updates.pop(key)

    if xhs_auth:
        from utils.xhs_auth_store import write_xhs_auth
        write_xhs_auth(
            cookie=xhs_auth.get("XHS_COOKIE", ""),
            uid=xhs_auth.get("XHS_UID", ""),
            screen_name=xhs_auth.get("XHS_SCREEN_NAME", ""),
            avatar=xhs_auth.get("XHS_AVATAR", ""),
        )

    # 其余配置项 → settings.json（替代 .env）
    if updates:
        from utils.settings_store import write_settings
        write_settings(updates)
    from config import reload_settings
    reload_settings()

    # sync module-level DOWNLOAD_DIR reference after path change
    import config as _cfg
    globals()["DOWNLOAD_DIR"] = _cfg.DOWNLOAD_DIR

    return {"success": True, "message": "配置已保存"}


@app.get("/api/settings/theme")
async def get_theme():
    """轻量主题设置接口，避免加载全部配置"""
    from utils.settings_store import read_settings
    s = read_settings()
    return {"theme": s.get("APP_THEME", ""), "accent": s.get("APP_ACCENT", "")}


@app.post("/api/theme/window-native")
async def set_window_native_theme(data: Dict[str, str]):
    """设置 macOS 原生窗口的 appearance（标题栏跟随 dark/light 模式）。"""
    theme = data.get("theme", "auto")
    from desktop.native_theme import set_appearance as _set_native
    await asyncio.to_thread(_set_native, theme)
    return {"success": True}


@app.get("/api/settings/api-key")
async def get_api_key(provider: str = Query("")):
    from utils.settings_store import read_settings
    store = read_settings()
    prov = (provider or store.get("AI_PROVIDER", "mimo")).lower()
    key = _get_provider_key(store, prov)
    return {"key": key}


@app.post("/api/settings/ai-test")
async def test_ai_connection(data: dict):
    """测试 AI 服务连通性：向配置的端点发送轻量请求验证配置有效。"""
    from utils.settings_store import read_settings as _read_settings

    cfg = _read_settings()
    provider = (data.get("provider") or cfg.get("AI_PROVIDER") or "mimo").lower()
    model = data.get("model") or cfg.get("AI_MODEL") or "mimo-chat"
    base_url = data.get("base_url") or cfg.get("AI_BASE_URL") or ""
    api_key = data.get("api_key") or _get_provider_key(cfg, provider)

    if not base_url:
        return {"success": False, "message": "请先配置 Base URL"}
    if not api_key:
        return {"success": False, "message": "请先配置 API Key"}

    base = base_url.rstrip("/")
    for suffix in ("/messages", "/v1/messages", "/chat/completions"):
        if base.endswith(suffix):
            base = base[: -len(suffix)]
    base = base.rstrip("/")

    # 构造候选 URL 列表
    if base.endswith("/v1"):
        url_candidates = [f"{base}/chat/completions"]
    elif re.search(r"/v\d+$", base):
        # 已有版本号路径（如 /v4），只试直接拼接
        url_candidates = [f"{base}/chat/completions"]
    else:
        url_candidates = [f"{base}/chat/completions", f"{base}/v1/chat/completions"]

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": model,
        "messages": [{"role": "user", "content": "ping"}],
        "max_tokens": 5,
    }
    timeout = int(cfg.get("REQUEST_TIMEOUT", 30))

    # 打印 curl 命令方便调试
    curl_cmd = f"curl -s -w '\\n%{{http_code}}' '{url_candidates[0]}' -H 'Authorization: Bearer {api_key[:8]}...' -H 'Content-Type: application/json' -d '{json.dumps(payload)}'"
    print(f"[AI测试] provider={provider} model={model}", flush=True)
    print(f"[AI测试] 候选URL: {url_candidates}", flush=True)
    print(f"[AI测试] curl: {curl_cmd}", flush=True)

    errors = []
    for url in url_candidates:
        try:
            resp = http_requests.post(url, headers=headers, json=payload, timeout=timeout)
            if resp.status_code == 200:
                return {"success": True, "message": "连接成功"}
            detail = resp.text[:300]
            msg = f"[{url}] 连接失败（{resp.status_code}）: {detail}"
            errors.append(msg)
            print(f"[AI测试] {msg}", flush=True)
        except Exception as e:
            msg = f"[{url}] 连接失败: {str(e)}"
            errors.append(msg)
            print(f"[AI测试] {msg}", flush=True)
            continue
    return {"success": False, "message": "\n".join(errors)}


@app.get("/api/settings/weibo-login-stream")
async def weibo_login_stream():
    """SSE 流：打开系统 WebView 弹出窗口让用户登录微博，捕获 Cookie 和 UID 后推送给前端。"""
    import json as _json
    from queue import Empty, Queue
    from concurrent.futures import ThreadPoolExecutor

    msg_queue: Queue = Queue()
    ThreadPoolExecutor(1).submit(run_weibo_login, msg_queue)

    def event_stream():
        while True:
            try:
                msg = msg_queue.get(timeout=0.5)
            except Empty:
                yield ": keepalive\n\n"
                continue

            if msg[0] == "progress":
                yield f"data: {_json.dumps({'type': 'progress', 'message': msg[1]}, ensure_ascii=False)}\n\n"
            elif msg[0] == "done":
                _, cookie, uid, screen_name, avatar = msg if len(msg) >= 5 else (*msg, "", "", "")
                if cookie:
                    from utils.weibo_auth_store import write_weibo_auth
                    write_weibo_auth(cookie=cookie, uid=uid, screen_name=screen_name, avatar=avatar)
                    # 重新加载配置使新 cookie 立即生效
                    from config import reload_settings
                    reload_settings()
                yield f"data: {_json.dumps({'type': 'done', 'cookie': cookie, 'uid': uid, 'screen_name': screen_name, 'avatar': avatar}, ensure_ascii=False)}\n\n"
                break
            elif msg[0] == "error":
                yield f"data: {_json.dumps({'type': 'error', 'message': msg[1]}, ensure_ascii=False)}\n\n"
                break

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@app.get("/api/settings/toutiao-login-stream")
async def toutiao_login_stream():
    """SSE 流：打开浏览器让用户登录今日头条，捕获 Cookie 后推送给前端。"""
    import json as _json
    from queue import Empty, Queue
    from concurrent.futures import ThreadPoolExecutor

    msg_queue: Queue = Queue()
    ThreadPoolExecutor(1).submit(run_toutiao_login, msg_queue)

    def event_stream():
        while True:
            try:
                msg = msg_queue.get(timeout=0.5)
            except Empty:
                yield ": keepalive\n\n"
                continue

            if msg[0] == "progress":
                yield f"data: {_json.dumps({'type': 'progress', 'message': msg[1]}, ensure_ascii=False)}\n\n"
            elif msg[0] == "done":
                _, cookie, uid, screen_name, avatar = msg if len(msg) >= 5 else (*msg, "", "", "")
                if cookie:
                    from utils.toutiao_auth_store import write_toutiao_auth
                    write_toutiao_auth(cookie=cookie, uid=uid, screen_name=screen_name, avatar=avatar)
                    from config import reload_settings
                    reload_settings()
                yield f"data: {_json.dumps({'type': 'done', 'cookie': cookie, 'uid': uid, 'screen_name': screen_name, 'avatar': avatar}, ensure_ascii=False)}\n\n"
                break
            elif msg[0] == "error":
                yield f"data: {_json.dumps({'type': 'error', 'message': msg[1]}, ensure_ascii=False)}\n\n"
                break

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@app.get("/api/settings/xhs-login-stream")
async def xhs_login_stream():
    """SSE 流：打开浏览器让用户登录小红书，捕获 Cookie 后推送给前端。"""
    import json as _json
    from queue import Empty, Queue
    from concurrent.futures import ThreadPoolExecutor

    msg_queue: Queue = Queue()
    ThreadPoolExecutor(1).submit(run_xhs_login, msg_queue)

    def event_stream():
        while True:
            try:
                msg = msg_queue.get(timeout=0.5)
            except Empty:
                yield ": keepalive\n\n"
                continue

            if msg[0] == "progress":
                yield f"data: {_json.dumps({'type': 'progress', 'message': msg[1]}, ensure_ascii=False)}\n\n"
            elif msg[0] == "done":
                _, cookie, uid, screen_name, avatar = msg if len(msg) >= 5 else (*msg, "", "", "")
                if cookie:
                    from utils.xhs_auth_store import write_xhs_auth
                    write_xhs_auth(cookie=cookie, uid=uid, screen_name=screen_name, avatar=avatar)
                    from config import reload_settings
                    reload_settings()
                yield f"data: {_json.dumps({'type': 'done', 'cookie': cookie, 'uid': uid, 'screen_name': screen_name, 'avatar': avatar}, ensure_ascii=False)}\n\n"
                break
            elif msg[0] == "error":
                yield f"data: {_json.dumps({'type': 'error', 'message': msg[1]}, ensure_ascii=False)}\n\n"
                break

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@app.post("/api/settings/toutiao-verify")
async def toutiao_verify(body: dict = {}):
    """验证今日头条 Cookie 是否有效，返回用户信息。"""
    import asyncio, requests

    cookie = body.get("cookie", "")
    if not cookie:
        from config import settings
        cookie = settings.toutiao_cookie

    if not cookie:
        return {"valid": False, "message": "未设置今日头条 Cookie"}

    def _verify():
        try:
            from utils.logger import get_logger
            logger = get_logger(__name__)
            headers = {
                "User-Agent": (
                    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36"
                ),
                "Cookie": cookie,
                "Referer": "https://www.toutiao.com/",
                "Accept": "application/json, text/plain, */*",
                "X-Requested-With": "XMLHttpRequest",
            }

            screen_name = ""
            avatar = ""
            uid = ""

            # 尝试 pgc/ma/profile/ 获取用户信息
            try:
                resp = requests.get(
                    "https://www.toutiao.com/pgc/ma/profile/",
                    headers=headers, timeout=10,
                )
                if resp.status_code == 200:
                    data = resp.json()
                    if data.get("message") == "success":
                        user_data = data.get("data", {}).get("user", {})
                        screen_name = user_data.get("name", "") or user_data.get("screen_name", "")
                        avatar = user_data.get("avatar_url", "") or user_data.get("avatar", "")
                        uid = user_data.get("user_id", "") or str(user_data.get("id", ""))
            except Exception:
                pass

            # 尝试 mp.toutiao.com 创作者中心 API（更可靠）
            if not screen_name:
                try:
                    mp_headers = {
                        "User-Agent": headers["User-Agent"],
                        "Cookie": cookie,
                        "Accept": "application/json, text/plain, */*",
                        "Referer": "https://mp.toutiao.com/profile_v4/index",
                    }
                    resp = requests.get(
                        "https://mp.toutiao.com/mp/agw/creator_center/user_info?app_id=1231",
                        headers=mp_headers, timeout=10,
                    )
                    if resp.status_code == 200:
                        data = resp.json()
                        if data.get("message") == "success":
                            screen_name = data.get("name", "") or screen_name
                            avatar = data.get("avatar_url", "") or avatar
                            uid = str(data.get("user_id", "")) or str(data.get("media_id", "")) or uid
                            logger.info("创作者中心 API 获取到用户信息: %s", screen_name)
                except Exception:
                    pass

            # 兜底：从页面内容提取用户信息
            if not screen_name:
                try:
                    resp = requests.get(
                        "https://www.toutiao.com/",
                        headers=dict(headers, Accept="text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"),
                        timeout=10, allow_redirects=True,
                    )
                    if resp.status_code == 200:
                        import re as _re
                        # 尝试多种正则模式提取
                        for pat in [
                            r'"name"\s*:\s*"([^"]+)"',
                            r'"nickname"\s*:\s*"([^"]+)"',
                            r'"screen_name"\s*:\s*"([^"]+)"',
                        ]:
                            m = _re.search(pat, resp.text)
                            if m:
                                screen_name = m.group(1)
                                break
                        for pat in [
                            r'"user_id"\s*:\s*"(\d+)"',
                            r'"id"\s*:\s*(\d+)',
                            r'"uid"\s*:\s*"(\d+)"',
                        ]:
                            m = _re.search(pat, resp.text)
                            if m:
                                uid = m.group(1)
                                break
                        for pat in [
                            r'"avatar_url"\s*:\s*"([^"]+)"',
                            r'"avatar"\s*:\s*"([^"]+)"',
                        ]:
                            m = _re.search(pat, resp.text)
                            if m:
                                avatar = m.group(1)
                                break
                except Exception:
                    pass

            if screen_name:
                from utils.toutiao_auth_store import write_toutiao_auth
                write_toutiao_auth(cookie=cookie, uid=uid, screen_name=screen_name, avatar=avatar)
                return {"valid": True, "uid": uid, "screen_name": screen_name, "avatar": avatar}

            # 基本连通性检查
            try:
                resp = requests.get(
                    "https://www.toutiao.com/",
                    headers=dict(headers, Accept="text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"),
                    timeout=10, allow_redirects=False,
                )
                if resp.status_code == 200:
                    return {"valid": True, "uid": uid, "screen_name": "", "avatar": "", "message": "Cookie 有效，但无法获取用户信息"}
            except Exception:
                pass

            return {"valid": False, "message": "Cookie 无效或已过期", "uid": uid or "", "screen_name": "", "avatar": ""}
        except Exception as exc:
            return {"valid": False, "message": str(exc)}

    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, _verify)


@app.post("/api/settings/toutiao-clear")
async def clear_toutiao():
    """清空今日头条鉴权信息（Cookie、UID、用户名）。"""
    from utils.toutiao_auth_store import clear_toutiao_auth
    from config import reload_settings
    clear_toutiao_auth()
    reload_settings()
    return {"success": True}


@app.get("/api/pick-folder")
async def pick_folder():
    """打开原生访达文件夹选择对话框，返回选中路径。"""
    import asyncio, subprocess, json as _json

    def _pick():
        script = (
            'set folderPath to POSIX path of '
            '(choose folder with prompt "选择素材保存目录")\n'
            'return folderPath'
        )
        try:
            ret = subprocess.run(
                ["osascript", "-e", script],
                capture_output=True, text=True, timeout=30,
            )
            path = ret.stdout.strip()
            return {"path": path if path else ""}
        except Exception:
            return {"path": ""}

    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, _pick)


@app.post("/api/settings/weibo-verify")
async def weibo_verify(body: dict = {}):
    """验证微博 Cookie 是否有效，返回用户信息。"""
    import asyncio, requests

    cookie = body.get("cookie", "")
    if not cookie:
        from config import settings
        cookie = settings.weibo_cookie

    if not cookie:
        return {"valid": False, "message": "未设置微博 Cookie"}

    def _verify():
        try:
            # 尝试用 Cookie 访问用户信息 API
            from services.weibo_login import _fetch_user_info
            import re

            # 先从 cookie 中提取 uid
            uid = ""
            for part in cookie.split(";"):
                kv = part.strip().split("=", 1)
                if len(kv) == 2 and kv[0].strip() == "uid":
                    uid = kv[1].strip()
                    break

            headers = {
                "User-Agent": (
                    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36"
                ),
                "Cookie": cookie,
                "Referer": "https://weibo.com/",
                "Accept": "application/json, text/plain, */*",
            }

            # 1) 如果有 uid，直接查 profile
            screen_name = ""
            avatar = ""
            if uid:
                screen_name, avatar = _fetch_user_info(cookie, uid)

            # 2) 如果没有 uid 或没查到，尝试从 allGroups 推断
            if not screen_name:
                resp = requests.get(
                    "https://weibo.com/ajax/feed/allGroups",
                    headers=headers, timeout=10,
                )
                if resp.status_code == 200:
                    data = resp.json()
                    matched = re.search(r'"uid"\s*:\s*"(\d+)"', resp.text)
                    if matched:
                        uid = matched.group(1)
                        screen_name, avatar = _fetch_user_info(cookie, uid)

            if screen_name:
                # 验证通过，同步保存到鉴权存储
                from utils.weibo_auth_store import write_weibo_auth
                write_weibo_auth(cookie=cookie, uid=uid, screen_name=screen_name, avatar=avatar)
                return {"valid": True, "uid": uid, "screen_name": screen_name, "avatar": avatar}
            return {"valid": False, "message": "Cookie 无效或已过期", "uid": uid or "", "screen_name": "", "avatar": ""}
        except Exception as exc:
            return {"valid": False, "message": str(exc)}

    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, _verify)


@app.post("/api/settings/weibo-clear")
async def clear_weibo():
    """清空微博鉴权信息（Cookie、UID、用户名）。"""
    from utils.weibo_auth_store import clear_weibo_auth
    from config import reload_settings
    clear_weibo_auth()
    reload_settings()
    return {"success": True}


@app.post("/api/settings/xhs-verify")
async def xhs_verify(body: dict = {}):
    """验证小红书 Cookie 是否有效，返回用户信息。

    小红书 API 需要 x-s/x-t 签名头（前端 JS 生成），无法直接用 requests 调用。
    采用多层策略：
      1. 检查 cookie 中是否存在 web_session 等关键会话标记
      2. 尝试用户信息 API（可能在部分网络环境下生效）
      3. 访问首页从 SSR HTML 中提取用户信息
    """
    import asyncio, requests

    cookie = body.get("cookie", "")
    if not cookie:
        from config import settings
        cookie = settings.xhs_cookie

    if not cookie:
        return {"valid": False, "message": "未设置小红书 Cookie"}

    def _verify():
        try:
            headers = {
                "User-Agent": (
                    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36"
                ),
                "Cookie": cookie,
                "Referer": "https://www.xiaohongshu.com/",
                "Accept": "application/json, text/plain, */*",
            }

            screen_name = ""
            avatar = ""
            uid = ""

            # 0) 从 cookie 中提取 uid（如果有）
            for part in cookie.split(";"):
                kv = part.strip().split("=", 1)
                if len(kv) == 2 and kv[0].strip() in ("uid", "user_id"):
                    uid = kv[1].strip()

            # 1) 尝试用户信息 API（可能因缺少 x-s/x-t 签名而失败）
            try:
                resp = requests.get(
                    "https://www.xiaohongshu.com/api/sns/web/v1/user/self",
                    headers=headers, timeout=10,
                )
                if resp.status_code == 200:
                    data = resp.json()
                    if data.get("success"):
                        user_data = data.get("data", {})
                        screen_name = user_data.get("nickname", "") or user_data.get("name", "")
                        avatar = user_data.get("avatar", "") or user_data.get("image", "") or ""
                        uid = user_data.get("user_id", "") or str(user_data.get("id", "")) or uid
            except Exception:
                pass

            # 2) 尝试从首页 SSR 提取用户信息（不依赖 x-s/x-t）
            #    注意：首页有大量随机帖子的 nickname，不能简单取第一个匹配。
            #    只从 __INITIAL_STATE__ 等结构化脚本中提取当前登录用户。
            html = ""
            if not screen_name:
                try:
                    page_headers = {
                        "User-Agent": headers["User-Agent"],
                        "Cookie": cookie,
                        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                    }
                    resp = requests.get(
                        "https://www.xiaohongshu.com/",
                        headers=page_headers, timeout=10,
                    )
                    if resp.status_code == 200:
                        import json as _json
                        html = resp.text
                        init_match = re.search(
                            r'window\.__INITIAL_STATE__\s*=\s*({.*?});\s*(?:\n|<)',
                            html, re.DOTALL,
                        )
                        if init_match:
                            try:
                                state = _json.loads(init_match.group(1))
                                user_data = (
                                    state.get("user")
                                    or state.get("userInfo")
                                    or state.get("currentUser")
                                    or {}
                                )
                                if user_data and isinstance(user_data, dict):
                                    sn = user_data.get("nickname") or user_data.get("name") or ""
                                    if sn:
                                        screen_name = sn
                                        avatar = user_data.get("avatar") or user_data.get("image") or ""
                                        uid = user_data.get("userId") or str(user_data.get("id", "")) or uid
                            except Exception:
                                pass
                except Exception:
                    pass

            # 若缺头像，从首页 HTML 提取第一个 avatar URL（比 nickname 更精确）
            if not avatar:
                try:
                    if not html:
                        resp = requests.get(
                            "https://www.xiaohongshu.com/",
                            headers={**headers, "Accept": "text/html,*/*"}, timeout=10,
                        )
                        html = resp.text if resp.status_code == 200 else ""
                    if html:
                        av_match = re.search(r'"avatar"\s*:\s*"(https?://[^"]+)"', html)
                        if av_match:
                            avatar = av_match.group(1)
                except Exception:
                    pass

            # 3) 判断关键会话 cookie 是否存在
            has_web_session = "web_session" in cookie
            has_a1 = "a1=" in cookie

            if screen_name:
                from utils.xhs_auth_store import write_xhs_auth
                write_xhs_auth(cookie=cookie, uid=uid, screen_name=screen_name, avatar=avatar)
                return {"valid": True, "uid": uid, "screen_name": screen_name, "avatar": avatar}

            # 4) Cookie 有效但无法获取用户信息 → 从已有 auth store 读取
            if has_web_session and has_a1:
                from utils.xhs_auth_store import read_xhs_auth
                auth = read_xhs_auth()
                if auth.get("screen_name"):
                    screen_name = auth["screen_name"]
                    uid = auth.get("uid", "") or uid
                    avatar = auth.get("avatar", "") or avatar
                    return {"valid": True, "uid": uid, "screen_name": screen_name, "avatar": avatar,
                            "message": "Cookie 有效"}
                return {"valid": True, "uid": uid or "", "screen_name": "", "avatar": "",
                        "message": "Cookie 有效，但受反爬限制无法获取用户信息（不影响使用）"}
            if has_web_session or has_a1:
                from utils.xhs_auth_store import read_xhs_auth
                auth = read_xhs_auth()
                if auth.get("screen_name"):
                    screen_name = auth["screen_name"]
                    uid = auth.get("uid", "") or uid
                    avatar = auth.get("avatar", "") or avatar
                    return {"valid": True, "uid": uid, "screen_name": screen_name, "avatar": avatar,
                            "message": "Cookie 可能有效"}
                return {"valid": True, "uid": uid or "", "screen_name": "", "avatar": "",
                        "message": "Cookie 可能有效，但无法获取用户信息（不影响使用）"}

            return {"valid": False, "message": "Cookie 无效或已过期"}
        except Exception as exc:
            return {"valid": False, "message": str(exc)}

    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, _verify)


@app.post("/api/settings/xhs-clear")
async def clear_xhs():
    """清空小红书鉴权信息（Cookie、UID、用户名）。"""
    from utils.xhs_auth_store import clear_xhs_auth
    from config import reload_settings
    clear_xhs_auth()
    reload_settings()
    return {"success": True}


# ── 微信公众号多账号管理 ────────────────────────────


@app.get("/api/wechat/accounts")
async def wechat_list_accounts():
    """列出所有微信公众号账号及登录状态。"""
    from utils.wechat_auth_store import list_accounts
    return {"accounts": list_accounts()}


@app.post("/api/wechat/accounts")
async def wechat_add_account(data: Dict[str, str]):
    """添加新公众号账号。"""
    name = (data.get("name") or "").strip()
    if not name:
        raise HTTPException(400, "账号名称不能为空")
    from utils.wechat_auth_store import add_account
    account = add_account(name)
    return {"success": True, "account": account}


@app.delete("/api/wechat/accounts/{account_id}")
async def wechat_remove_account(account_id: str):
    """删除公众号账号及其所有数据。"""
    from utils.wechat_auth_store import remove_account
    if not remove_account(account_id):
        raise HTTPException(404, "账号不存在")
    return {"success": True}


@app.get("/api/wechat/accounts/{account_id}/status")
async def wechat_account_status(account_id: str):
    """检查指定账号的登录状态（验证 cookie 有效性）。"""
    from utils.wechat_auth_store import get_account, validate_login_state
    account = get_account(account_id)
    if not account:
        raise HTTPException(404, "账号不存在")
    return {"logged_in": validate_login_state(account_id), "name": account.get("name", "")}


@app.get("/api/wechat/accounts/{account_id}/login")
async def wechat_account_login(account_id: str):
    """启动浏览器登录指定公众号。通过 SSE 流式返回登录状态。"""
    from utils.wechat_auth_store import get_account, get_account_paths
    account = get_account(account_id)
    if not account:
        raise HTTPException(404, "账号不存在")

    import json as _json
    from queue import Empty, Queue
    from concurrent.futures import ThreadPoolExecutor

    msg_queue: Queue = Queue()

    profile_dir, state_path = get_account_paths(account_id)

    def run_login():
        from services.wechat import _ensure_login, _looks_logged_in, logger
        from playwright.sync_api import sync_playwright

        def _emit(msg: str) -> None:
            msg_queue.put(("progress", msg))

        profile_dir.mkdir(parents=True, exist_ok=True)
        state_path.parent.mkdir(parents=True, exist_ok=True)
        try:
            with sync_playwright() as p:
                context = p.chromium.launch_persistent_context(
                    user_data_dir=str(profile_dir),
                    headless=False,
                )
                page = context.new_page()
                page.goto("https://mp.weixin.qq.com/", wait_until="domcontentloaded")
                _emit("正在登录微信公众号...")

                if _looks_logged_in(page):
                    _emit("检测到已登录，无需扫码")
                else:
                    _emit("请在弹出的浏览器窗口中扫码登录")
                    _ensure_login(page, state_path=state_path,
                                  on_scan_needed=lambda: _emit("等待扫码中，请在浏览器窗口完成扫码"))
                    _emit("登录成功")

                context.storage_state(path=str(state_path))
                from utils.wechat_auth_store import update_account
                update_account(account_id, last_used=datetime.now().isoformat())
                context.close()

            msg_queue.put(("done", "登录完成"))
        except Exception as e:
            msg_queue.put(("error", str(e)))

    ThreadPoolExecutor(1).submit(run_login)

    def event_stream():
        while True:
            try:
                msg = msg_queue.get(timeout=0.5)
            except Empty:
                yield ": keepalive\n\n"
                continue

            if msg[0] == "progress":
                yield f"data: {_json.dumps({'type': 'progress', 'message': msg[1]}, ensure_ascii=False)}\n\n"
            elif msg[0] == "done":
                yield f"data: {_json.dumps({'type': 'done', 'message': msg[1]}, ensure_ascii=False)}\n\n"
                break
            elif msg[0] == "error":
                yield f"data: {_json.dumps({'type': 'error', 'message': msg[1]}, ensure_ascii=False)}\n\n"
                break

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@app.post("/api/wechat/accounts/{account_id}/logout")
async def wechat_account_logout(account_id: str):
    """清除指定公众号的登录态（删除 state.json 并清除浏览器 cookie）。"""
    from utils.wechat_auth_store import get_account, get_account_paths
    account = get_account(account_id)
    if not account:
        raise HTTPException(404, "账号不存在")
    profile_dir, state_path = get_account_paths(account_id)

    def _clear_browser_state():
        """启动浏览器清除该账号的 cookie。"""
        if not profile_dir.exists():
            return
        try:
            from playwright.sync_api import sync_playwright
            with sync_playwright() as p:
                context = p.chromium.launch_persistent_context(
                    user_data_dir=str(profile_dir),
                    headless=True,
                )
                context.clear_cookies()
                context.close()
        except Exception:
            pass  # 静默失败，至少删除 state.json

    if profile_dir.exists():
        await asyncio.to_thread(_clear_browser_state)

    if state_path.exists():
        state_path.unlink()
    return {"success": True}


@app.post("/api/wechat/accounts/{account_id}/default")
async def wechat_set_default_account(account_id: str):
    """设置指定账号为默认公众号。"""
    from utils.wechat_auth_store import set_default_account
    if not set_default_account(account_id):
        raise HTTPException(404, "账号不存在")
    return {"success": True}


@app.get("/api/platforms")
async def get_platforms():
    """返回所有已注册平台的元数据，供前端动态构建平台选择器。"""
    platforms = list_platforms()
    from services.platforms import get_default_platform

    return {
        "platforms": {pid: {
            "id": meta.id,
            "name": meta.name,
            "auth_fields": meta.auth_fields,
            "fetch_modes": meta.fetch_modes,
            "default_fetch_mode": meta.default_fetch_mode,
            "search_params_description": meta.search_params_description,
        } for pid, meta in platforms.items()},
        "default": get_default_platform(),
    }


# ── Dashboard API ──────────────────────────────────────


@app.get("/api/dashboard/health")
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
        "xhs_cookie": bool(settings.xhs_cookie),
        "xhs_uid_or_tags": bool(settings.xhs_uid or settings.xhs_search_tags),
        "ai_api_key": bool(api_key),
        "ai_base_url": bool(base_url),
    }


@app.get("/api/dashboard/stats")
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


@app.get("/api/dashboard/runs")
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
        except Exception:
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
        # 从 payload 生成标题描述
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
        })
    return results


@app.get("/api/dashboard/operations")
async def recent_operations(page: int = Query(1), page_size: int = Query(10)):
    items, total = app_state.get_operations(page=page, page_size=page_size)
    return {"items": items, "total": total, "page": page, "page_size": page_size}


@app.post("/api/dashboard/operations/delete")
async def delete_operations(data: Dict[str, Any]):
    """删除操作记录。data = {ids: ["uuid1", "uuid2"]} 或 {clear: true}。"""
    if data.get("clear"):
        app_state.clear_all_operations()
        return {"success": True, "deleted": -1}
    op_ids = data.get("ids", [])
    deleted = app_state.delete_operations_by_id(op_ids)
    return {"success": True, "deleted": deleted}


# ── Discovery API ──────────────────────────────────────


@app.get("/api/discovery")
async def get_discovery():
    """返回当前搜索结果。"""
    return {"posts": app_state.get_discovery_results()}


@app.post("/api/discovery/search")
async def discovery_search(req: SearchRequest):
    try:
        platform_svc = get_platform(req.platform)
        if not platform_svc:
            raise HTTPException(400, f"未知平台: {req.platform}")

        # 临时更新平台专属配置
        settings.weibo_celebrities = tuple(req.celebrities)
        settings.weibo_search_tags = tuple(req.search_tags)
        settings.weibo_super_topics = tuple(req.super_topics)
        if req.platform == "xhs":
            settings.xhs_search_tags = tuple(req.search_tags)

        posts = platform_svc.fetch_posts(
            mode=req.mode,
            max_pages=req.max_pages,
        )
        posts = posts[: req.post_limit]
        app_state.set_discovery_results(posts)
        total_images = sum(len(p.get("images", [])) for p in posts)
        app_state.add_operation("搜索", f"平台={req.platform} 模式={req.mode}，发现 {len(posts)} 篇帖子共 {total_images} 张图")
        return {
            "success": True,
            "posts": posts,
            "total_posts": len(posts),
            "total_images": total_images,
        }
    except HTTPException:
        raise
    except Exception as err:
        raise HTTPException(500, f"搜索失败: {err}")


@app.get("/api/discovery/search-stream")
async def discovery_search_stream(
    platform: str = Query("weibo"),
    mode: str = Query("celebrities"),
    celebrities: str = Query(""),
    search_tags: str = Query(""),
    super_topics: str = Query(""),
    max_pages: int = Query(1),
    post_limit: int = Query(5),
    page: int = Query(1),
):
    """SSE 流式搜索，逐条推送进度消息。

    page 参数支持分页：page=1 获取第一页，page=2 获取第二页并追加。
    """
    import asyncio
    import json as _json
    from queue import Empty, Queue
    from concurrent.futures import ThreadPoolExecutor

    platform_svc = get_platform(platform)
    if not platform_svc:
        def err_stream():
            yield f"data: {_json.dumps({'type': 'error', 'message': f'未知平台: {platform}'}, ensure_ascii=False)}\n\n"
        return StreamingResponse(err_stream(), media_type="text/event-stream")

    celeb_list = [s.strip() for s in celebrities.split(",") if s.strip()]
    tag_list = [s.strip() for s in search_tags.split(",") if s.strip()]
    topic_list = [s.strip() for s in super_topics.split(",") if s.strip()]

    msg_queue: Queue = Queue()

    def progress_callback(msg: str):
        msg_queue.put(("progress", msg))

    def run_search():
        try:
            progress_callback(f"开始 {platform_svc.meta.name} 搜索（第{page}页）…")
            new_posts = platform_svc.fetch_posts(
                mode=mode,
                max_pages=1,
                specific_page=page,
                celebrities=celeb_list,
                search_tags=tag_list,
                super_topics=topic_list,
                progress_callback=progress_callback,
            )
            new_posts = new_posts[:post_limit]

            if page > 1:
                # 追加到已有结果，按 id 去重
                existing = app_state.get_discovery_results()
                seen = {str(p.get("id", "")) for p in existing if p.get("id")}
                for p in new_posts:
                    pid = str(p.get("id", ""))
                    if pid and pid in seen:
                        continue
                    if pid:
                        seen.add(pid)
                    existing.append(p)
                posts = existing
            else:
                posts = new_posts

            app_state.set_discovery_results(posts)
            total_images = sum(len(p.get("images", [])) for p in posts)
            app_state.add_operation("搜索", f"平台={platform} 模式={mode}，发现 {len(posts)} 篇帖子共 {total_images} 张图（第{page}页）")
            progress_callback(f"搜索完成！共 {len(posts)} 条帖子，{total_images} 张图片")

            safe_posts = []
            for p in posts:
                sp = dict(p)
                sp["images"] = sp.get("images", [])[:4]
                safe_posts.append(sp)

            msg_queue.put(("done", safe_posts, len(posts), total_images, _json.dumps([p.get("id") for p in posts])))
        except HTTPException:
            raise
        except Exception as err:
            msg_queue.put(("error", str(err)))

    ThreadPoolExecutor(1).submit(run_search)

    def event_stream():
        while True:
            try:
                msg = msg_queue.get(timeout=0.5)
            except Empty:
                yield ": keepalive\n\n"
                continue

            if msg[0] == "progress":
                yield f"data: {_json.dumps({'type': 'progress', 'message': msg[1]}, ensure_ascii=False)}\n\n"
            elif msg[0] == "done":
                _, safe_posts, total, total_imgs, _ = msg
                yield f"data: {_json.dumps({'type': 'done', 'total_posts': total, 'total_images': total_imgs}, ensure_ascii=False)}\n\n"
                break
            elif msg[0] == "error":
                yield f"data: {_json.dumps({'type': 'error', 'message': msg[1]}, ensure_ascii=False)}\n\n"
                break

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@app.post("/api/discovery/download")
async def discovery_download(req: Optional[DownloadRequest] = None):
    posts = app_state.get_discovery_results()
    if not posts:
        raise HTTPException(400, "没有搜索结果，请先搜索")

    # 筛选要下载的帖子索引
    indices = req.post_indices if req and req.post_indices else list(range(len(posts)))
    valid_indices = [i for i in indices if 0 <= i < len(posts)]

    results = []
    for i in valid_indices:
        post = posts[i]
        celebrity = post.get("celebrity", "未命名")
        scene = post.get("scene", "日常")
        post_text = (post.get("text") or "").strip()
        slug = post_text[:12] if post_text else str(post.get("id") or "")[:12]
        print(f"[下载] text={post_text[:20]!r} post_id={post.get('id')} -> slug={slug}", flush=True)
        try:
            images, dropped = download_images(
                post["images"],
                celebrity=celebrity,
                scene=scene,
                post_slug=slug,
                prefix=slug[:8],
                overwrite=False,
            )
            post["local_images"] = [_img_rel(p) for p in images]
            post["dropped_count"] = dropped
            results.append({
                "celebrity": celebrity,
                "scene": scene,
                "downloaded": len(images),
                "dropped": dropped,
            })
        except Exception as err:
            post["local_images"] = []
            post["dropped_count"] = 0
            results.append({
                "celebrity": celebrity,
                "scene": scene,
                "error": str(err),
            })

    app_state.set_discovery_results(posts)
    all_images = [img for p in posts for img in p.get("local_images", [])]
    app_state.add_operation("下载图片", f"共下载 {len(all_images)} 张图片")
    return {
        "success": True,
        "posts": posts,
        "results": results,
        "total_downloaded": len(all_images),
    }


@app.delete("/api/discovery/post/{index}")
async def remove_discovery_post(index: int):
    posts = app_state.get_discovery_results()
    if index < 0 or index >= len(posts):
        raise HTTPException(404, "帖子不存在")
    removed = posts.pop(index)
    app_state.set_discovery_results(posts)
    return {"success": True, "removed": removed.get("celebrity", ""), "remaining": len(posts)}


@app.post("/api/discovery/score")
async def discovery_score(req: ScoreRequest):
    paths = req.image_paths
    if not paths:
        # 自动从 discovery results 收集
        posts = app_state.get_discovery_results()
        paths = [str(DOWNLOAD_DIR / img) for p in posts for img in p.get("local_images", [])]
    else:
        paths = [str(DOWNLOAD_DIR / img) if not Path(img).is_absolute() else img for img in paths]
    if not paths:
        raise HTTPException(400, "没有可评分的图片")

    scores = score_images_batch(paths, use_vision=req.use_vision)
    # 评分结果 key 转回相对路径后返回前端
    scores_rel = {_img_rel(k): v for k, v in scores.items()}
    app_state.set_image_scores(scores_rel)

    vision_count = sum(1 for v in scores.values() if v["method"] == "vision")
    heuristic_count = sum(1 for v in scores.values() if v["method"] == "heuristic")

    return {
        "success": True,
        "scores": scores_rel,
        "vision_count": vision_count,
        "heuristic_count": heuristic_count,
    }


@app.get("/api/discovery/trending-celebrities")
async def get_trending_celebrities():
    """AI 推荐当前热门女明星，用于一键搜索。"""
    if not settings.ai_api_key:
        raise HTTPException(400, "当前未配置大模型 API Key，请先在设置页配置")
    try:
        import asyncio
        loop = asyncio.get_event_loop()
        celebs = await loop.run_in_executor(None, recommend_celebrities)
        return {"celebrities": celebs}
    except Exception as err:
        # 兜底返回固定列表
        fallback = ["迪丽热巴", "杨幂", "赵丽颖", "刘亦菲", "杨紫", "白鹿", "虞书欣", "赵露思", "关晓彤", "周也"]
        return {"celebrities": fallback}


# ── Selection API ──────────────────────────────────────


@app.get("/api/selection")
async def get_selection():
    return {
        "selected": app_state.get_selected_images(),
        "scores": app_state.get_image_scores(),
    }


@app.post("/api/selection/add")
async def add_selection(data: Dict[str, str]):
    path = data.get("path", "")
    if path:
        app_state.add_selected_image(path)
    return {"selected": app_state.get_selected_images()}


@app.post("/api/selection/remove")
async def remove_selection(data: Dict[str, str]):
    path = data.get("path", "")
    if path:
        app_state.remove_selected_image(path)
    return {"selected": app_state.get_selected_images()}


@app.post("/api/selection/clear")
async def clear_selection():
    app_state.clear_selected_images()
    return {"selected": []}


# ── Publish Queue API ──────────────────────────────────


@app.get("/api/queue")
async def get_queue():
    return {"queue": app_state.get_queue()}


@app.post("/api/queue")
async def add_to_queue(req: QueueAddRequest):
    item = {
        "title": req.title,
        "desc": req.desc,
        "images": list(req.images),
        "cover": req.cover or (req.images[0] if req.images else ""),
    }
    app_state.add_to_queue(item)
    return {"success": True, "queue": app_state.get_queue()}


@app.put("/api/queue/{item_id}")
async def update_queue_item(item_id: str, req: QueueUpdateRequest):
    updates = {}
    if req.title is not None:
        updates["title"] = strip_emoji(req.title)
    if req.desc is not None:
        updates["desc"] = req.desc
    if req.images is not None:
        updates["images"] = req.images
    if req.cover is not None:
        updates["cover"] = req.cover
    if req.account_id is not None:
        updates["account_id"] = req.account_id
    if req.status is not None:
        updates["status"] = req.status
    if app_state.update_queue_item_by_id(item_id, updates):
        return {"success": True, "queue": app_state.get_queue()}
    raise HTTPException(404, "队列项不存在")


@app.delete("/api/queue/{item_id}")
async def remove_from_queue(item_id: str):
    if app_state.remove_from_queue_by_id(item_id):
        return {"success": True, "queue": app_state.get_queue()}
    raise HTTPException(404, "队列项不存在")


@app.post("/api/queue/{item_id}/generate")
async def generate_queue_content(item_id: str):
    item = app_state.get_queue_item_by_id(item_id)
    if not item:
        raise HTTPException(404, "队列项不存在")
    celebrity = item.get("celebrity", "")
    original_title = item.get("title", "")
    original_desc = item.get("desc", "")

    if not settings.ai_api_key:
        return {"success": False, "title": original_title, "desc": original_desc, "message": "暂未配置APIKey"}

    # 以当前标题作为 AI 上下文（去掉已拼接的明星名前缀，避免 AI 重复生成）
    context = original_title or original_desc
    if celebrity and context.startswith(f"{celebrity} | "):
        stripped = context[len(f"{celebrity} | "):]
        if len(stripped.strip()) >= 4:
            context = stripped
        elif original_desc and len(original_desc.strip()) >= 4:
            # 去掉前缀后内容太少，用正文作为上下文
            context = original_desc
        else:
            # 既没有有效标题也没有正文，直接使用默认标题，不调用 AI
            new_title = f"{celebrity} | 今日分享" if celebrity else "今日分享"
            app_state.update_queue_item_by_id(item_id, {"title": new_title})
            app_state.add_operation("AI 润色", f"为「{celebrity or '未知'}」生成默认标题")
            return {"success": True, "title": new_title, "desc": "", "message": ""}

    if not context:
        new_title = f"{celebrity} | 今日分享" if celebrity else "今日分享"
        app_state.update_queue_item_by_id(item_id, {"title": new_title})
        app_state.add_operation("AI 润色", f"为「{celebrity or '未知'}」生成默认标题")
        return {"success": True, "title": new_title, "desc": "", "message": ""}

    ai_title, _ = generate_content(context)
    ai_title = strip_emoji(ai_title)

    # AI 结果过短（纯数字等无意义内容）视为失败
    if ai_title and (len(ai_title.strip()) < 2 or (ai_title.strip().isdigit() and len(ai_title.strip()) < 4)):
        ai_title = ""

    if not ai_title or ai_title == "今日美图分享":
        msg = "AI 润色失败，已使用原标题"
        app_state.add_operation("AI 润色", f"为「{celebrity or '未知'}」生成标题失败")
        return {"success": False, "title": original_title, "desc": original_desc, "message": msg}

    # 当传给 AI 的上下文包含明星名时，AI 生成的结果可能也含明星名，去掉以免拼接后重复
    if celebrity and ai_title.startswith(celebrity):
        ai_title = ai_title[len(celebrity):].lstrip(" |：,，")

    new_title = f"{celebrity} | {ai_title}" if celebrity else ai_title
    app_state.update_queue_item_by_id(item_id, {"title": new_title})
    app_state.add_operation("AI 润色", f"为「{celebrity or '未知'}」生成标题")
    return {"success": True, "title": new_title, "desc": "", "message": ""}


def _run_queue_publish_background(
    item_id: str,
    title: str,
    desc: str,
    abs_images: List[str],
    abs_cover: Optional[str],
    dry_run: bool,
    save_draft: bool,
    account_id: Optional[str],
    publish_session_id: str,
    raw_images: List[str],
    item_account_id: str,
    item_type: Optional[str],
):
    """后台线程执行发布操作，不阻塞 HTTP。"""
    from services.wechat import publish_article

    def _on_log(msg: str) -> None:
        app_state.add_publish_log(msg, session_id=publish_session_id)

    try:
        result = publish_article(
            title=title,
            content=desc,
            images=abs_images,
            cover=abs_cover,
            dry_run=dry_run,
            save_draft=save_draft,
            account_id=account_id,
            on_scan_needed=lambda: _on_log("请在弹出的浏览器窗口中扫码登录"),
            on_confirm_needed=lambda t: True,
            on_log=_on_log,
        )
    except Exception as err:
        msg = _friendly_error_message(err)
        _on_log(msg)
        app_state.finish_publish()
        fail_updates = {"status": "failed", "error": msg, "publish_logs": app_state.get_publish_logs(session_id=publish_session_id)}
        app_state.update_queue_item_by_id(item_id, fail_updates)
        return

    app_state.finish_publish()
    updates = {"publish_logs": app_state.get_publish_logs(session_id=publish_session_id)}
    if result.get("success"):
        action = "保存草稿" if save_draft else "发布"
        app_state.add_operation(action, f"「{title}」")
        updates["status"] = "saved_to_wechat" if save_draft else "published"
        updates["account_id"] = account_id or item_account_id
        updates["error"] = ""
        for img in raw_images:
            app_state.update_materials_meta(img, {"used_count": (app_state.get_materials_meta(img) or {}).get("used_count", 0) + 1})
    else:
        updates["status"] = "failed"
        updates["error"] = _friendly_error_message(result.get("message", "发布失败"))
    app_state.update_queue_item_by_id(item_id, updates)


@app.post("/api/queue/{item_id}/publish")
async def publish_from_queue(item_id: str, req: PublishRequest):
    item = app_state.get_queue_item_by_id(item_id)
    if not item:
        raise HTTPException(404, "队列项不存在")
    title = strip_emoji(item.get("title", ""))
    desc = item.get("desc", "")
    images = item.get("images", [])
    cover = item.get("cover", "")
    if not images and item.get("type") != "article":
        _raise_friendly(400, "没有图片")
    if not title:
        _raise_friendly(400, "标题为空")

    publish_session_id = item.get("id", "")
    app_state.clear_publish_logs(session_id=publish_session_id)
    if publish_session_id:
        app_state.update_queue_item_by_id(publish_session_id, {"publish_logs": []})

    # Playwright 需要绝对路径，相对路径转为绝对
    abs_images = [str(DOWNLOAD_DIR / img) if not Path(img).is_absolute() else img for img in images]
    abs_cover: Optional[str] = None
    if cover:
        cover_abs = str(DOWNLOAD_DIR / cover) if not Path(cover).is_absolute() else cover
        if Path(cover_abs).exists():
            abs_cover = cover_abs

    # 纯图片帖：封面放在第一张
    if item.get("type") != "article" and abs_cover:
        abs_images = [abs_cover] + [img for img in abs_images if img != abs_cover]

    # 后台线程执行发布，HTTP 立即返回
    threading.Thread(
        target=_run_queue_publish_background,
        args=(
            item_id, title, desc, abs_images, abs_cover,
            req.dry_run, req.save_draft, req.account_id,
            publish_session_id, list(images),
            item.get("account_id", ""), item.get("type"),
        ),
        daemon=True,
    ).start()

    return {"success": True, "started": True, "message": "发布任务已启动"}


@app.get("/api/publish-logs")
async def get_publish_logs(after: int = 0, session_id: str = ""):
    """获取发布日志，支持增量拉取和 session 隔离。

    after: 已获取的日志条数。
    session_id: 队列项 id，用于隔离并发发布的日志。空字符串则使用全局日志（旧版兼容）。
    """
    logs = app_state.get_publish_logs(session_id=session_id)
    return {
        "logs": logs[after:],
        "total": len(logs),
        "active": app_state.publish_active,
    }


@app.post("/api/queue/enqueue-selected")
async def enqueue_selected(req: EnqueueRequest):
    selected = req.images if req.images else app_state.get_selected_images()
    if not selected:
        raise HTTPException(400, "没有选中的图片")

    sample_text = ""
    celebrity = ""
    for post in app_state.get_discovery_results():
        if any(img in selected for img in post.get("local_images", [])):
            sample_text = post.get("text", "")
            celebrity = post.get("celebrity", "") or post.get("screen_name", "")
            break

    truncated_text = (sample_text or "").strip()[:20]
    if celebrity and truncated_text:
        title = f"{celebrity} | {truncated_text}"
    elif celebrity:
        title = celebrity
    elif truncated_text:
        title = truncated_text
    else:
        title = "美图分享"
    desc = ""
    cover = select_cover(selected)

    # 封面放在图片列表第一张
    selected_list = list(selected)
    if cover in selected_list and selected_list[0] != cover:
        selected_list = [cover] + [img for img in selected_list if img != cover]

    app_state.add_to_queue({
        "title": title,
        "desc": desc,
        "images": selected_list,
        "cover": cover,
        "celebrity": celebrity,
    })
    app_state.clear_selected_images()
    app_state.add_operation("加入队列", f"「{title}」共 {len(selected)} 张图")
    return {"success": True, "title": title, "desc": desc}


# ── 图片服务 ──────────────────────────────────────────


@app.get("/images/thumbnail/{path:path}")
async def serve_thumbnail(path: str, size: int = Query(320, alias="size")):
    """返回图片缩略图，缩小尺寸并压缩以加速预览加载。"""
    file_path = DOWNLOAD_DIR / path
    if not file_path.exists():
        raise HTTPException(404, "图片不存在")
    try:
        from PIL import Image as PILImage
        import io
        img = PILImage.open(file_path)
        img.thumbnail((size, size), PILImage.LANCZOS)
        buf = io.BytesIO()
        if img.mode in ("RGBA", "P"):
            img = img.convert("RGB")
        img.save(buf, "JPEG", quality=70)
        buf.seek(0)
        from fastapi.responses import Response
        return Response(content=buf.read(), media_type="image/jpeg")
    except Exception:
        return FileResponse(str(file_path))


@app.get("/images/{path:path}")
async def serve_image(path: str):
    file_path = DOWNLOAD_DIR / path
    if not file_path.exists():
        # 也支持绝对路径（流水线等场景存入的是绝对路径）
        abs_path = Path(path)
        if abs_path.exists() and str(abs_path).startswith(str(DATA_DIR)):
            file_path = abs_path
        else:
            raise HTTPException(404, "图片不存在")
    return FileResponse(str(file_path))


_PROXY_CACHE: dict[str, tuple[bytes, str]] = {}  # url → (content, content_type)


def _proxy_cache_get(url: str) -> tuple[bytes | None, str | None]:
    """从内存缓存读取代理图片。"""
    return _PROXY_CACHE.get(url, (None, None))


def _proxy_cache_set(url: str, content: bytes, content_type: str) -> None:
    """保存代理图片到内存缓存（不写磁盘）。"""
    _PROXY_CACHE[url] = (content, content_type)


def _resize_image(content: bytes, size: int = 320) -> bytes:
    """将图片缩放为缩略图，降低传输量。"""
    from PIL import Image as PILImage
    import io
    try:
        img = PILImage.open(io.BytesIO(content))
        img.thumbnail((size, size), PILImage.LANCZOS)
        buf = io.BytesIO()
        if img.mode in ("RGBA", "P"):
            img = img.convert("RGB")
        img.save(buf, "JPEG", quality=70)
        buf.seek(0)
        return buf.read()
    except Exception:
        return content


_PLATFORM_REFERERS = {
    "weibo": "https://weibo.com/",
    "toutiao": "https://www.toutiao.com/",
    "xhs": "https://www.xiaohongshu.com/",
}

# 平台 → 超时（秒）
_PROXY_TIMEOUTS = {"weibo": 10, "toutiao": 10, "xhs": 10}


@app.get("/proxy")
async def proxy_image(url: str, platform: str = Query("weibo"), thumbnail: int = Query(0), size: int = Query(0)):
    """代理远程图片，解决 CORS 问题（带内存缓存）。支持 thumbnail=1（缩略图 320px）或指定 size（如 &size=1200）。"""
    from fastapi.responses import Response

    resize_to = size or (320 if thumbnail else 0)
    cache_key = f"{url}?size={resize_to}" if resize_to else url
    cached, ct = _proxy_cache_get(cache_key)
    if cached:
        return Response(content=cached, media_type=ct)

    import requests as req_lib

    referer = _PLATFORM_REFERERS.get(platform, "https://www.bing.com/")
    timeout = _PROXY_TIMEOUTS.get(platform, 20)
    req_headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        "Referer": referer,
    }
    # 小红书 CDN 图片需要带会话 Cookie + 正确 Referer 才能访问
    if platform == "xhs" or any(d in url for d in ["xhscdn.com", "xiaohongshu.com"]):
        xhs_cookie = settings.xhs_cookie
        if xhs_cookie:
            req_headers["Cookie"] = xhs_cookie
        if platform != "xhs":
            req_headers["Referer"] = "https://www.xiaohongshu.com/"
    try:
        resp = req_lib.get(url, timeout=timeout, headers=req_headers)
        resp.raise_for_status()
        content_type = resp.headers.get("Content-Type", "image/jpeg")
        content = resp.content
        if resize_to:
            content = _resize_image(content, resize_to)
        _proxy_cache_set(cache_key, content, content_type)
        return Response(content=content, media_type=content_type)
    except Exception as err:
        raise HTTPException(502, f"代理请求失败: {err}")


# ── 本地素材 API ──────────────────────────────────────


@app.get("/api/materials")
async def list_materials():
    """返回本地图片列表，按 celebrity/scene/post 三级分组。"""
    groups: Dict[str, Dict] = {}
    total_images = 0
    img_root = DOWNLOAD_DIR.expanduser().resolve()
    if not img_root.exists():
        return {"groups": [], "total_images": 0}

    for celeb_dir in sorted(img_root.iterdir()):
        if not celeb_dir.is_dir():
            continue
        if celeb_dir.name.startswith(".") or celeb_dir.name == "__covers__":
            continue
        celeb_name = celeb_dir.name
        celeb_group = {"celebrity": celeb_name, "scenes": [], "total": 0}
        for scene_dir in sorted(celeb_dir.iterdir()):
            if not scene_dir.is_dir():
                continue
            scene_name = scene_dir.name
            scene_data = {"scene": scene_name, "posts": [], "total": 0}
            for post_dir in sorted(scene_dir.iterdir()):
                if not post_dir.is_dir():
                    continue
                images = []
                for f in sorted(post_dir.iterdir()):
                    if f.suffix.lower() in (".jpg", ".jpeg", ".png", ".webp", ".gif"):
                        images.append(str(f))
                if images:
                    scene_data["posts"].append({
                        "post_id": post_dir.name,
                        "images": images,
                    })
                    scene_data["total"] += len(images)
                    total_images += len(images)
            if scene_data["posts"]:
                celeb_group["scenes"].append(scene_data)
                celeb_group["total"] += scene_data["total"]
        if celeb_group["scenes"]:
            groups[celeb_name] = celeb_group

    return {"groups": list(groups.values()), "total_images": total_images}


class MaterialsDeleteRequest(BaseModel):
    paths: List[str] = []


@app.delete("/api/materials")
async def delete_materials(req: MaterialsDeleteRequest):
    """删除指定图片文件并清理空目录。"""
    deleted = 0
    for p in req.paths:
        fp = Path(p)
        if fp.exists() and fp.is_file():
            fp.unlink()
            deleted += 1
            # 清理空目录（向上最多 3 级到 images/）
            parent = fp.parent
            img_root = DOWNLOAD_DIR.expanduser().resolve()
            for _ in range(3):
                if parent == img_root or not parent.exists():
                    break
                try:
                    next(parent.iterdir())
                    break  # 目录非空，停止
                except StopIteration:
                    parent.rmdir()
                    parent = parent.parent
    return {"success": True, "deleted": deleted}


# ── 素材文件夹管理 API ────────────────────────────────


_IMAGE_EXT = {".jpg", ".jpeg", ".png", ".webp", ".gif"}


def _count_images(dir_path: Path) -> int:
    count = 0
    for f in dir_path.rglob("*"):
        if f.is_file() and f.suffix.lower() in _IMAGE_EXT:
            count += 1
    return count


def _build_tree_node(dir_path: Path, root: Path) -> Optional[dict]:
    name = dir_path.name
    rel = dir_path.relative_to(root)
    rel_str = str(rel.as_posix())
    children: list[dict] = []
    item_count = 0
    for child in sorted(dir_path.iterdir()):
        if child.name.startswith(".") or child.name == "__covers__":
            continue
        if child.is_dir():
            node = _build_tree_node(child, root)
            if node:
                children.append(node)
                item_count += node["item_count"]
        elif child.suffix.lower() in _IMAGE_EXT:
            item_count += 1
    return {
        "name": name,
        "path": rel_str,
        "type": "folder",
        "item_count": item_count,
        "children": children,
    }


@app.get("/api/materials/tree")
async def materials_tree():
    """返回完整文件夹树结构（用于左侧面板）。"""
    root = DOWNLOAD_DIR.expanduser().resolve()
    if not root.exists():
        return {"tree": []}
    tree: list[dict] = []
    for child in sorted(root.iterdir()):
        if not child.is_dir():
            continue
        if child.name.startswith(".") or child.name == "__covers__":
            continue
        node = _build_tree_node(child, root)
        if node:
            tree.append(node)
    return {"tree": tree}


def _build_breadcrumb(rel_path: Path) -> list[dict]:
    parts = list(rel_path.parts) if str(rel_path) != "." else []
    items = [{"name": "全部素材", "path": ""}]
    cur = ""
    for p in parts:
        cur = f"{cur}/{p}" if cur else p
        items.append({"name": p, "path": cur})
    return items


@app.get("/api/materials/browse")
async def materials_browse(path: str = Query("")):
    """浏览指定文件夹内容，返回子目录 + 文件列表 + 面包屑。"""
    root = DOWNLOAD_DIR.expanduser().resolve()
    if not root.exists():
        return {"folders": [], "files": [], "breadcrumb": _build_breadcrumb(Path("."))}

    target = (root / path).resolve() if path else root
    if not target.exists() or not target.is_dir():
        raise HTTPException(404, f"文件夹不存在: {path}")
    if not str(target).startswith(str(root)):
        raise HTTPException(403, "路径越界")

    folders: list[dict] = []
    files: list[dict] = []
    for child in sorted(target.iterdir()):
        if child.name.startswith(".") or child.name == "__covers__":
            continue
        if child.is_dir():
            folders.append({
                "name": child.name,
                "path": child.relative_to(root).as_posix(),
                "type": "folder",
                "item_count": _count_images(child),
            })
        elif child.suffix.lower() in _IMAGE_EXT:
            files.append({
                "name": child.name,
                "path": child.relative_to(root).as_posix(),
                "type": "file",
                "size": child.stat().st_size,
            })

    rel_path = target.relative_to(root)
    return {
        "folders": folders,
        "files": files,
        "breadcrumb": _build_breadcrumb(rel_path),
    }


class FolderCreateRequest(BaseModel):
    parent_path: str = ""
    name: str = "新建文件夹"


@app.post("/api/materials/folder")
async def materials_create_folder(req: FolderCreateRequest):
    """在当前目录下创建子文件夹。"""
    root = DOWNLOAD_DIR.expanduser().resolve()
    parent = (root / req.parent_path).resolve() if req.parent_path else root
    if not parent.exists() or not parent.is_dir():
        raise HTTPException(404, f"父文件夹不存在: {req.parent_path}")
    if not str(parent).startswith(str(root)):
        raise HTTPException(403, "路径越界")
    new_dir = parent / req.name
    new_dir.mkdir(parents=True, exist_ok=True)
    return {"success": True, "path": new_dir.relative_to(root).as_posix()}


class FolderRenameRequest(BaseModel):
    path: str
    new_name: str


@app.put("/api/materials/folder")
async def materials_rename_folder(req: FolderRenameRequest):
    """重命名文件夹。"""
    root = DOWNLOAD_DIR.expanduser().resolve()
    target = (root / req.path).resolve()
    if not target.exists() or not target.is_dir():
        raise HTTPException(404, f"文件夹不存在: {req.path}")
    if not str(target).startswith(str(root)):
        raise HTTPException(403, "路径越界")
    new_path = target.parent / req.new_name
    target.rename(new_path)
    return {"success": True, "path": new_path.relative_to(root).as_posix()}


class FileRenameRequest(BaseModel):
    path: str
    new_name: str


@app.put("/api/materials/file")
async def materials_rename_file(req: FileRenameRequest):
    """重命名文件。"""
    root = DOWNLOAD_DIR.expanduser().resolve()
    target = (root / req.path).resolve()
    if not target.exists() or not target.is_file():
        raise HTTPException(404, f"文件不存在: {req.path}")
    if not str(target).startswith(str(root)):
        raise HTTPException(403, "路径越界")
    new_name = req.new_name.strip()
    if not new_name:
        raise HTTPException(400, "文件名不能为空")
    # 若新名称没有后缀名则提示
    if '.' not in new_name:
        raise HTTPException(400, "文件名必须包含后缀名（如 .jpg、.png）")
    new_path = target.parent / new_name
    if new_path.exists():
        raise HTTPException(409, f"目标文件已存在: {new_name}")
    target.rename(new_path)
    return {"success": True, "path": new_path.relative_to(root).as_posix()}


@app.delete("/api/materials/folder")
async def materials_delete_folder(path: str = Query(...)):
    """递归删除文件夹及其内容。"""
    root = DOWNLOAD_DIR.expanduser().resolve()
    target = (root / path).resolve()
    if not target.exists() or not target.is_dir():
        raise HTTPException(404, f"文件夹不存在: {path}")
    if not str(target).startswith(str(root)):
        raise HTTPException(403, "路径越界")
    if target == root:
        raise HTTPException(400, "不能删除根目录")
    import shutil
    shutil.rmtree(target)
    return {"success": True}


class MoveItemsRequest(BaseModel):
    items: List[str] = []
    destination: str = ""


@app.post("/api/materials/move")
async def materials_move_items(req: MoveItemsRequest):
    """移动文件/文件夹到目标目录。"""
    root = DOWNLOAD_DIR.expanduser().resolve()
    dest = (root / req.destination).resolve() if req.destination else root
    if not dest.exists() or not dest.is_dir():
        raise HTTPException(404, f"目标文件夹不存在: {req.destination}")
    if not str(dest).startswith(str(root)):
        raise HTTPException(403, "目标路径越界")

    moved = 0
    for item in req.items:
        fp = (root / item).resolve()
        if not fp.exists():
            continue
        if not str(fp).startswith(str(root)):
            continue
        if str(fp.parent) == str(dest) or str(dest) == str(fp) or str(dest).startswith(str(fp) + '/'):
            continue  # 同目录或拖到自身/子目录无需移动
        dest_path = dest / fp.name
        if dest_path.exists():
            stem = fp.stem
            suffix = fp.suffix if fp.is_file() else ""
            dest_path = dest / f"{stem}_{datetime.now().strftime('%H%M%S')}{suffix}"
        fp.rename(dest_path)
        moved += 1
    return {"success": True, "moved": moved}


# ── 素材评分与元数据 API ───────────────────────────


@app.post("/api/materials/score")
async def materials_score(req: ScoreRequest):
    """对素材目录中的图片进行 AI / 启发式评分。"""
    paths = [str(Path(p).expanduser().resolve()) if not Path(p).is_absolute() else p for p in req.image_paths]
    if not paths:
        raise HTTPException(400, "没有可评分的图片路径")

    scores = score_images_batch(paths, use_vision=req.use_vision)
    scores_rel = {_img_rel(k): v for k, v in scores.items()}
    # 同时写入素材元数据
    for rel_path, score_info in scores_rel.items():
        app_state.update_materials_meta(rel_path, {
            "scored": True,
            "score": score_info["score"],
            "score_reason": score_info["reason"],
        })
    vision_count = sum(1 for v in scores.values() if v["method"] == "vision")
    heuristic_count = sum(1 for v in scores.values() if v["method"] == "heuristic")
    return {
        "success": True,
        "scores": scores_rel,
        "vision_count": vision_count,
        "heuristic_count": heuristic_count,
    }


@app.get("/api/materials/meta")
async def materials_get_meta(path: str = Query("")):
    """获取素材元数据，指定 path 则返回单个，否则返回全部。"""
    return {"meta": app_state.get_materials_meta(path or None)}


@app.put("/api/materials/meta")
async def materials_update_meta(req: dict):
    """更新指定素材的元数据字段。"""
    path = req.get("path", "")
    if not path:
        raise HTTPException(400, "缺少 path")
    updates = {k: v for k, v in req.items() if k != "path"}
    app_state.update_materials_meta(path, updates)
    return {"success": True, "meta": app_state.get_materials_meta(path)}


@app.get("/api/materials/tags")
async def materials_get_tags():
    """获取所有素材标签聚合。"""
    return app_state.get_all_materials_tags()


@app.get("/api/discovery/download-stream")
async def download_stream(indices: str = Query(""), filter_watermark: bool = Query(True)):
    """SSE 流式下载图片，逐图推送进度。"""
    import json as _json
    from services.downloader import _download_one
    from utils.pathsafe import sanitize_segment
    from utils.file import hash_text

    posts = app_state.get_discovery_results()
    if not posts:
        raise HTTPException(400, "没有搜索结果，请先搜索")

    idx_list = [int(i) for i in indices.split(",") if i.strip().isdigit()] if indices else list(range(len(posts)))
    valid_indices = [i for i in idx_list if 0 <= i < len(posts)]

    def event_stream():
        # 计算总图片数
        total = 0
        for i in valid_indices:
            total += len(posts[i].get("images", []))
        yield f"data: {_json.dumps({'type': 'start', 'total': total}, ensure_ascii=False)}\n\n"

        current = 0
        total_downloaded = 0
        total_dropped = 0

        for i in valid_indices:
            post = posts[i]
            celebrity = post.get("celebrity", "未命名")
            scene = post.get("scene", "日常")
            post_text = (post.get("text") or "").strip()
            slug = post_text[:12] if post_text else str(post.get("id") or "")[:12]
            images = post.get("images", [])
            if not images:
                continue

            celeb_dir = sanitize_segment(str(celebrity).strip() or "未命名艺人")
            slug_dir = sanitize_segment(str(slug).strip() or "post")
            pref = sanitize_segment(str(slug)[:8] or "img")
            base_dir = DOWNLOAD_DIR.expanduser().resolve() / celeb_dir / slug_dir
            base_dir.mkdir(parents=True, exist_ok=True)

            post_local_images: list[str] = []
            post_dropped = 0
            for idx, url in enumerate(images, start=1):
                current += 1
                ext = ".jpg"
                tail = url.rsplit("/", 1)[-1]
                if "." in tail:
                    ext_candidate = "." + tail.rsplit(".", 1)[-1].split("?")[0][:5]
                    if len(ext_candidate) <= 6 and ext_candidate.startswith("."):
                        ext = ext_candidate
                filename = base_dir / f"{pref}_{idx}_{hash_text(url)[:8]}{ext}"
                result = _download_one(url, filename, overwrite=False, filter_watermark=filter_watermark)
                if result:
                    total_downloaded += 1
                    post_local_images.append(_img_rel(result))
                else:
                    total_dropped += 1
                    post_dropped += 1
                yield f"data: {_json.dumps({'type': 'progress', 'current': current, 'total': total, 'celebrity': celebrity, 'scene': scene, 'downloaded': total_downloaded, 'dropped': total_dropped}, ensure_ascii=False)}\n\n"

            post["local_images"] = post_local_images
            post["dropped_count"] = post_dropped

        app_state.set_discovery_results(posts)
        yield f"data: {_json.dumps({'type': 'done', 'downloaded': total_downloaded, 'dropped': total_dropped}, ensure_ascii=False)}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@app.post("/api/discovery/check-watermark")
async def check_watermark(paths: List[str]):
    """检查图片是否有水印（不删除），返回有水印的路径列表。"""
    from services.watermark import watermark_metrics
    from config import settings as cfg

    watermarked = []
    for p in paths:
        full = Path(p)
        if not full.is_absolute():
            full = DOWNLOAD_DIR / p
        if not full.exists():
            continue
        try:
            corner_ratio, bottom_ratio = watermark_metrics(str(full))
            if corner_ratio >= cfg.watermark_corner_ratio or bottom_ratio >= cfg.watermark_bottom_ratio:
                watermarked.append(p)
        except Exception:
            pass
    return {"watermarked": watermarked}


# ── 文章发布 API ──────────────────────────────────────


@app.get("/api/articles")
async def list_articles(status: Optional[str] = Query(None)):
    """列出文章，可按状态筛选。"""
    return {"articles": app_state.get_articles(status)}


@app.post("/api/articles")
async def create_article(req: ArticleCreateRequest):
    """创建新文章。"""
    article = app_state.add_article(req.model_dump())
    app_state.add_operation("创建文章", f"「{article['title'] or '无标题'}」")
    return {"success": True, "article": article}


@app.get("/api/articles/inspiration")
async def get_inspiration(keyword: str = Query("", description="搜索关键词")):
    """从平台搜索热点话题作为灵感。"""
    if not keyword:
        return {"topics": []}

    topics = []
    try:
        from services.platforms import get_platform
        platform = get_platform("weibo")
        if platform:
            posts = platform.fetch_posts(
                mode="keyword",
                max_pages=1,
                search_tags=[keyword],
            )
            for p in posts[:20]:
                text = p.get("text", "").strip()
                if text and len(text) > 5:
                    topics.append({
                        "text": text[:100],
                        "source": "weibo",
                        "celebrity": p.get("celebrity", ""),
                        "screen_name": p.get("screen_name", ""),
                    })
    except Exception as e:
        logger.error("获取灵感失败: %s", e)

    if not topics:
        try:
            platform = get_platform("toutiao")
            if platform:
                posts = platform.fetch_posts(
                    mode="keyword",
                    max_pages=1,
                    search_tags=[keyword],
                )
                for p in posts[:20]:
                    text = p.get("text", "").strip()
                    if text and len(text) > 5:
                        topics.append({
                            "text": text[:100],
                            "source": "toutiao",
                            "celebrity": p.get("celebrity", ""),
                            "screen_name": p.get("screen_name", ""),
                        })
        except Exception as e:
            logger.error("头条获取灵感失败: %s", e)

    return {"topics": topics}


@app.get("/api/articles/cover-search")
async def article_cover_search(keyword: str = Query("")):
    """搜索配图：本地素材 + 网络图片。"""
    images: list[dict] = []
    seen = set()

    # 1) 本地素材搜索
    root = DOWNLOAD_DIR.expanduser().resolve()
    if root.exists():
        kw = keyword.lower()
        for path in root.rglob("*"):
            if len(images) >= 50:
                break
            if not path.is_file() or path.suffix.lower() not in _IMAGE_EXT:
                continue
            rel = path.relative_to(root).as_posix()
            if kw and kw not in rel.lower():
                continue
            images.append({
                "path": rel,
                "name": path.name,
                "source": "local",
                "celebrity": rel.split("/")[0] if "/" in rel else "",
            })
            seen.add(rel)

    # 2) 网络搜索 (Bing Images)
    if keyword:
        try:
            import re as _re
            import hashlib as _hashlib
            from urllib.parse import quote as _url_quote, unquote as _unquote
            resp = http_requests.get(
                f"https://www.bing.com/images/search?q={_url_quote(keyword)}&count=30",
                headers={
                    "User-Agent": (
                        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
                    ),
                    "Accept": "text/html,application/xhtml+xml",
                },
                timeout=15,
            )
            # Bing 的图片 URL 藏在 mediaurl 参数中（URL 编码的）
            raw_urls = _re.findall(r'mediaurl=([^&]+)', resp.text)
            for raw in raw_urls:
                if len(images) >= 60:
                    break
                # URL 解码
                decoded = _unquote(raw).replace("\\\\/", "/").replace("\\/", "/")
                # 如果是 Bing 缩略图，尝试提取原图 URL（riu 参数）
                if "/th/id/" in decoded:
                    riu_match = _re.search(r'riu=([^&]+)', decoded)
                    if riu_match:
                        original = _unquote(riu_match.group(1)).replace("\\\\/", "/").replace("\\/", "/")
                        if original.startswith("http") and original not in seen:
                            seen.add(original)
                            images.append({
                                "path": original,
                                "name": original.rsplit("/", 1)[-1][:50],
                                "source": "web",
                                "celebrity": "",
                            })
                            continue
                if decoded.startswith("http") and decoded not in seen:
                    seen.add(decoded)
                    images.append({
                        "path": decoded,
                        "name": decoded.rsplit("/", 1)[-1][:50],
                        "source": "web",
                        "celebrity": "",
                    })
        except Exception as e:
            from utils.logger import get_logger
            get_logger(__name__).warning("网络配图搜索失败: %s", e)

    return {"images": images}


class CoverDownloadRequest(BaseModel):
    url: str


@app.post("/api/articles/cover-download")
async def article_cover_download(req: CoverDownloadRequest):
    """下载网络图片到本地缓存目录，返回本地相对路径。"""
    url = req.url
    if not url:
        raise HTTPException(400, "缺少图片 URL")

    covers_dir = DOWNLOAD_DIR / "__covers__"
    covers_dir.mkdir(parents=True, exist_ok=True)

    # 优先复用代理缓存（免去重新下载）
    cached_data, cached_ct = _proxy_cache_get(url)
    if cached_data:
        from PIL import Image as PILImage
        from io import BytesIO
        from uuid import uuid4
        filename = f"{uuid4().hex}.jpg"
        local_path = covers_dir / filename
        try:
            img = PILImage.open(BytesIO(cached_data))
            if img.mode != "RGB":
                img = img.convert("RGB")
            if img.width > 1200:
                ratio = 1200 / img.width
                new_size = (1200, int(img.height * ratio))
                img = img.resize(new_size, PILImage.LANCZOS)
            img.save(local_path, "JPEG", quality=85, optimize=True)
            img.close()
        except Exception:
            # PIL 处理失败则直接保存原始内容
            local_path.write_bytes(cached_data)
        rel = local_path.relative_to(DOWNLOAD_DIR).as_posix()
        return {"success": True, "path": rel}

    # 缓存未命中，从源站下载
    try:
        resp = http_requests.get(
            url,
            headers={
                "User-Agent": (
                    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
                ),
                "Referer": "https://www.bing.com/",
            },
            timeout=30,
            stream=True,
        )
        resp.raise_for_status()

        # 验证响应为图片
        content_type = resp.headers.get("Content-Type", "")
        if not content_type.startswith("image/"):
            raise HTTPException(400, f"下载地址返回的不是图片 (Content-Type: {content_type})")

        # 检查文件大小（超过 5MB 的图片拒绝下载）
        content_length = resp.headers.get("Content-Length")
        if content_length and int(content_length) > 5 * 1024 * 1024:
            raise HTTPException(413, "图片过大（超过 5MB），请选择其他配图")

        from uuid import uuid4
        filename = f"{uuid4().hex}.jpg"
        local_path = covers_dir / filename

        # 流式写入临时文件
        temp_path = local_path.with_suffix(".tmp")
        with temp_path.open("wb") as f:
            for chunk in resp.iter_content(chunk_size=65536):
                if chunk:
                    f.write(chunk)

        # 用 PIL 压缩到合理尺寸（最大 1200px 宽，JPEG quality 85）
        try:
            from PIL import Image as PILImage
            img = PILImage.open(temp_path)
            if img.mode != "RGB":
                img = img.convert("RGB")
            if img.width > 1200:
                ratio = 1200 / img.width
                new_size = (1200, int(img.height * ratio))
                img = img.resize(new_size, PILImage.LANCZOS)
            img.save(local_path, "JPEG", quality=85, optimize=True)
            img.close()
            temp_path.unlink(missing_ok=True)
            # 同时写入代理缓存以供复用
            _proxy_cache_set(url, local_path.read_bytes(), "image/jpeg")
        except Exception:
            temp_path.rename(local_path)

        rel = local_path.relative_to(DOWNLOAD_DIR).as_posix()
        return {"success": True, "path": rel}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(502, f"下载封面图片失败: {e}")


@app.get("/api/articles/{article_id}")
async def get_article(article_id: str):
    """获取单篇文章。"""
    article = app_state.get_article(article_id)
    if not article:
        raise HTTPException(404, "文章不存在")
    return {"article": article}


@app.put("/api/articles/{article_id}")
async def update_article(article_id: str, req: ArticleUpdateRequest):
    """更新文章。"""
    updates = {k: v for k, v in req.model_dump().items() if v is not None}
    article = app_state.update_article(article_id, updates)
    if not article:
        raise HTTPException(404, "文章不存在")
    return {"success": True, "article": article}


@app.delete("/api/articles/{article_id}")
async def delete_article(article_id: str):
    """删除文章。"""
    if app_state.delete_article(article_id):
        return {"success": True}
    raise HTTPException(404, "文章不存在")


@app.post("/api/articles/{article_id}/generate")
async def generate_article_content(article_id: str, req: ArticleGenerateRequest):
    """AI 根据话题/标题生成正文。"""
    if not settings.ai_api_key:
        raise HTTPException(400, "当前未配置大模型 API Key，请先在设置页配置")

    article = app_state.get_article(article_id)
    if not article:
        raise HTTPException(404, "文章不存在")

    topic = req.topic or article.get("source", "") or article.get("title", "")
    title = req.title or article.get("title", "")
    if not topic:
        raise HTTPException(400, "缺少话题或标题")

    content = generate_article(
        topic,
        title,
        article_type=req.article_type,
        tone=req.tone,
        word_count=req.word_count,
        with_subtitles=req.with_subtitles,
        gallery_friendly=req.gallery_friendly,
        template_prompt=req.template_prompt,
    )
    app_state.update_article(article_id, {"content": content, "ai_generated": True})
    app_state.add_operation("AI 生成", f"为「{title or topic}」生成正文")
    return {"success": True, "content": content}


@app.post("/api/articles/{article_id}/polish")
async def polish_article_content(article_id: str):
    """AI 校对润色文章正文。"""
    if not settings.ai_api_key:
        raise HTTPException(400, "当前未配置大模型 API Key，请先在设置页配置")
    article = app_state.get_article(article_id)
    if not article:
        raise HTTPException(404, "文章不存在")
    content = article.get("content", "")
    if not content:
        raise HTTPException(400, "正文为空，无法校对")

    polished = polish_article(content)
    app_state.update_article(article_id, {"content": polished})
    app_state.add_operation("AI 校对", f"「{article.get('title', '') or '无标题'}」")
    return {"success": True, "content": polished}


@app.post("/api/articles/{article_id}/de-ai")
async def de_ai_article_content(article_id: str):
    """去 AI 味儿。"""
    if not settings.ai_api_key:
        raise HTTPException(400, "当前未配置大模型 API Key，请先在设置页配置")
    article = app_state.get_article(article_id)
    if not article:
        raise HTTPException(404, "文章不存在")
    content = article.get("content", "")
    if not content:
        raise HTTPException(400, "正文为空")

    rewritten = de_ai_article(content)
    app_state.update_article(article_id, {"content": rewritten})
    app_state.add_operation("去 AI 味儿", f"「{article.get('title', '') or '无标题'}」")
    return {"success": True, "content": rewritten}


@app.post("/api/articles/{article_id}/generate-title")
async def generate_article_title_endpoint(article_id: str):
    """AI 从正文生成标题。"""
    if not settings.ai_api_key:
        raise HTTPException(400, "当前未配置大模型 API Key，请先在设置页配置")
    article = app_state.get_article(article_id)
    if not article:
        raise HTTPException(404, "文章不存在")
    content = article.get("content", "")
    if not content:
        raise HTTPException(400, "正文为空")

    title = generate_article_title(content)
    if title:
        app_state.update_article(article_id, {"title": title})
        app_state.add_operation("AI 生成标题", f"「{title}」")
    return {"success": bool(title), "title": title}


@app.post("/api/articles/{article_id}/title-candidates")
async def generate_article_title_candidates_endpoint(article_id: str):
    """AI 从正文生成多个标题候选。"""
    if not settings.ai_api_key:
        raise HTTPException(400, "当前未配置大模型 API Key，请先在设置页配置")
    article = app_state.get_article(article_id)
    if not article:
        raise HTTPException(404, "文章不存在")
    content = article.get("content", "")
    if not content:
        raise HTTPException(400, "正文为空")

    candidates = generate_article_title_candidates(content)
    app_state.add_operation("AI 标题候选", f"「{article.get('title', '') or '无标题'}」")
    return {"success": bool(candidates), "candidates": candidates}


@app.post("/api/articles/{article_id}/optimize-layout")
async def optimize_article_layout(article_id: str):
    """AI 优化文章排版结构。"""
    if not settings.ai_api_key:
        raise HTTPException(400, "当前未配置大模型 API Key，请先在设置页配置")
    article = app_state.get_article(article_id)
    if not article:
        raise HTTPException(404, "文章不存在")
    content = article.get("content", "")
    if not content:
        raise HTTPException(400, "正文为空")

    optimized = optimize_layout(content)
    app_state.update_article(article_id, {"content": optimized})
    app_state.add_operation("AI 优化排版", f"「{article.get('title', '') or '无标题'}」")
    return {"success": True, "content": optimized}


@app.post("/api/articles/{article_id}/chat")
async def chat_article_content(article_id: str, req: ArticleChatRequest):
    """AI 对话式修改/生成正文。"""
    if not settings.ai_api_key:
        raise HTTPException(400, "当前未配置大模型 API Key，请先在设置页配置")
    article = app_state.get_article(article_id)
    if not article:
        raise HTTPException(404, "文章不存在")
    instruction = req.instruction.strip()
    if not instruction:
        raise HTTPException(400, "请输入指令")

    content = chat_article(article.get("content", ""), instruction)
    app_state.update_article(article_id, {"content": content, "ai_generated": True})
    app_state.add_operation("AI 对话", f"「{instruction[:30]}」")
    return {"success": True, "content": content}


@app.post("/api/articles/{article_id}/queue")
async def add_article_to_queue(article_id: str):
    """将文章加入发布队列。"""
    article = app_state.get_article(article_id)
    if not article:
        raise HTTPException(404, "文章不存在")

    from services.extensions import build_html

    content_html = build_html(article.get("content", ""), article.get("images", []))
    queue_item = {
        "title": article.get("title", ""),
        "desc": content_html,
        "images": list(article.get("images", [])),
        "cover": article.get("cover", ""),
        "celebrity": article.get("celebrity", ""),
        "type": "article",
        "article_id": article_id,
        "tags": list(article.get("tags", [])),
        "content": article.get("content", ""),
    }
    app_state.add_to_queue(queue_item)
    app_state.update_article(article_id, {"status": "queued"})
    app_state.add_operation("加入队列", f"文章「{article.get('title', '') or '无标题'}」")
    return {"success": True, "queue": app_state.get_queue()}


def _run_article_publish_background(
    article_id: str,
    title: str,
    content_html: str,
    abs_images: List[str],
    abs_cover: Optional[str],
    dry_run: bool,
    save_draft: bool,
    account_id: Optional[str],
    raw_images: List[str],
):
    """后台线程执行文章发布，不阻塞 HTTP。"""
    from services.wechat import publish_article as wechat_publish

    def _on_log(msg: str) -> None:
        app_state.add_publish_log(msg)

    try:
        result = wechat_publish(
            title=title,
            content=content_html,
            images=abs_images,
            cover=abs_cover,
            dry_run=dry_run,
            save_draft=save_draft,
            account_id=account_id,
            on_scan_needed=lambda: _on_log("请在弹出的浏览器窗口中扫码登录"),
            on_confirm_needed=lambda t: True,
            on_log=_on_log,
        )
    except Exception as err:
        app_state.finish_publish()
        msg = _friendly_error_message(err)
        _on_log(msg)
        app_state.update_article(article_id, {"status": "failed"})
        return

    app_state.finish_publish()
    if result.get("success"):
        status = "published" if not save_draft else "saved_to_wechat"
        app_state.update_article(article_id, {"status": status})
        action = "保存草稿" if save_draft else "发布"
        app_state.add_operation(action, f"文章「{title}」")
        for img in raw_images:
            app_state.update_materials_meta(img, {"used_count": (app_state.get_materials_meta(img) or {}).get("used_count", 0) + 1})
    else:
        result["message"] = _friendly_error_message(result.get("message", "发布失败"))
        app_state.update_article(article_id, {"status": "failed"})


@app.post("/api/articles/{article_id}/publish")
async def publish_article_endpoint(article_id: str, req: ArticlePublishRequest):
    """直接发布文章到公众号。"""
    article = app_state.get_article(article_id)
    if not article:
        raise HTTPException(404, "文章不存在")

    title = article.get("title", "")
    content = article.get("content", "")
    images = article.get("images", [])
    cover = article.get("cover", "")

    if not title:
        _raise_friendly(400, "标题为空")

    from services.extensions import build_html

    content_html = build_html(content, images)
    abs_images = [str(DOWNLOAD_DIR / img) if not Path(img).is_absolute() else img for img in images]
    abs_cover: Optional[str] = None
    if cover:
        cover_abs = str(DOWNLOAD_DIR / cover) if not Path(cover).is_absolute() else cover
        if Path(cover_abs).exists():
            abs_cover = cover_abs

    # 后台线程执行发布，HTTP 立即返回
    app_state.clear_publish_logs()
    threading.Thread(
        target=_run_article_publish_background,
        args=(
            article_id, title, content_html, abs_images, abs_cover,
            req.dry_run, req.save_draft, req.account_id,
            list(images),
        ),
        daemon=True,
    ).start()

    return {"success": True, "started": True, "message": "发布任务已启动"}


# ── 合规检查 API ──────────────────────────────


@app.get("/api/compliance/duplicate")
async def check_duplicate_title(title: str = Query("")):
    """检查标题是否与已有队列/文章重复（简单模糊匹配）。"""
    if not title.strip():
        return {"duplicates": []}
    t = title.strip().lower()
    duplicates = []
    # 扫描队列
    for item in app_state.get_queue():
        existing = (item.get("title") or "").strip().lower()
        if existing and (existing == t or (len(t) > 4 and (existing.startswith(t) or t.startswith(existing)))):
            duplicates.append({
                "title": item.get("title", ""),
                "status": item.get("status", "queued"),
                "type": "queue",
            })
    # 扫描文章
    for article in app_state.get_articles():
        existing = (article.get("title") or "").strip().lower()
        if existing and (existing == t or (len(t) > 4 and (existing.startswith(t) or t.startswith(existing)))):
            duplicates.append({
                "title": article.get("title", ""),
                "status": article.get("status", "draft"),
                "type": "article",
            })
    # 去重
    seen = set()
    unique = []
    for d in duplicates:
        key = d["title"]
        if key not in seen:
            seen.add(key)
            unique.append(d)
    return {"duplicates": unique[:5]}


# ── 发布效果 API ──────────────────────────────


@app.get("/api/effects/{item_id}")
async def get_effect(item_id: str):
    effect = app_state.get_publish_effects(item_id)
    return {"effect": effect or {}}


@app.post("/api/effects/{item_id}")
async def save_effect(item_id: str, req: dict):
    app_state.update_publish_effect(item_id, req)
    return {"success": True, "effect": app_state.get_publish_effects(item_id)}


@app.get("/api/effects")
async def list_effects():
    return {"effects": app_state.get_publish_effects()}


# ── 账号发布历史 API ──────────────────────────


@app.get("/api/wechat/accounts/history")
async def all_accounts_history():
    """聚合所有账号的发布历史。"""
    items = _collect_publish_history()
    return {"items": items, "total": len(items)}


@app.get("/api/wechat/accounts/{account_id}/history")
async def account_history(account_id: str):
    """指定账号的发布历史。"""
    all_items = _collect_publish_history()
    filtered = [i for i in all_items if i.get("account_id") == account_id]
    return {"items": filtered, "total": len(filtered), "account_id": account_id}


def _collect_publish_history() -> list:
    """从队列和文章中收集已发布/已保存草稿的记录。"""
    items = []
    for item in app_state.get_queue():
        status = item.get("status", "")
        if status in ("published", "saved_to_wechat", "failed"):
            items.append({
                "id": item.get("id", ""),
                "title": item.get("title", ""),
                "type": item.get("type", "image") or "image",
                "status": status,
                "publish_time": item.get("time", ""),
                "images_count": len(item.get("images", [])),
                "account_id": item.get("account_id", ""),
            })
    for article in app_state.get_articles():
        status = article.get("status", "")
        if status in ("published", "saved_to_wechat", "failed"):
            items.append({
                "id": article.get("id", ""),
                "title": article.get("title", ""),
                "type": "article",
                "status": status,
                "publish_time": article.get("updated_at", article.get("created_at", "")),
                "images_count": len(article.get("images", [])),
                "account_id": article.get("account_id", ""),
            })
    # 按时间倒序
    items.sort(key=lambda x: x.get("publish_time", ""), reverse=True)
    return items


# ── 日志与反馈 API ──────────────────────────────


@app.get("/api/logs/list")
async def list_log_files():
    """列出所有可用的日志文件（app.log, crash.log, runs/*.jsonl）。"""
    files = []

    # 主日志文件 app.log（含备份）
    for f in sorted(LOG_DIR.glob("app.log*"), reverse=True):
        files.append({
            "name": f.name,
            "size": f.stat().st_size,
            "mtime": datetime.fromtimestamp(f.stat().st_mtime).isoformat(),
        })

    # 崩溃日志
    crash = LOG_DIR / "crash.log"
    if crash.exists():
        files.append({
            "name": "crash.log",
            "size": crash.stat().st_size,
            "mtime": datetime.fromtimestamp(crash.stat().st_mtime).isoformat(),
        })

    # 运行审计日志（最近 10 个）
    runs_dir = LOG_DIR / "runs"
    if runs_dir.exists():
        for f in sorted(runs_dir.glob("*.jsonl"), reverse=True)[:10]:
            files.append({
                "name": f"runs/{f.name}",
                "size": f.stat().st_size,
                "mtime": datetime.fromtimestamp(f.stat().st_mtime).isoformat(),
            })

    return {"files": files}


@app.get("/api/logs/content")
async def get_log_content(file: str = Query(...), max_lines: int = Query(500)):
    """读取指定日志文件内容，默认最多 500 行。

    安全限制：文件路径必须位于 LOG_DIR 下，防止目录穿越。
    """
    # 安全检查：防止目录穿越
    safe_path = (LOG_DIR / file).resolve()
    if not str(safe_path).startswith(str(LOG_DIR.resolve())):
        raise HTTPException(403, "不允许访问该路径")
    if not safe_path.exists() or not safe_path.is_file():
        raise HTTPException(404, "日志文件不存在")
    if safe_path.stat().st_size > 50 * 1024 * 1024:
        raise HTTPException(413, "日志文件过大（超过 50MB）")

    lines = safe_path.read_text(encoding="utf-8").splitlines()
    total = len(lines)
    if max_lines > 0 and total > max_lines:
        lines = lines[-max_lines:]
    return {"name": file, "lines": lines, "total": total}


@app.post("/api/logs/clipboard")
async def copy_log_to_clipboard(req: dict):
    """将日志内容复制到系统剪贴板。

    前端读取日志内容后，POST 到本接口，由后端写入系统剪贴板，
    避免 PyWebView 前端无法访问剪贴板的问题。
    """
    text = (req.get("text") or "").strip()
    if not text:
        raise HTTPException(400, "内容为空")

    try:
        _copy_to_clipboard(text)
        return {"success": True}
    except Exception as e:
        raise HTTPException(500, f"复制到系统剪贴板失败: {e}")


@app.post("/api/logs/save-to-downloads")
async def save_log_to_downloads(req: dict):
    """将日志文件保存到系统下载目录。"""
    file = (req.get("file") or "").strip()
    if not file:
        raise HTTPException(400, "缺少文件名")

    safe_path = (LOG_DIR / file).resolve()
    if not str(safe_path).startswith(str(LOG_DIR.resolve())):
        raise HTTPException(403, "不允许访问该路径")
    if not safe_path.exists() or not safe_path.is_file():
        raise HTTPException(404, "日志文件不存在")

    downloads = Path.home() / "Downloads"
    downloads.mkdir(parents=True, exist_ok=True)

    dest = downloads / safe_path.name
    # 同名文件自动添加序号
    counter = 1
    while dest.exists():
        stem = safe_path.stem
        suffix = safe_path.suffix
        dest = downloads / f"{stem}_{counter}{suffix}"
        counter += 1

    import shutil
    shutil.copy2(str(safe_path), str(dest))
    return {"success": True, "path": str(dest)}


def _copy_to_clipboard(text: str) -> None:
    """跨平台写入系统剪贴板。"""
    import subprocess
    try:
        if sys.platform == "darwin":
            proc = subprocess.Popen(["pbcopy"], stdin=subprocess.PIPE)
            proc.communicate(input=text.encode("utf-8"))
        elif sys.platform == "win32":
            proc = subprocess.Popen(["clip"], stdin=subprocess.PIPE)
            proc.communicate(input=text.encode("utf-8"))
        else:
            # Linux: 尝试 xclip 或 xsel
            try:
                proc = subprocess.Popen(["xclip", "-selection", "clipboard"], stdin=subprocess.PIPE)
                proc.communicate(input=text.encode("utf-8"))
            except FileNotFoundError:
                proc = subprocess.Popen(["xsel", "--clipboard", "--input"], stdin=subprocess.PIPE)
                proc.communicate(input=text.encode("utf-8"))
    except Exception as e:
        raise RuntimeError(f"剪贴板写入失败: {e}")


# ── Pipeline Agent 端点 ──────────────────────────────


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


@app.post("/api/pipeline/run")
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

    from services.pipeline_agent import PipelineAgent, PipelineConfig

    audit_path = create_run_log_path(run_id)

    def _on_event(event_type: str, step: str, data: dict) -> None:
        """同时推送到 SSE 队列和写入审计日志。"""
        msg_queue.put((event_type, step, data))
        # 记录关键事件到审计日志
        if event_type in ("step_start", "step_complete", "step_error", "agent_decision", "completed", "cancelled"):
            audit_entry = {"step": step}
            for key in ("reasoning", "decision", "error", "message", "result", "name"):
                if key in data:
                    val = data[key]
                    # 精简 result 避免日志过大
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

            # 记录完成状态
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

            # 添加到操作记录
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


@app.post("/api/pipeline/confirm/{run_id}")
async def pipeline_confirm(run_id: str):
    """用户确认发布，通过 checkpoint 继续执行。"""
    evt = pipeline_confirm_events.get(run_id)
    if not evt:
        raise HTTPException(404, "流水线不存在或已处理")
    evt.set()
    return {"success": True}


@app.post("/api/pipeline/cancel/{run_id}")
async def pipeline_cancel(run_id: str):
    """取消正在运行的流水线。"""
    evt = pipeline_cancel_events.get(run_id)
    if not evt:
        raise HTTPException(404, "流水线不存在或已结束")
    evt.set()
    return {"success": True}


@app.post("/api/pipeline/decide/{run_id}")
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


@app.get("/api/pipeline/runs/{run_id}")
async def pipeline_run_detail(run_id: str):
    """读取指定流水线运行的审计事件。"""
    from utils.audit import create_run_log_path
    path = create_run_log_path(run_id)
    if not path.exists():
        raise HTTPException(404, "运行记录不存在")
    try:
        lines = path.read_text(encoding="utf-8").strip().splitlines()
        events = [json.loads(line) for line in lines if line.strip()]
    except Exception:
        raise HTTPException(500, "读取运行记录失败")
    return {"run_id": run_id, "events": events}


# ── SPA Catch-All（放在所有路由最后）─────────────────


@app.get("/{full_path:path}", response_class=HTMLResponse, include_in_schema=False)
async def spa_fallback(full_path: str):
    """React SPA 路由回退：所有非 API 路径返回 index.html。"""
    html_path = STATIC_DIR / "index.html"
    return HTMLResponse(html_path.read_text(encoding="utf-8"))
