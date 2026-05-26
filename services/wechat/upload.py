"""图片上传与尺寸检查。"""

import tempfile
from pathlib import Path

from PIL import Image

from utils.logger import get_logger

logger = get_logger(__name__)


def _resize_image_if_needed(image_path: str, max_pixels: int = 6_000_000) -> str:
    """检查图片尺寸是否超过微信限制（宽高乘积 ≤ 600 万），超过则缩放并返回临时文件路径。

    Args:
        image_path: 原图绝对路径
        max_pixels: 允许的最大像素乘积

    Returns:
        缩放后的图片路径（与原图相同时返回原路径，否则返回临时文件路径）
    """
    try:
        img = Image.open(image_path)
        w, h = img.size
        if w * h <= max_pixels:
            return image_path

        # 计算缩放比例，保持宽高比
        ratio = (max_pixels / (w * h)) ** 0.5
        new_w, new_h = int(w * ratio), int(h * ratio)

        # 用 LANCZOS 重采样保证质量
        resized = img.resize((new_w, new_h), Image.LANCZOS)
        suffix = Path(image_path).suffix or ".jpg"
        tmp = tempfile.NamedTemporaryFile(suffix=suffix, delete=False)
        # 保存时把 EXIF 方向信息也带过去
        resized.save(tmp.name, quality=95)
        tmp.close()
        logger.info("图片已缩放: %s (%dx%d → %dx%d, %.1fM px → %.1fM px)",
                     Path(image_path).name, w, h, new_w, new_h,
                     (w * h) / 1e6, (new_w * new_h) / 1e6)
        return tmp.name
    except Exception as e:
        logger.warning("图片尺寸检查失败，使用原图: %s", e)
        return image_path
