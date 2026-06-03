"""Settings API 路由。"""

from __future__ import annotations

import asyncio
import json
import re
import sys
from pathlib import Path
from typing import Any, Dict

import requests as http_requests
from fastapi import APIRouter, HTTPException, Query

# 确保项目根目录在 sys.path 中
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from config import DOWNLOAD_DIR, settings
from desktop.api_helpers import (
    _req_logger,
    get_provider_key,
    get_wechat_accounts_list,
    mask_key,
)

router = APIRouter(tags=["settings"])


@router.get("/api/settings")
async def get_settings():
    from utils.settings_store import read_settings as read_json_settings
    from utils.toutiao_auth_store import read_toutiao_auth
    from utils.weibo_auth_store import read_weibo_auth

    store = read_json_settings()
    cfg = store

    provider = cfg.get("AI_PROVIDER", "mimo").lower()
    current_key = get_provider_key(cfg, provider)

    all_keys = {}
    for prov in ("mimo", "deepseek", "glm", "openai", "minimax"):
        k = get_provider_key(cfg, prov)
        if k:
            all_keys[prov] = mask_key(k)

    auth = read_weibo_auth()
    weibo_cookie = auth.get("cookie", "") or cfg.get("WEIBO_COOKIE", "")
    weibo_uid = auth.get("uid", "") or cfg.get("WEIBO_UID", "")
    weibo_screen_name = auth.get("screen_name", "")
    weibo_avatar = auth.get("avatar", "")

    toutiao_auth = read_toutiao_auth()
    toutiao_cookie = toutiao_auth.get("cookie", "") or cfg.get("TOUTIAO_COOKIE", "")
    toutiao_uid = toutiao_auth.get("uid", "") or cfg.get("TOUTIAO_USER_ID", "")
    toutiao_screen_name = toutiao_auth.get("screen_name", "")
    toutiao_avatar = toutiao_auth.get("avatar", "")

    return {
        "platform": cfg.get("PLATFORM", "weibo"),
        "ai_provider": provider,
        "ai_model": cfg.get("AI_MODEL", "mimo-v2.5-pro"),
        "ai_base_url": cfg.get("AI_BASE_URL", ""),
        "ai_api_key_set": bool(current_key),
        "ai_api_key_masked": mask_key(current_key) if current_key else "",
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
        "toutiao_cookie_set": bool(toutiao_cookie),
        "toutiao_cookie": toutiao_cookie,
        "toutiao_uid": toutiao_uid,
        "toutiao_user_id": cfg.get("TOUTIAO_USER_ID", ""),
        "toutiao_screen_name": toutiao_screen_name,
        "toutiao_avatar": toutiao_avatar,
        "toutiao_fetch_mode": cfg.get("TOUTIAO_FETCH_MODE", "feed"),
        "toutiao_search_tags": cfg.get("TOUTIAO_SEARCH_TAGS", "时尚,明星,穿搭"),
        "post_limit": int(cfg.get("POST_LIMIT", "3")),
        "weibo_pages": int(cfg.get("WEIBO_PAGES", "2")),
        "publish_interval": int(cfg.get("PUBLISH_INTERVAL_SECONDS", "10")),
        "request_timeout": int(cfg.get("REQUEST_TIMEOUT", "20")),
        "ai_timeout": int(cfg.get("AI_TIMEOUT", "120")),
        "retry_times": int(cfg.get("RETRY_TIMES", "3")),
        "require_confirm": cfg.get("REQUIRE_CONFIRM", "true").lower() == "true",
        "watermark_filter": cfg.get("WATERMARK_FILTER", "true").lower() == "true",
        "watermark_strict_mode": cfg.get("WATERMARK_STRICT_MODE", "true").lower() == "true",
        "min_clean_images": int(cfg.get("MIN_CLEAN_IMAGES", "3")),
        "watermark_corner_ratio": float(cfg.get("WATERMARK_CORNER_RATIO", "1.38")),
        "watermark_bottom_ratio": float(cfg.get("WATERMARK_BOTTOM_RATIO", "1.48")),
        "allow_watermark_fallback": cfg.get("ALLOW_WATERMARK_FALLBACK", "false").lower() == "true",
        "materials_path": cfg.get("MATERIALS_PATH", ""),
        "download_dir": str(DOWNLOAD_DIR),
        "theme": store.get("APP_THEME", ""),
        "accent": store.get("APP_ACCENT", ""),
        "sidebar_open": store.get("SIDEBAR_OPEN", "true"),
        "sidebar_width": store.get("SIDEBAR_WIDTH", "240"),
        "wechat_accounts": get_wechat_accounts_list(),
    }


