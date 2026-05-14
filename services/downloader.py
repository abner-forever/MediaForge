from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import List, Optional, Tuple

import requests

from config import DOWNLOAD_DIR, settings
from services.watermark import should_drop_as_watermarked
from utils.file import hash_text
from utils.logger import get_logger
from utils.pathsafe import sanitize_segment


logger = get_logger(__name__)


def _coerce_folder_label(value: object, fallback: str) -> str:
    if value is None:
        return fallback
    text = str(value).strip()
    return text if text else fallback


def _download_one(url: str, filename: Path, overwrite: bool, filter_watermark: Optional[bool] = None) -> Optional[str]:
    do_filter = settings.watermark_filter if filter_watermark is None else filter_watermark
    if filename.exists() and not overwrite:
        if do_filter and should_drop_as_watermarked(str(filename)):
            return None
        return str(filename)
    try:
        resp = requests.get(url, timeout=settings.request_timeout)
        resp.raise_for_status()
        filename.parent.mkdir(parents=True, exist_ok=True)
        filename.write_bytes(resp.content)
        path_str = str(filename)
        if do_filter and should_drop_as_watermarked(path_str):
            return None
        return path_str
    except Exception as err:
        logger.error("图片下载失败 %s: %s", url, err)
        return None


def download_images(
    images: List[str],
    *,
    celebrity: str,
    scene: str,
    post_slug: str,
    prefix: str,
    overwrite: bool = False,
    max_workers: int = 4,
) -> Tuple[List[str], int]:
    """保存路径：data/images/<艺人>/<帖子目录>/文件名。"""
    saved_paths: List[str] = []
    dropped_by_watermark = 0
    if not images:
        return saved_paths, dropped_by_watermark

    celeb_raw = _coerce_folder_label(celebrity, "未命名艺人")
    slug_raw = _coerce_folder_label(post_slug, _coerce_folder_label(prefix, "post"))

    celeb_dir = sanitize_segment(celeb_raw)
    slug_dir = sanitize_segment(slug_raw)
    pref = sanitize_segment(_coerce_folder_label(prefix, "img"))

    img_root = DOWNLOAD_DIR.expanduser().resolve()
    base_dir = (img_root / celeb_dir / slug_dir).resolve()

    try:
        rel_parts = base_dir.relative_to(img_root).parts
    except ValueError:
        rel_parts = ()

    if len(rel_parts) < 2:
        logger.error(
            "下载路径层级异常(%s)，将强制归入未命名子目录 celebrity=%s slug=%s",
            base_dir,
            celeb_raw,
            slug_raw,
        )
        base_dir = (img_root / "未命名艺人" / slug_dir).resolve()

    base_dir.mkdir(parents=True, exist_ok=True)
    logger.info("图片保存目录: %s", base_dir)

    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = {}
        for idx, url in enumerate(images, start=1):
            ext = ".jpg"
            tail = url.rsplit("/", 1)[-1]
            if "." in tail:
                ext_candidate = "." + tail.rsplit(".", 1)[-1].split("?")[0][:5]
                if len(ext_candidate) <= 6 and ext_candidate.startswith("."):
                    ext = ext_candidate
            filename = base_dir / f"{pref}_{idx}_{hash_text(url)[:8]}{ext}"
            futures[executor.submit(_download_one, url, filename, overwrite)] = url

        for future in as_completed(futures):
            result = future.result()
            if result:
                saved_paths.append(result)
            else:
                dropped_by_watermark += 1

    filtered = len(images) - len(saved_paths)
    logger.info(
        "下载图片完成：保留 %s / %s（疑似水印或下载失败约 %s 张）",
        len(saved_paths),
        len(images),
        filtered,
    )
    return sorted(saved_paths), dropped_by_watermark
