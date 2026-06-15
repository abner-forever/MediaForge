"""图片服务和代理 API 路由。

核心优化：
1. 缩略图磁盘缓存 —— 避免每次请求重新生成
2. 代理图片磁盘缓存 —— 避免重复下载
3. run_in_executor 线程池 —— 防止 PIL/requests 阻塞事件循环
4. Cache-Control 缓存头 —— 让浏览器也能缓存
5. 内存缓存 LRU 淘汰 —— 控制内存占用
"""

from __future__ import annotations

import asyncio
import hashlib
import logging
import os
import sys
import threading
from functools import partial
from pathlib import Path
from typing import Dict, Tuple

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse, Response

# 确保项目根目录在 sys.path 中
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from config import DATA_DIR, DOWNLOAD_DIR

router = APIRouter(tags=["images"])
logger = logging.getLogger(__name__)

# ── 缓存配置 ──────────────────────────────────────────

CACHE_DIR = DATA_DIR / "cache"
THUMB_CACHE_DIR = CACHE_DIR / "thumbnails"
PROXY_CACHE_DIR = CACHE_DIR / "proxy"

# 内存代理缓存：限制最大条目，避免 OOM
_MAX_MEM_CACHE = 256
_PROXY_CACHE: Dict[str, Tuple[bytes, str]] = {}
_PROXY_CACHE_LOCK = threading.Lock()

# 专用线程池执行器，用于处理 CPU 密集型图片操作
_IMAGE_EXECUTOR = None


def _get_executor():
    global _IMAGE_EXECUTOR
    if _IMAGE_EXECUTOR is None:
        from concurrent.futures import ThreadPoolExecutor
        # 最多 4 个并发图片处理线程，防止同时 decode 多个大图撑爆内存
        _IMAGE_EXECUTOR = ThreadPoolExecutor(max_workers=4, thread_name_prefix="img")
    return _IMAGE_EXECUTOR


def _cache_path(base_dir: Path, key: str, suffix: str = ".jpg") -> Path:
    """基于 key 生成稳定、平坦的缓存文件路径（避免子目录过多）。"""
    h = hashlib.sha256(key.encode()).hexdigest()[:32]
    return base_dir / f"{h}{suffix}"


def _proxy_cache_get(url: str) -> Tuple[bytes | None, str | None]:
    with _PROXY_CACHE_LOCK:
        return _PROXY_CACHE.get(url, (None, None))


def _proxy_cache_set(url: str, content: bytes, content_type: str) -> None:
    with _PROXY_CACHE_LOCK:
        # LRU 风格：淘汰时删除第一个条目
        if len(_PROXY_CACHE) >= _MAX_MEM_CACHE:
            try:
                _PROXY_CACHE.pop(next(iter(_PROXY_CACHE)))
            except StopIteration:
                pass
        _PROXY_CACHE[url] = (content, content_type)


def get_proxy_cache():
    """暴露缓存接口供其他模块使用。"""
    return _proxy_cache_get, _proxy_cache_set


# ── 缩略图磁盘缓存（同步函数，在 executor 中运行）────

def _load_thumbnail_from_cache(file_path: Path, size: int) -> bytes | None:
    """尝试从磁盘缓存读取缩略图。"""
    stem = file_path.stem
    cache_key = f"{stem}_{size}_{file_path.stat().st_mtime_ns // 1_000_000_000}"
    cache_path = _cache_path(THUMB_CACHE_DIR, cache_key)
    if cache_path.exists():
        try:
            return cache_path.read_bytes()
        except Exception:
            pass
    return None


def _save_thumbnail_to_cache(file_path: Path, size: int, data: bytes) -> None:
    """保存缩略图到磁盘缓存。"""
    try:
        stem = file_path.stem
        cache_key = f"{stem}_{size}_{file_path.stat().st_mtime_ns // 1_000_000_000}"
        cache_path = _cache_path(THUMB_CACHE_DIR, cache_key)
        THUMB_CACHE_DIR.mkdir(parents=True, exist_ok=True)
        cache_path.write_bytes(data)
    except Exception as e:
        logger.debug("缩略图缓存写入失败: %s", e)


def _generate_thumbnail(file_path: Path, size: int) -> bytes:
    """同步生成缩略图——在 executor 线程池中运行。"""
    # 先走磁盘缓存
    cached = _load_thumbnail_from_cache(file_path, size)
    if cached is not None:
        return cached

    from PIL import Image as PILImage
    import io
    try:
        img = PILImage.open(file_path)
        # 缩略图模式：保持宽高比
        img.thumbnail((size, size), PILImage.LANCZOS)
        buf = io.BytesIO()
        if img.mode in ("RGBA", "P"):
            img = img.convert("RGB")
        img.save(buf, "JPEG", quality=70)
        buf.seek(0)
        result = buf.read()
        # 异步写缓存（不阻塞调用方）
        _save_thumbnail_to_cache(file_path, size, result)
        return result
    except Exception as e:
        logger.debug("缩略图生成失败: %s", e)
        # 降级：读取原图直接返回
        return file_path.read_bytes()


# ── 代理图片缓存（磁盘级）────────────────────────────