@router.post("/api/settings")
async def save_settings(data: Dict[str, Any]):
    updates = {}
    for k, v in data.items():
        if isinstance(v, bool):
            updates[k] = "true" if v else "false"
        else:
            updates[k] = str(v)

    # 拦截供应商专用 API key → 写入本地存储
    _API_KEY_ENV_NAMES = {"MIMO_API_KEY", "DEEPSEEK_API_KEY", "GLM_API_KEY", "OPENAI_API_KEY", "QWEN_API_KEY", "MINIMAX_API_KEY"}
    local_keys = {}
    for key in _API_KEY_ENV_NAMES:
        if key in updates:
            provider = key.replace("_API_KEY", "").lower()
            local_keys[provider] = updates.pop(key)

    if local_keys:
        from utils.api_key_store import save_api_keys
        save_api_keys(local_keys)

    # 微博鉴权信息 → 写入独立存储
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

    # 头条鉴权信息 → 写入独立存储
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

    # 其余配置项 → settings.json
    if updates:
        from utils.settings_store import write_settings
        write_settings(updates)
    from config import reload_settings
    reload_settings()

    import config as _cfg
    DOWNLOAD_DIR = _cfg.DOWNLOAD_DIR  # noqa: F841

    return {"success": True, "message": "配置已保存"}


@router.get("/api/settings/theme")
async def get_theme():
    """轻量主题设置接口，避免加载全部配置"""
    from utils.settings_store import read_settings
    s = read_settings()
    return {"theme": s.get("APP_THEME", ""), "accent": s.get("APP_ACCENT", "")}


@router.post("/api/theme/window-native")
async def set_window_native_theme(data: Dict[str, str]):
    """设置 macOS 原生窗口的 appearance（标题栏跟随 dark/light 模式）。"""
    theme = data.get("theme", "auto")
    from desktop.native_theme import set_appearance as _set_native
    await asyncio.to_thread(_set_native, theme)
    return {"success": True}


@router.get("/api/settings/api-key")
async def get_api_key(provider: str = Query("")):
    from utils.settings_store import read_settings
    store = read_settings()
    prov = (provider or store.get("AI_PROVIDER", "mimo")).lower()
    key = get_provider_key(store, prov)
    return {"key": key}


def _extract_error_summary(status_code: int, body: str) -> str:
    """从 AI 服务的错误响应中提取人类可读的摘要信息。"""
    import json as _json
    try:
        data = _json.loads(body)
    except (ValueError, TypeError):
        # 非 JSON 响应，返回截断的原始文本
        text = body.strip().replace("\n", " ")
        return f"连接失败（{status_code}）: {text[:120]}"

    # OpenAI / DeepSeek / 通义 等标准格式: {"error": {"message": "...", "type": "...", "code": "..."}}
    err = data.get("error")
    if isinstance(err, dict):
        msg = err.get("message", "")
        code = err.get("code", "")
        err_type = err.get("type", "")
        if code == "invalid_api_key":
            return "API Key 无效，请检查是否正确"
        if code == "model_not_found":
            return f"模型不存在: {msg}"
        if err_type == "authentication_error":
            return f"认证失败: {msg}"
        if msg:
            # 截断过长的 message
            return msg[:200] if len(msg) > 200 else msg
        if code:
            return f"错误 ({code})"

    # Moonshot / 其他格式: {"error": "..."}
    if isinstance(err, str):
        return err[:200]

    # 通用: 尝试 message 字段
    msg = data.get("message") or data.get("msg") or data.get("detail")
    if isinstance(msg, str) and msg:
        return msg[:200]

    return f"连接失败（{status_code}）"


@router.post("/api/settings/ai-test")
async def test_ai_connection(data: dict):
    """测试 AI 服务连通性。"""
    from utils.settings_store import read_settings as _read_settings

    cfg = _read_settings()
    provider = (data.get("provider") or cfg.get("AI_PROVIDER") or "mimo").lower()
    model = data.get("model") or cfg.get("AI_MODEL") or "mimo-v2.5-pro"
    base_url = data.get("base_url") or cfg.get("AI_BASE_URL") or ""
    api_key = data.get("api_key") or get_provider_key(cfg, provider)

    if not base_url:
        return {"success": False, "message": "请先配置 Base URL"}
    if not api_key:
        return {"success": False, "message": "请先配置 API Key"}

    base = base_url.rstrip("/")
    for suffix in ("/messages", "/v1/messages", "/chat/completions"):
        if base.endswith(suffix):
            base = base[: -len(suffix)]
    base = base.rstrip("/")

    if base.endswith("/v1"):
        url_candidates = [f"{base}/chat/completions"]
    elif re.search(r"/v\d+$", base):
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
    timeout = int(cfg.get("AI_TIMEOUT") or cfg.get("REQUEST_TIMEOUT", 30))

    _req_logger.info("[AI测试] provider=%s model=%s", provider, model)
    _req_logger.info("[AI测试] 候选URL: %s", url_candidates)

    errors = []
    for url in url_candidates:
        try:
            resp = http_requests.post(url, headers=headers, json=payload, timeout=timeout)
            if resp.status_code == 200:
                return {"success": True, "message": "连接成功"}
            # 尝试从 JSON 响应中提取关键错误信息
            summary = _extract_error_summary(resp.status_code, resp.text)
            detail = resp.text[:500]
            errors.append({"url": url, "status": resp.status_code, "summary": summary, "detail": detail})
            _req_logger.warning("[AI测试] [%s] 连接失败（%s）: %s", url, resp.status_code, summary)
        except Exception as e:
            errors.append({"url": url, "summary": f"连接异常: {str(e)}", "detail": str(e)})
            _req_logger.warning("[AI测试] [%s] 连接失败: %s", url, e)
            continue
    if not errors:
        return {"success": False, "message": "未知错误"}
    # 优先展示第一个错误的摘要
    primary = errors[0]
    return {"success": False, "message": primary["summary"], "errors": errors}


