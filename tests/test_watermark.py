"""watermark 模块单元测试。

测试策略：纯函数模块，核心逻辑是图像边缘检测和水印判定。
生成 PIL 图片测试 _rms_edges，用真实图片文件测试 watermark_metrics 和 should_drop_as_watermarked。
"""

from __future__ import annotations

from pathlib import Path
from unittest.mock import patch

import pytest
from PIL import Image, ImageDraw

from services.watermark import (
    _open_first_frame_rgb,
    _rms_edges,
    should_drop_as_watermarked,
    watermark_metrics,
)


class TestRmsEdges:
    def test_blank_image_has_low_rms(self):
        """纯色图片边缘 RMS 应较低（但 PIL FIND_EDGES 对纯色仍有微小响应）。"""
        im = Image.new("L", (100, 100), "white")
        rms = _rms_edges(im)
        # PIL 的 FIND_EDGES 对纯白也可能输出非零值，但应该低于高对比图
        assert rms < 60  # 纯白图的边缘响应在 PIL 中约 50

    def test_high_contrast(self):
        """棋盘格图片的 RMS 应显著高于纯色图。"""
        blank = Image.new("L", (100, 100), "white")
        blank_rms = _rms_edges(blank)

        im = Image.new("L", (100, 100), "white")
        draw = ImageDraw.Draw(im)
        for x in range(0, 100, 10):
            for y in range(0, 100, 10):
                if (x // 10 + y // 10) % 2 == 0:
                    draw.rectangle((x, y, x + 9, y + 9), fill="black")
        checker_rms = _rms_edges(im)
        assert checker_rms > blank_rms


class TestOpenFirstFrameRgb:
    def test_single_frame_jpg(self, sample_images: Path):
        """单帧 JPG 应正常转换为 RGB。"""
        path = sample_images / "gradient.jpg"
        im = _open_first_frame_rgb(path)
        assert im.mode == "RGB"

    def test_multiframe_gif(self, sample_images: Path):
        """多帧 GIF 应 seek 到第 0 帧并以 RGB 返回。"""
        path = sample_images / "multiframe.gif"
        im = _open_first_frame_rgb(path)
        assert im.mode == "RGB"

    def test_corrupt_file_raises(self, tmp_path: Path):
        """损坏文件应抛异常（由 caller 捕获）。"""
        path = tmp_path / "corrupt.bin"
        path.write_bytes(b"not an image")
        with pytest.raises(Exception):
            _open_first_frame_rgb(path)


class TestWatermarkMetrics:
    def test_nonexistent_file(self):
        """不存在的文件应返回 (0.0, 0.0)。"""
        r = watermark_metrics("/nonexistent/path.jpg")
        assert r == (0.0, 0.0)

    def test_too_small_image(self, sample_images: Path):
        """小于 120px 的图片应返回 (0.0, 0.0)。"""
        r = watermark_metrics(str(sample_images / "tiny.png"))
        assert r == (0.0, 0.0)

    def test_clean_blank_image(self, sample_images: Path):
        """纯白干净图片的 corner_ratio 和 bottom_ratio 应接近。"""
        cr, br = watermark_metrics(str(sample_images / "blank.png"))
        # 纯白图各处边缘响应接近，cr 和 br 差异不大
        assert abs(cr - br) < 0.2

    def test_corner_watermark_raised(self, sample_images: Path):
        """角标图片应显著抬高 corner_ratio。"""
        cr, br = watermark_metrics(str(sample_images / "corner_watermark.png"))
        # 角标使用高对比棋盘格，corner_ratio 应明显高于 1.0
        assert cr > 1.2, f"角标图 corner_ratio({cr}) 应明显大于 1.0"

    def test_png_alpha_channel(self, sample_images: Path):
        """RGBA PNG 应正常处理，不抛异常。"""
        cr, br = watermark_metrics(str(sample_images / "rgba.png"))
        assert isinstance(cr, float)
        assert isinstance(br, float)


class TestShouldDropAsWatermarked:
    @patch("config.settings")
    def test_filter_disabled(self, mock_settings, sample_images: Path):
        """watermark_filter=False 时永远不 drop。"""
        mock_settings.watermark_filter = False
        assert should_drop_as_watermarked(str(sample_images / "blank.png")) is False

    @patch("config.settings")
    def test_clean_image_not_dropped(self, mock_settings, sample_images: Path):
        """干净图片不应被过滤。"""
        mock_settings.watermark_filter = True
        mock_settings.watermark_corner_ratio = 10.0  # 极高阈值确保不过滤
        mock_settings.watermark_bottom_ratio = 10.0
        assert should_drop_as_watermarked(str(sample_images / "blank.png")) is False

    @patch("config.settings")
    def test_corner_watermark_dropped(self, mock_settings, sample_images: Path, tmp_path: Path):
        """角标图片应被过滤并删除文件。"""
        src = sample_images / "corner_watermark.png"
        copy = tmp_path / "corner_copy.png"
        copy.write_bytes(src.read_bytes())

        mock_settings.watermark_filter = True
        # 使用实际环境中有效的阈值
        mock_settings.watermark_corner_ratio = 1.38
        mock_settings.watermark_bottom_ratio = 5.0  # bottom 部分不触发

        dropped = should_drop_as_watermarked(str(copy))
        assert dropped is True
        assert not copy.exists(), "被水印过滤的图片应被删除"

    @patch("config.settings")
    def test_drop_missing_file_graceful(self, mock_settings, sample_images: Path):
        """文件在检查时已不存在，不应抛异常。"""
        mock_settings.watermark_filter = True
        mock_settings.watermark_corner_ratio = 1.38
        mock_settings.watermark_bottom_ratio = 1.48
        assert should_drop_as_watermarked(str(sample_images / "nonexistent.png")) is False