def _load_proxy_from_disk(cache_key: str) -> Tuple[bytes | None, str | None]:
    """从磁盘缓存读取代理图片。"""
    cache_path = _cache_path(PROXY_CACHE_DIR, cache_key)
    if cache_path.exists():
        try:
            data = cache_path.read_bytes()
            # 从缓存文件名后缀推断 content-type
            if cache_path.suffix == ".jpg":
                return data, "image/jpeg"
            elif cache_path.suffix == ".png":
                return data, "image/png"
            elif cache_path.suffix == ".webp":
                return data, "image/webp"
            return data, "image/jpeg"
        except Exception:
            pass
    return None, None


def _save_proxy_to_disk(cache_key: str, content: bytes, content_type: str) -> None:
    """保存代理图片到磁盘缓存。"""
    try:
        suffix = {
            "image/jpeg": ".jpg", "image/jpg": ".jpg",
            "image/png": ".png", "image/webp": ".webp",
            "image/gif": ".gif",
        }.get(content_type.split(";")[0].strip(), ".jpg")
        cache_path = _cache_path(PROXY_CACHE_DIR, cache_key, suffix)
        PROXY_CACHE_DIR.mkdir(parents=True, exist_ok=True)
        cache_path.write_bytes(content)
    except Exception as e:
        logger.debug("代理图片磁盘缓存写入失败: %s", e)


def _proxy_fetch_and_resize(url: str, resize_to: int, platform: str) -> Tuple[bytes, str]:
    """同步下载并可选缩放远程图片——在 executor 线程池中运行。"""
    import requests as http_requests

    referer = {
        "weibo": "https://weibo.com/",
        "toutiao": "https://www.toutiao.com/",
        "wechat": "https://mp.weixin.qq.com/",
    }.get(platform, "https://www.bing.com/")

    timeout = {"weibo": 10, "toutiao": 10, "wechat": 15}.get(platform, 20)

    req_headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        "Referer": referer,
    }
    resp = http_requests.get(url, timeout=timeout, headers=req_headers)
    resp.raise_for_status()
    content_type = resp.headers.get("Content-Type", "image/jpeg")
    content = resp.content

    if resize_to:
        content = _resize_image(content, resize_to)

    return content, content_type


def _resize_image(content: bytes, size: int = 320) -> bytes:
    """将图片缩放为缩略图（同步，在 executor 中运行）。"""
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
    except Exception as e:
        logger.debug("图片压缩失败: %s", e)
        return content


# ── 缓存头（一年强缓存+不可变，适合带 hash 的缩略图）─

_CACHE_LONG = "public, max-age=31536000, immutable"
_CACHE_SHORT = "public, max-age=300"


# ── 路由 ──────────────────────────────────────────────


@router.get("/images/thumbnail/{path:path}")
async def serve_thumbnail(path: str, size: int = Query(320, alias="size")):
    """返回图片缩略图（带磁盘缓存 + 线程池处理）。"""
    file_path = DOWNLOAD_DIR / path
    if not file_path.exists():
        raise HTTPException(404, "图片不存在")

    try:
        executor = _get_executor()
        content = await asyncio.get_event_loop().run_in_executor(
            executor, _generate_thumbnail, file_path, size
        )
        return Response(
            content=content,
            media_type="image/jpeg",
            headers={"Cache-Control": _CACHE_LONG},
        )
    except Exception as e:
        logger.debug("缩略图生成失败: %s", e)
        return FileResponse(str(file_path))


@router.get("/images/{path:path}")
async def serve_image(path: str):
    """返回原图。"""
    file_path = DOWNLOAD_DIR / path
    if not file_path.exists():
        abs_path = Path(path)
        if abs_path.exists() and str(abs_path).startswith(str(DATA_DIR)):
            file_path = abs_path
        else:
            raise HTTPException(404, "图片不存在")
    return FileResponse(str(file_path), headers={"Cache-Control": _CACHE_LONG})


@router.get("/proxy")
async def proxy_image(
    url: str,
    platform: str = Query("weibo"),
    thumbnail: int = Query(0),
    size: int = Query(0),
):
    """代理远程图片，解决 CORS 问题（线程池下载 + 磁盘缓存）。"""
    resize_to = size or (320 if thumbnail else 0)
    cache_key = f"{url}?size={resize_to}" if resize_to else url

    # 1. 内存缓存（极速命中）
    cached, ct = _proxy_cache_get(cache_key)
    if cached:
        return Response(content=cached, media_type=ct, headers={"Cache-Control": _CACHE_LONG})

    # 2. 磁盘缓存（次快）
    disk_cached, disk_ct = _load_proxy_from_disk(cache_key)
    if disk_cached:
        # 同时回填内存缓存
        _proxy_cache_set(cache_key, disk_cached, disk_ct)
        return Response(content=disk_cached, media_type=disk_ct, headers={"Cache-Control": _CACHE_LONG})

    # 3. 下载 + 缩放（线程池，不阻塞事件循环）
    try:
        executor = _get_executor()
        content, content_type = await asyncio.get_event_loop().run_in_executor(
            executor, _proxy_fetch_and_resize, url, resize_to, platform
        )

        # 回填两级缓存
        _proxy_cache_set(cache_key, content, content_type)
        _save_proxy_to_disk(cache_key, content, content_type)

        return Response(
            content=content,
            media_type=content_type,
            headers={"Cache-Control": _CACHE_LONG},
        )
    except Exception as err:
        raise HTTPException(502, f"代理请求失败: {err}")