@router.post("/api/settings/ai-balance")
async def get_ai_balance(data: dict):
    """查询 AI 账户余额。"""
    from utils.settings_store import read_settings as _read_settings

    cfg = _read_settings()
    provider = (data.get("provider") or cfg.get("AI_PROVIDER") or "mimo").lower()
    base_url = data.get("base_url") or cfg.get("AI_BASE_URL") or ""
    api_key = data.get("api_key") or get_provider_key(cfg, provider)

    if not base_url or not api_key:
        return {"success": False, "balance": None, "message": "请先配置 Base URL 和 API Key"}

    base = base_url.rstrip("/")
    for suffix in ("/messages", "/v1/messages", "/chat/completions"):
        if base.endswith(suffix):
            base = base[: -len(suffix)]
    base = base.rstrip("/")

    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json", "Accept": "application/json"}
    timeout = int(cfg.get("REQUEST_TIMEOUT", 10))

    if provider == "deepseek":
        deepseek_base = base
        if deepseek_base.endswith("/v1"):
            deepseek_base = deepseek_base[:-3]
        url = f"{deepseek_base}/user/balance"
        try:
            resp = http_requests.get(url, headers=headers, timeout=timeout)
            if resp.status_code == 200:
                bal = resp.json()
                return {"success": True, "balance": bal, "message": bal.get("is_available", False) and "可用" or "余额不足"}
            return {"success": False, "balance": None, "message": f"查询失败（{resp.status_code}）"}
        except Exception as e:
            return {"success": False, "balance": None, "message": f"查询失败: {str(e)}"}

    if provider == "openai":
        try:
            resp = http_requests.get(f"{base}/dashboard/billing/credit_grants", headers=headers, timeout=timeout)
            if resp.status_code == 200:
                return {"success": True, "balance": resp.json()}
        except Exception as e:
            _req_logger.debug("OpenAI 余额查询失败: %s", e)
        return {"success": False, "balance": None, "message": "请前往 OpenAI 控制台查看余额"}

    guide_urls = {
        "mimo": "https://mimo.mi.com/",
        "glm": "https://open.bigmodel.cn/usercenter/apikeys",
        "qwen": "https://bailian.console.aliyun.com/",
        "minimax": "https://platform.minimaxi.com/",
    }
    url = guide_urls.get(provider, "")
    msg = f"请前往 {url} 查看余额" if url else "当前供应商暂不支持余额查询"
    return {"success": False, "balance": None, "message": msg}


@router.get("/api/pick-folder")
async def pick_folder():
    """打开原生文件夹选择对话框，返回选中路径。"""

    def _pick():
        if sys.platform == "darwin":
            import subprocess
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
            except Exception as e:
                _req_logger.debug("macOS 文件夹选择失败: %s", e)
                return {"path": ""}
        elif sys.platform == "win32":
            import tkinter as tk
            from tkinter import filedialog

            root = tk.Tk()
            root.withdraw()
            root.attributes("-topmost", True)
            try:
                path = filedialog.askdirectory(title="选择素材保存目录", mustexist=True)
                return {"path": path}
            except Exception as e:
                _req_logger.debug("Windows 文件夹选择失败: %s", e)
                return {"path": ""}
            finally:
                root.destroy()
        else:
            import tkinter as tk
            from tkinter import filedialog

            root = tk.Tk()
            root.withdraw()
            try:
                path = filedialog.askdirectory(title="选择素材保存目录", mustexist=True)
                return {"path": path}
            except Exception as e:
                _req_logger.debug("Linux 文件夹选择失败: %s", e)
                return {"path": ""}
            finally:
                root.destroy()

    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, _pick)


@router.get("/api/platforms")
async def get_platforms():
    """返回所有已注册平台的元数据。"""
    from services.platforms import get_default_platform, list_platforms

    platforms = list_platforms()
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
