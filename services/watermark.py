"""基于图像统计的含水印可疑度筛查（不走 OCR / 不重模型）。"""

from __future__ import annotations

from pathlib import Path
from typing import Tuple

from PIL import Image, ImageFilter, ImageStat

Image.MAX_IMAGE_PIXELS = None  # 禁用 decompression bomb 限制，部分图片分辨率较高

from config import settings
from utils.logger import get_logger


logger = get_logger(__name__)


def _rms_edges(gray_region) -> float:
    edges = gray_region.filter(ImageFilter.FIND_EDGES)
    stat = ImageStat.Stat(edges)
    return float(stat.rms[0])


def _open_first_frame_rgb(path: Path) -> Image.Image:
    im = Image.open(path)
    if getattr(im, "n_frames", 1) > 1:
        im.seek(0)
    return im.convert("RGB")


def watermark_metrics(path: str) -> Tuple[float, float]:
    """
    (边角相对中心边缘强度比值, 底边条相对中心的比值)。
    角标 / 半透明 logo / 横向水印条常会抬高其中一项。
    """
    p = Path(path)
    if not p.exists() or p.stat().st_size < 400:
        return 0.0, 0.0
    try:
        rgb = _open_first_frame_rgb(p)
    except Exception:
        return 0.0, 0.0

    w, h = rgb.size
    if w < 120 or h < 120:
        return 0.0, 0.0

    gray = rgb.convert("L")

    cw, ch = max(w // 5, 48), max(h // 5, 48)
    cx0, cy0 = (w - cw) // 2, (h - ch) // 2
    center = gray.crop((cx0, cy0, cx0 + cw, cy0 + ch))
    cen = max(_rms_edges(center), 6.0)

    mw, mh = max(int(w * 0.22), 40), max(int(h * 0.22), 40)
    corners = (
        gray.crop((w - mw, h - mh, w, h)),
        gray.crop((0, h - mh, mw, h)),
        gray.crop((w - mw, 0, w, mh)),
        gray.crop((0, 0, mw, mh)),
    )
    corner_max = max(_rms_edges(c) for c in corners)

    y0 = int(h * 0.88)
    bottom_es = _rms_edges(gray.crop((0, y0, w, h)))

    return corner_max / cen, bottom_es / cen


def should_drop_as_watermarked(path: str) -> bool:
    if not settings.watermark_filter:
        return False

    corner_ratio, bottom_ratio = watermark_metrics(path)
    bad_corner = corner_ratio >= settings.watermark_corner_ratio
    bad_bottom = bottom_ratio >= settings.watermark_bottom_ratio

    if not bad_corner and not bad_bottom:
        return False

    logger.info(
        "过滤疑似水印图 corner=%.2f (阈%.2f) bottom=%.2f (阈%.2f) → %s",
        corner_ratio,
        settings.watermark_corner_ratio,
        bottom_ratio,
        settings.watermark_bottom_ratio,
        path,
    )
    try:
        Path(path).unlink(missing_ok=True)
    except OSError:
        pass
    return True
