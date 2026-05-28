"""图片服务和代理 API 路由。"""

from __future__ import annotations

import sys
from pathlib import Path
from typing import Dict, Tuple

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse, Response

# 确保项目根目录在 sys.path 中
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from config import DATA_DIR, DOWNLOAD_DIR, settings

router = APIRouter(tags=["images"])

# ── 代理缓存 ──────────────────────────────────────────

_PROXY_CACHE: Dict[str, Tuple[bytes, str]] = {}


def _proxy_cache_get(url: str) -> Tuple[bytes | None, str | None]:
    return _PROXY_CACHE.get(url, (None, None))


def _proxy_cache_set(url: str, content: bytes, content_type: str) -> None:
    _PROXY_CACHE[url] = (content, content_type)


def get_proxy_cache():
    """暴露缓存接口供其他模块使用。"""
    return _proxy_cache_get, _proxy_cache_set


def _resize_image(content: bytes, size: int = 320) -> bytes:
    """将图片缩放为缩略图。"""
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


@router.get("/images/thumbnail/{path:path}")
async def serve_thumbnail(path: str, size: int = Query(320, alias="size")):
    """返回图片缩略图。"""
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
        return Response(content=buf.read(), media_type="image/jpeg")
    except Exception:
        return FileResponse(str(file_path))


@router.get("/images/{path:path}")
async def serve_image(path: str):
    file_path = DOWNLOAD_DIR / path
    if not file_path.exists():
        abs_path = Path(path)
        if abs_path.exists() and str(abs_path).startswith(str(DATA_DIR)):
            file_path = abs_path
        else:
            raise HTTPException(404, "图片不存在")
    return FileResponse(str(file_path))


_PLATFORM_REFERERS = {
    "weibo": "https://weibo.com/",
    "toutiao": "https://www.toutiao.com/",
    "xhs": "https://www.xiaohongshu.com/",
}

_PROXY_TIMEOUTS = {"weibo": 10, "toutiao": 10, "xhs": 10}


@router.get("/proxy")
async def proxy_image(url: str, platform: str = Query("weibo"), thumbnail: int = Query(0), size: int = Query(0)):
    """代理远程图片，解决 CORS 问题。"""
    import requests as http_requests

    resize_to = size or (320 if thumbnail else 0)
    cache_key = f"{url}?size={resize_to}" if resize_to else url
    cached, ct = _proxy_cache_get(cache_key)
    if cached:
        return Response(content=cached, media_type=ct)

    referer = _PLATFORM_REFERERS.get(platform, "https://www.bing.com/")
    timeout = _PROXY_TIMEOUTS.get(platform, 20)
    req_headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        "Referer": referer,
    }
    if platform == "xhs" or any(d in url for d in ["xhscdn.com", "xiaohongshu.com"]):
        xhs_cookie = settings.xhs_cookie
        if xhs_cookie:
            req_headers["Cookie"] = xhs_cookie
        if platform != "xhs":
            req_headers["Referer"] = "https://www.xiaohongshu.com/"
    try:
        resp = http_requests.get(url, timeout=timeout, headers=req_headers)
        resp.raise_for_status()
        content_type = resp.headers.get("Content-Type", "image/jpeg")
        content = resp.content
        if resize_to:
            content = _resize_image(content, resize_to)
        _proxy_cache_set(cache_key, content, content_type)
        return Response(content=content, media_type=content_type)
    except Exception as err:
        raise HTTPException(502, f"代理请求失败: {err}")
