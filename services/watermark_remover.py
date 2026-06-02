"""基于 OpenCV 的水印去除：精确定位 → 裁剪/修复。"""

from __future__ import annotations

from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import cv2
import numpy as np

from utils.logger import get_logger

logger = get_logger(__name__)

# ── 底边水印检测 ──────────────────────────────────────────────


def _detect_bottom_band(gray: np.ndarray) -> Optional[int]:
    """扫描底部边缘密度，返回水印带上沿 y 坐标；未检测到返回 None。"""
    h, w = gray.shape
    if h < 100 or w < 100:
        return None

    edges = cv2.Canny(gray, 50, 150)

    # 逐行统计边缘像素占比
    row_density = np.sum(edges > 0, axis=1).astype(np.float64) / w

    # 用滑动窗口平滑
    kernel = 5
    smoothed = np.convolve(row_density, np.ones(kernel) / kernel, mode="same")

    # 基线：上半部分的均值 + 1 倍标准差
    top_half = smoothed[: h // 2]
    if len(top_half) == 0:
        return None
    baseline = float(np.mean(top_half)) + float(np.std(top_half))

    # 从底部向上扫描，找到边缘密度降到基线以下的位置
    threshold = max(baseline, 0.02)  # 最低阈值防止全黑图误判
    y_top = h
    for y in range(h - 1, int(h * 0.75), -1):
        if smoothed[y] < threshold:
            y_top = y
            break
    else:
        return None

    band_height = h - y_top
    # 水印带应在 3%~25% 之间
    if band_height < h * 0.03 or band_height > h * 0.25:
        return None

    return y_top


def _detect_bottom_bright_band(gray: np.ndarray) -> Optional[int]:
    """用亮度峰值检测底部水印带（适用于边缘密度法漏检的浅色半透明带）。"""
    h, w = gray.shape
    if h < 200 or w < 200:
        return None

    # 逐行平均亮度
    row_bright = np.mean(gray, axis=1).astype(np.float64)

    # 用滑动窗口平滑
    kernel = 7
    smoothed = np.convolve(row_bright, np.ones(kernel) / kernel, mode="same")

    # 只看底部 15%
    scan_start = int(h * 0.85)
    bottom_part = smoothed[scan_start:]
    if len(bottom_part) < 10:
        return None

    # 基线：底部区域内亮度的中位数
    baseline = float(np.median(bottom_part))

    # 找到底部区域的最大亮度峰值
    peak_val = float(np.max(bottom_part))
    peak_idx_local = int(np.argmax(bottom_part))
    peak_idx = scan_start + peak_idx_local

    # 亮度提升幅度需 > 8%（峰值显著高于基线）
    if peak_val < baseline * 1.08 or peak_val < baseline + 5:
        return None

    # 从峰值向两侧扩展，找到亮度回落到基线 ±2 的位置
    ascent = peak_idx
    for y in range(peak_idx, scan_start, -1):
        if smoothed[y] < baseline + 2:
            ascent = y
            break

    descent = peak_idx
    for y in range(peak_idx, h):
        if y >= h or smoothed[y] < baseline + 2:
            descent = y
            break

    band_top = ascent
    band_bottom = descent
    band_height = band_bottom - band_top

    # 水印带应在 0.5%~20% 之间
    if band_height < h * 0.005 or band_height > h * 0.20:
        return None

    logger.info("亮度法检测到底部水印带: top=%d bottom=%d height=%d peak_val=%.1f baseline=%.1f",
                band_top, band_bottom, band_height, peak_val, baseline)
    return band_top


def _detect_bottom_horizontal_line(gray: np.ndarray
                                   ) -> List[Tuple[int, int, int, int]]:
    """检测底部水印水平线（微博/小红书等平台在右下角添加的半透明条纹文字）。

    这类水印很细（5-15px 高）、半透明、位于右下角，在全宽亮度平均中
    信号微弱。本方法在右下角局部用 CLAHE + 行亮度峰值检测。

    使用高阈值 + 文字梯度特征验证，严格避免误检正常图片内容。
    """
    h, w = gray.shape
    if h < 400 or w < 400:
        return []

    # 右下角区域（右侧 25% × 底部 150px）
    margin_w = max(w // 4, 200)
    scan_h = min(150, h // 4)
    region = gray[h - scan_h:h, w - margin_w:]
    rh, rw = region.shape

    # CLAHE 增强局部对比
    clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8))
    enhanced = clahe.apply(region)

    # 逐行统计亮像素
    row_scores = np.array([np.sum(enhanced[y, :] > 120) for y in range(rh)],
                          dtype=np.float64)
    kernel = 5
    smoothed = np.convolve(row_scores, np.ones(kernel) / kernel, mode="same")

    # 较高阈值，避免误检
    baseline = float(np.median(row_scores))
    lower_baseline = float(np.percentile(row_scores, 25))
    threshold = max(lower_baseline * 1.5 + 8, baseline * 1.3 + 5)

    # 行梯度：文字笔画行应有较高的梯度变化（文字边缘产生横向梯度）
    row_gradients = np.zeros(rh, dtype=np.float64)
    for y in range(rh):
        gx = cv2.Sobel(enhanced[y, :], cv2.CV_64F, 1, 0, ksize=3)
        row_gradients[y] = float(np.std(gx))

    bands: List[Tuple[int, int, int, int]] = []
    in_band = False
    band_start = 0
    for y in range(rh):
        if smoothed[y] > threshold:
            if not in_band:
                band_start = y
                in_band = True
        else:
            if in_band:
                band_h = y - band_start
                if 4 <= band_h <= 20:
                    sub = enhanced[band_start:y, :]
                    bright_ratio = float(np.mean(sub > 120))
                    # 高亮像素密度 + 文字梯度验证
                    if bright_ratio > 0.20:
                        grad_std = float(np.mean(row_gradients[band_start:y]))
                        if grad_std > 3.0:
                            global_y = h - scan_h + band_start
                            global_x = w - margin_w
                            bands.append((global_x, global_y, rw, band_h))
                            logger.info("检测到底部水平线水印: (%d,%d %dx%d) bright=%.1f%% grad=%.1f",
                                        global_x, global_y, rw, band_h, bright_ratio * 100, grad_std)
                in_band = False
    if in_band:
        band_h = rh - band_start
        if 4 <= band_h <= 20:
            sub = enhanced[band_start:rh, :]
            bright_ratio = float(np.mean(sub > 120))
            if bright_ratio > 0.20:
                grad_std = float(np.mean(row_gradients[band_start:rh]))
                if grad_std > 3.0:
                    global_y = h - scan_h + band_start
                    global_x = w - margin_w
                    bands.append((global_x, global_y, rw, band_h))
                    logger.info("检测到底部水平线水印: (%d,%d %dx%d) bright=%.1f%% grad=%.1f",
                                global_x, global_y, rw, band_h, bright_ratio * 100, grad_std)

    return bands


# ── 角标水印检测 ──────────────────────────────────────────────


def _detect_corner_regions(
    img: np.ndarray, gray: np.ndarray
) -> List[Tuple[int, int, int, int]]:
    """检测四角水印区域，返回需要修复的 (x, y, w, h) 列表。"""
    h, w = gray.shape
    if h < 120 or w < 120:
        return []

    # 中心区域作为基线
    cw, ch = max(w // 5, 48), max(h // 5, 48)
    cx0, cy0 = (w - cw) // 2, (h - ch) // 2
    center_edges = cv2.Canny(gray[cy0 : cy0 + ch, cx0 : cx0 + cw], 50, 150)
    center_density = max(float(np.mean(center_edges > 0)), 0.005)

    # 四角区域
    mw, mh = max(int(w * 0.22), 40), max(int(h * 0.22), 40)
    corners = [
        (0, 0, mw, mh),  # 左上
        (w - mw, 0, w, mh),  # 右上
        (0, h - mh, mw, h),  # 左下
        (w - mw, h - mh, w, h),  # 右下
    ]

    # HSV 阈值检测半透明覆盖层
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    bright_low_sat = cv2.inRange(hsv, (0, 0, 200), (180, 50, 255))

    result: List[Tuple[int, int, int, int]] = []
    for x0, y0, x1, y1 in corners:
        region = gray[y0:y1, x0:x1]
        region_edges = cv2.Canny(region, 50, 150)
        density = float(np.mean(region_edges > 0))

        # 边缘密度显著高于中心（比值 > 1.3）
        ratio = density / center_density
        bright_ratio = float(np.mean(bright_low_sat[y0:y1, x0:x1] > 0))

        if ratio > 1.3 or bright_ratio > 0.15:
            result.append((x0, y0, x1 - x0, y1 - y0))

    return result


# ── 小文字/logo 水印检测（右下角精确扫描）───────────────────


def _extract_text_by_brightness(region: np.ndarray) -> np.ndarray:
    """策略 1：高亮阈值提取白色/灰色文字（含低阈值回退）。"""
    _, bright = cv2.threshold(region, 128, 255, cv2.THRESH_BINARY)
    ratio = float(np.mean(bright > 0))
    if ratio < 0.003 or ratio > 0.35:
        # 回退：更低阈值尝试提取半透明文字
        _, bright2 = cv2.threshold(region, 100, 255, cv2.THRESH_BINARY)
        ratio2 = float(np.mean(bright2 > 0))
        if 0.003 <= ratio2 <= 0.35:
            return bright2
        return np.zeros_like(region)
    return bright


def _extract_text_by_gradient(region: np.ndarray) -> np.ndarray:
    """策略 2：Sobel 梯度检测半透明文字/logo。

    半透明水印亮度与背景接近，但其边缘仍有梯度变化。
    """
    blurred = cv2.GaussianBlur(region, (3, 3), 0)
    sobelx = cv2.Sobel(blurred, cv2.CV_64F, 1, 0, ksize=3)
    sobely = cv2.Sobel(blurred, cv2.CV_64F, 0, 1, ksize=3)
    magnitude = np.sqrt(sobelx ** 2 + sobely ** 2)

    grad_mean = float(np.mean(magnitude))
    grad_std = float(np.std(magnitude))
    # 使用更敏感的阈值捕捉半透明文字的弱边缘
    threshold = max(grad_mean + 0.5 * grad_std, 5.0)

    _, mask = cv2.threshold(magnitude, threshold, 255, cv2.THRESH_BINARY)
    mask = mask.astype(np.uint8)

    ratio = float(np.mean(mask > 0))
    if ratio < 0.002 or ratio > 0.4:
        return np.zeros_like(region)
    return mask


def _extract_text_by_tophat(region: np.ndarray) -> np.ndarray:
    """策略 3：形态学 Top-hat 提取低反差文字/logo。

    半透明水印的局部反差仍然存在，但边缘梯度弱。
    Top-hat 提取小于结构元素的局部亮度起伏，适合低对比度文字。
    """
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (15, 15))
    tophat = cv2.morphologyEx(region, cv2.MORPH_TOPHAT, kernel)
    blackhat = cv2.morphologyEx(region, cv2.MORPH_BLACKHAT, kernel)

    contrast = cv2.add(tophat, blackhat)

    _, mask = cv2.threshold(contrast, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    mask = mask.astype(np.uint8)

    ratio = float(np.mean(mask > 0))
    if ratio < 0.002 or ratio > 0.3:
        return np.zeros_like(region)
    return mask


def _validate_text_region(
    mx: int, my: int, mw: int, mh: int, gray: np.ndarray, img_w: int, img_h: int
) -> Optional[Tuple[int, int, int, int]]:
    """验证候选区域是否真的是水印。"""
    mx = max(mx, 0)
    my = max(my, 0)
    mw = min(mw, img_w - mx)
    mh = min(mh, img_h - my)
    if mw < 20 or mh < 10:
        return None

    sub = gray[my : my + mh, mx : mx + mw]

    # 亮像素密度（降低阈值捕捉半透明文字）
    _, sub_bright = cv2.threshold(sub, 120, 255, cv2.THRESH_BINARY)
    bright_ratio = float(np.mean(sub_bright > 0))

    # 梯度密度（降低梯度阈值）
    sobelx = cv2.Sobel(sub, cv2.CV_64F, 1, 0, ksize=3)
    sobely = cv2.Sobel(sub, cv2.CV_64F, 0, 1, ksize=3)
    grad = np.sqrt(sobelx ** 2 + sobely ** 2)
    grad_ratio = float(np.mean(grad > 8))

    if (0.015 < bright_ratio < 0.6) or (0.008 < grad_ratio < 0.5):
        logger.info("检测到文字水印: (%d,%d %dx%d) bright=%.1f%% grad=%.1f%%",
                    mx, my, mw, mh, bright_ratio * 100, grad_ratio * 100)
        return (mx, my, mw, mh)
    return None


def _merge_text_boxes(
    boxes: List[Tuple[int, int, int, int]], gray: np.ndarray, img_w: int, img_h: int
) -> List[Tuple[int, int, int, int]]:
    """合并重叠/相邻框并做最终验证。"""
    boxes.sort(key=lambda b: b[1])
    merged: List[Tuple[int, int, int, int]] = []
    current = boxes[0]
    for b in boxes[1:]:
        cx0, cy0, cw0, ch0 = current
        bx0, by0, bw0, bh0 = b
        overlap_y = max(0, min(cy0 + ch0, by0 + bh0) - max(cy0, by0))
        gap_x = bx0 - (cx0 + cw0)
        gap_y = by0 - (cy0 + ch0)
        # 允许更大间距的水平合并，以及垂直方向相邻的行
        if (gap_x < 30 and overlap_y > 0) or (abs(gap_x) < 15 and 0 < gap_y < 20):
            nx = min(cx0, bx0)
            ny = min(cy0, by0)
            nw = max(cx0 + cw0, bx0 + bw0) - nx
            nh = max(cy0 + ch0, by0 + bh0) - ny
            current = (nx, ny, nw, nh)
        else:
            if cw0 * ch0 >= 40 * 10:
                merged.append(current)
            current = b
    if current[2] * current[3] >= 40 * 10:
        merged.append(current)

    valid: List[Tuple[int, int, int, int]] = []
    for box in merged:
        result = _validate_text_region(*box, gray, img_w, img_h)
        if result:
            valid.append(result)
    return valid


def _detect_text_watermarks(
    img: np.ndarray, gray: np.ndarray, val_gray: Optional[np.ndarray] = None
) -> List[Tuple[int, int, int, int]]:
    """检测小文字/logo 水印（如小红书/微博右下角及底部通栏）。

    大图（>2000px）中水印可能只有 100-300px，22% 角标检测区域过大，
    信号被稀释。本函数用多策略在右下角精确扫描，并在第一轮无结果时
    扫描右下角更大窗口及底部通栏：
    - 高亮文字（白/灰文字 on 暗底）
    - 边缘梯度（半透明水印/logo）
    - Top-hat 形态学（低反差局部文字）

    Args:
        gray: 用于检测的灰度图（可能是 CLAHE 增强版）
        val_gray: 用于验证的灰度图（一般为原始灰度），默认同 gray
    """
    h, w = gray.shape
    if h < 300 or w < 300:
        return []

    def _scan_region(x0: int, y0: int, x1: int, y1: int) -> List[Tuple[int, int, int, int]]:
        """在指定区域内扫描文字水印。"""
        rw, rh = x1 - x0, y1 - y0
        if rw < 80 or rh < 20:
            return []
        region = gray[y0:y1, x0:x1]

        bright_mask = _extract_text_by_brightness(region)
        grad_mask = _extract_text_by_gradient(region)
        tophat_mask = _extract_text_by_tophat(region)

        combined = cv2.bitwise_or(bright_mask, grad_mask)
        combined = cv2.bitwise_or(combined, tophat_mask)
        if np.sum(combined) == 0:
            return []

        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5))
        closed = cv2.morphologyEx(combined, cv2.MORPH_CLOSE, kernel)
        closed = cv2.dilate(closed, cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3)), iterations=1)

        contours, _ = cv2.findContours(closed, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        if not contours:
            return []

        boxes: List[Tuple[int, int, int, int]] = []
        for cnt in contours:
            cx, cy, cw, ch = cv2.boundingRect(cnt)
            area = cv2.contourArea(cnt)
            if area < 30:
                continue
            if cw > rw * 0.7 or ch > rh * 0.5:
                continue
            aspect = cw / max(ch, 1)
            if aspect < 0.15 or aspect > 6:
                continue
            boxes.append((cx + x0, cy + y0, cw, ch))

        if not boxes:
            return []
        return _merge_text_boxes(boxes, val_gray if val_gray is not None else gray, w, h)

    # 第一轮：右下角 300x300（原行为）
    window = min(w, h, 300)
    result = _scan_region(w - window, h - window, w, h)
    if result:
        return result

    # 第二轮：右下角 600x300（水平扩展，覆盖靠近右边缘但不贴角的文字）
    if w >= 600 and h >= 300:
        result = _scan_region(w - 600, h - 300, w, h)
        if result:
            return result

    # 第三轮：底部通栏（全宽 × 底部 200px，用于底部水印带/字幕）
    if h >= 300:
        bottom_h = min(200, h // 4)
        result = _scan_region(0, h - bottom_h, w, h)
        if result:
            return result

    return []


# ── 修复 ──────────────────────────────────────────────────────


def _inpaint_corners(
    img: np.ndarray, regions: List[Tuple[int, int, int, int]]
) -> np.ndarray:
    """对角标区域生成遮罩并修复。

    适用于大块角标（如平台 logo），使用 Canny 边缘 + HSV 亮色检测。
    """
    h, w = img.shape[:2]
    mask = np.zeros((h, w), dtype=np.uint8)

    for x, y, rw, rh in regions:
        region_gray = cv2.cvtColor(img[y : y + rh, x : x + rw], cv2.COLOR_BGR2GRAY)
        region_edges = cv2.Canny(region_gray, 30, 100)

        hsv_roi = cv2.cvtColor(img[y : y + rh, x : x + rw], cv2.COLOR_BGR2HSV)
        bright = cv2.inRange(hsv_roi, (0, 0, 200), (180, 50, 255))

        combined = cv2.bitwise_or(region_edges, bright)

        # 保守膨胀，避免伤及图像内容
        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
        combined = cv2.morphologyEx(combined, cv2.MORPH_CLOSE, kernel)
        combined = cv2.dilate(combined, kernel, iterations=1)

        mask[y : y + rh, x : x + rw] = combined

    if np.sum(mask) == 0:
        return img

    return cv2.inpaint(img, mask, inpaintRadius=2, flags=cv2.INPAINT_TELEA)


def _inpaint_text_regions(
    img: np.ndarray, gray: np.ndarray, regions: List[Tuple[int, int, int, int]]
) -> np.ndarray:
    """针对小文字/半透明 logo 的精确修复。

    用亮度 + Sobel 梯度 + Top-hat 形态学生成遮罩（而非 Canny），
    避免图像内容边缘被误修复。
    """
    h, w = img.shape[:2]
    mask = np.zeros((h, w), dtype=np.uint8)

    for x, y, rw, rh in regions:
        region = gray[y : y + rh, x : x + rw]

        # 亮度检测（白色/灰色文字）
        _, bright = cv2.threshold(region, 128, 255, cv2.THRESH_BINARY)

        # 梯度检测（半透明文字/logo）
        blurred = cv2.GaussianBlur(region, (3, 3), 0)
        sobelx = cv2.Sobel(blurred, cv2.CV_64F, 1, 0, ksize=3)
        sobely = cv2.Sobel(blurred, cv2.CV_64F, 0, 1, ksize=3)
        magnitude = np.sqrt(sobelx ** 2 + sobely ** 2)
        grad_thresh = max(float(np.mean(magnitude)) + float(np.std(magnitude)) * 0.5, 5.0)
        _, grad_mask = cv2.threshold(magnitude, grad_thresh, 255, cv2.THRESH_BINARY)
        grad_mask = grad_mask.astype(np.uint8)

        # Top-hat 形态学（低反差局部文字）
        kernel_th = cv2.getStructuringElement(cv2.MORPH_RECT, (15, 15))
        tophat = cv2.morphologyEx(region, cv2.MORPH_TOPHAT, kernel_th)
        blackhat = cv2.morphologyEx(region, cv2.MORPH_BLACKHAT, kernel_th)
        contrast = cv2.add(tophat, blackhat)
        _, tophat_mask = cv2.threshold(contrast, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        tophat_mask = tophat_mask.astype(np.uint8)

        # 合并
        combined = cv2.bitwise_or(bright, grad_mask)
        combined = cv2.bitwise_or(combined, tophat_mask)
        if np.sum(combined) == 0:
            continue

        # 轻度连接 + 膨胀，覆盖文字笔画
        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
        combined = cv2.morphologyEx(combined, cv2.MORPH_CLOSE, kernel)
        combined = cv2.dilate(combined, kernel, iterations=2)

        # 始终用 inpainting 修复（比全区域高斯模糊更精确）
        wide_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (41, 5))
        combined = cv2.morphologyEx(combined, cv2.MORPH_CLOSE, wide_kernel)
        combined = cv2.dilate(combined, kernel, iterations=1)
        mask[y : y + rh, x : x + rw] = combined

    if np.sum(mask) == 0:
        return img

    return cv2.inpaint(img, mask, inpaintRadius=3, flags=cv2.INPAINT_TELEA)


def _inpaint_horizontal_bands(
    img: np.ndarray, gray: np.ndarray, bands: List[Tuple[int, int, int, int]]
) -> np.ndarray:
    """修复底部水平线水印：垂直插值，不产生模糊。

    对遮罩覆盖的每个像素，用其正上方和正下方的像素线性混合填充，
    避免 cv2.inpaint 带来的模糊扩散。
    """
    h, w = img.shape[:2]
    result = img.copy()

    for bx, by, bw, bh in bands:
        region = gray[by : by + bh, bx : bx + bw]

        # 亮度提取
        _, bright = cv2.threshold(region, 128, 255, cv2.THRESH_BINARY)
        # 梯度提取
        blurred = cv2.GaussianBlur(region, (3, 3), 0)
        sobelx = cv2.Sobel(blurred, cv2.CV_64F, 1, 0, ksize=3)
        sobely = cv2.Sobel(blurred, cv2.CV_64F, 0, 1, ksize=3)
        magnitude = np.sqrt(sobelx ** 2 + sobely ** 2)
        grad_thresh = max(float(np.mean(magnitude)) + float(np.std(magnitude)) * 0.5, 5.0)
        _, grad = cv2.threshold(magnitude, grad_thresh, 255, cv2.THRESH_BINARY)
        grad = grad.astype(np.uint8)

        combined = cv2.bitwise_or(bright, grad)
        if np.sum(combined) == 0:
            continue

        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
        combined = cv2.morphologyEx(combined, cv2.MORPH_CLOSE, kernel)
        combined = cv2.dilate(combined, kernel, iterations=1)

        # 水平连接文字笔画
        wide_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (21, 3))
        combined = cv2.morphologyEx(combined, cv2.MORPH_CLOSE, wide_kernel)

        # ── 垂直插值 ──────────────────────────────────────────
        # 对遮罩中的每个像素，用正上方 + 正下方像素按高度比例混合
        mask = combined > 0
        mask_rows, mask_cols = np.where(mask)

        if len(mask_rows) == 0:
            continue

        # 参考行：带上方一行 和 带下方一行
        src_above = max(0, by - 1)
        src_below = min(h - 1, by + bh)

        for my, mx in zip(mask_rows, mask_cols):
            px = bx + mx
            py = by + my
            # 权重：带内位置，顶端偏上方、底端偏下方
            t = my / max(bh, 1)
            weight_above = 1.0 - t
            weight_below = t
            for c in range(3):
                v = (int(img[src_above, px, c]) * weight_above +
                     int(img[src_below, px, c]) * weight_below)
                result[py, px, c] = np.clip(v, 0, 255).astype(np.uint8)

    return result


# ── 主入口 ────────────────────────────────────────────────────


def remove_watermark(path: str) -> Dict[str, Any]:
    """检测并去除图片水印，原地覆盖文件。

    Returns:
        {"success": bool, "action": str, "message": str, "details": dict}
    """
    p = Path(path)
    if not p.exists():
        return {"success": False, "message": "文件不存在"}

    ext = p.suffix.lower()
    if ext not in (".jpg", ".jpeg", ".png", ".webp", ".bmp"):
        return {"success": False, "message": f"不支持的图片格式: {ext}"}

    img = cv2.imread(str(p))
    if img is None:
        return {"success": False, "message": "图片文件损坏或格式不支持"}

    h, w = img.shape[:2]
    if h < 100 or w < 100:
        return {"success": False, "message": "图片尺寸过小，无法处理"}

    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    actions: List[str] = []
    details: Dict[str, Any] = {}

    # 1. 底边裁剪
    y_top = _detect_bottom_band(gray)
    if y_top is None:
        # 边缘密度法漏检时，用亮度峰值法检测半透明水印带
        y_top = _detect_bottom_bright_band(gray)
    if y_top is not None:
        img = img[:y_top, :]
        gray = gray[:y_top, :]
        actions.append("cropped")
        details["bottom_crop_y"] = int(y_top)
        logger.info("裁剪底部水印: y=%d (原高 %d)", y_top, h)

    # 2. 角标修复
    corner_regions = _detect_corner_regions(img, gray)
    if corner_regions:
        img = _inpaint_corners(img, corner_regions)
        actions.append("inpainted")
        details["corners_inpainted"] = len(corner_regions)
        logger.info("修复角标水印: %d 个区域", len(corner_regions))

    # 2.5 底部水平线水印检测（微博/小红书底部条纹文字）
    text_regions: List[Tuple[int, int, int, int]] = []
    horizontal_bands = _detect_bottom_horizontal_line(gray)
    if horizontal_bands:
        # 水平线水印使用专用修复（小半径 inpaint，避免模糊背景）
        img = _inpaint_horizontal_bands(img, gray, horizontal_bands)
        actions.append("text_inpainted")
        details["text_regions_inpainted"] = len(horizontal_bands)
        logger.info("修复水平线水印: %d 个区域", len(horizontal_bands))

    # 3. 小文字/半透明 logo 修复（微博/小红书样式）
    text_gray = gray
    text_boxes = _detect_text_watermarks(img, gray)
    if text_boxes:
        text_regions.extend(text_boxes)
        logger.info("文字水印检测: %d 个区域", len(text_boxes))
    if not text_boxes:
        # 低反差图：用 CLAHE 增强局部对比后重试
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        enhanced = clahe.apply(gray)
        text_boxes = _detect_text_watermarks(img, enhanced, val_gray=gray)
        if text_boxes:
            text_regions.extend(text_boxes)
            text_gray = enhanced
            logger.info("CLAHE 增强后检测到文字水印: %d 个区域", len(text_boxes))
    if not text_boxes:
        # 自适应阈值在右下角局部扫描半透明文字
        h2, w2 = gray.shape
        window = min(w2, h2, 600)
        if window >= 150:
            x0, y0 = w2 - window, h2 - window
            sub_gray = gray[y0:h2, x0:w2]
            binary = cv2.adaptiveThreshold(
                sub_gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
                cv2.THRESH_BINARY, 31, -8
            )
            k = cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5))
            closed = cv2.morphologyEx(binary, cv2.MORPH_CLOSE, k)
            closed = cv2.dilate(closed, k, iterations=1)
            contours, _ = cv2.findContours(closed, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            adaptive_boxes: List[Tuple[int, int, int, int]] = []
            for cnt in contours:
                area = cv2.contourArea(cnt)
                if area < 40:
                    continue
                cx_, cy_, cw_, ch_ = cv2.boundingRect(cnt)
                if cw_ > window * 0.7 or ch_ > window * 0.4:
                    continue
                aspect = cw_ / max(ch_, 1)
                if aspect < 0.15 or aspect > 8:
                    continue
                adaptive_boxes.append((cx_ + x0, cy_ + y0, cw_, ch_))
            if adaptive_boxes:
                adaptive_valid = _merge_text_boxes(adaptive_boxes, gray, w2, h2)
                if adaptive_valid:
                    text_regions.extend(adaptive_valid)
                    text_gray = gray
                    logger.info("自适应阈值检测到文字水印: %d 个区域", len(adaptive_valid))

    if text_regions:
        img = _inpaint_text_regions(img, text_gray, text_regions)
        actions.append("text_inpainted")
        details["text_regions_inpainted"] = details.get("text_regions_inpainted", 0) + len(text_regions)
        logger.info("修复文字水印: %d 个区域", len(text_regions))

    if not actions:
        return {"success": True, "action": "none", "message": "未检测到水印，图片无需处理"}

    # 保存：格式保持原样
    try:
        if ext in (".jpg", ".jpeg"):
            cv2.imwrite(str(p), img, [cv2.IMWRITE_JPEG_QUALITY, 95])
        elif ext == ".png":
            cv2.imwrite(str(p), img)
        elif ext == ".webp":
            cv2.imwrite(str(p), img, [cv2.IMWRITE_WEBP_QUALITY, 95])
        else:
            cv2.imwrite(str(p), img)
    except OSError as e:
        return {"success": False, "message": f"文件写入失败: {e}"}

    action_str = "+".join(actions)
    size_after = p.stat().st_size
    details["size_after"] = size_after
    details["new_dimensions"] = f"{img.shape[1]}x{img.shape[0]}"

    msg_parts = []
    if "cropped" in actions:
        msg_parts.append(f"裁剪底部水印（{details.get('bottom_crop_y', '?')}px 处）")
    if "inpainted" in actions:
        msg_parts.append(f"修复 {details.get('corners_inpainted', '?')} 处角标")
    if "text_inpainted" in actions:
        msg_parts.append(f"修复 {details.get('text_regions_inpainted', '?')} 处文字水印")

    return {
        "success": True,
        "action": action_str,
        "message": "水印已去除：" + "，".join(msg_parts),
        "details": details,
    }
