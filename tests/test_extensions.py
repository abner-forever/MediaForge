"""extensions 模块单元测试。

测试策略：纯函数直接测试，Vision API 调用使用 patch 拦截 requests.post，
启发式评分通过 mock watermark.watermark_metrics 来控制分支。
"""

from __future__ import annotations

from pathlib import Path
from unittest.mock import Mock, patch

import pytest

from services.extensions import (
    _image_to_base64_url,
    _resolve_vision_url,
    _score_with_heuristic,
    _score_with_vision,
    build_html,
    score_image,
    score_images_batch,
    select_cover,
)


class TestResolveVisionUrl:
    def test_deepseek_url(self, mock_settings):
        import os
        os.environ["AI_PROVIDER"] = "deepseek"
        os.environ["AI_BASE_URL"] = ""
        import config as config_module
        config_module.reload_settings()
        url = _resolve_vision_url()
        assert "api.deepseek.com" in url

    def test_mimo_no_base(self, mock_settings):
        import os
        os.environ["AI_PROVIDER"] = "mimo"
        os.environ["AI_BASE_URL"] = ""
        import config as config_module
        config_module.reload_settings()
        assert _resolve_vision_url() == ""


class TestImageToBase64Url:
    def test_jpg_mime(self, sample_images: Path):
        url = _image_to_base64_url(str(sample_images / "gradient.jpg"))
        assert url.startswith("data:image/jpeg;base64,")

    def test_png_mime(self, sample_images: Path):
        url = _image_to_base64_url(str(sample_images / "blank.png"))
        assert url.startswith("data:image/png;base64,")

    def test_gif_mime(self, sample_images: Path):
        url = _image_to_base64_url(str(sample_images / "multiframe.gif"))
        assert url.startswith("data:image/gif;base64,")


class TestScoreWithVision:
    def test_success(self, mock_settings, sample_images: Path):
        import os
        os.environ["AI_PROVIDER"] = "openai"
        os.environ["AI_BASE_URL"] = "https://api.openai.com/v1"
        os.environ["AI_API_KEY"] = "sk-test"
        import config as config_module
        config_module.reload_settings()

        mock_resp = Mock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {
            "choices": [{"message": {"content": '{"score": 85, "reason": "清晰美观"}'}}],
        }
        with patch("requests.post", return_value=mock_resp):
            score, reason = _score_with_vision(str(sample_images / "blank.png"))
            assert score == 85
            assert reason == "清晰美观"

    def test_api_error(self, mock_settings, sample_images: Path):
        import os
        os.environ["AI_PROVIDER"] = "openai"
        os.environ["AI_BASE_URL"] = "https://api.openai.com/v1"
        os.environ["AI_API_KEY"] = "sk-test"
        import config as config_module
        config_module.reload_settings()

        mock_resp = Mock()
        mock_resp.status_code = 400

        with patch("requests.post", return_value=mock_resp):
            score, reason = _score_with_vision(str(sample_images / "blank.png"))
            assert score == -1
            assert reason == ""


class TestScoreWithHeuristic:
    @patch("services.watermark.watermark_metrics", return_value=(0.5, 0.8))
    def test_clean(self, mock_metrics):
        score, reason = _score_with_heuristic("dummy.png")
        assert score == 85
        assert "无水印" in reason

    @patch("services.watermark.watermark_metrics", return_value=(1.1, 0.9))
    def test_mild(self, mock_metrics):
        score, reason = _score_with_heuristic("dummy.png")
        assert score == 65
        assert "轻微" in reason

    @patch("services.watermark.watermark_metrics", return_value=(1.3, 1.1))
    def test_suspect(self, mock_metrics):
        score, reason = _score_with_heuristic("dummy.png")
        assert score == 40
        assert "疑似" in reason

    @patch("services.watermark.watermark_metrics", return_value=(1.5, 1.3))
    def test_obvious(self, mock_metrics):
        score, reason = _score_with_heuristic("dummy.png")
        assert score == 20
        assert "明显" in reason

    @patch("services.watermark.watermark_metrics", side_effect=Exception("test"))
    def test_exception(self, mock_metrics):
        score, reason = _score_with_heuristic("dummy.png")
        assert score == 50
        assert "异常" in reason


class TestScoreImage:
    @patch("services.extensions._score_with_vision", return_value=(90, "好图"))
    def test_vision_first(self, mock_vision, sample_images: Path):
        result = score_image(str(sample_images / "blank.png"), use_vision=True)
        assert result["score"] == 90
        assert result["method"] == "vision"

    @patch("services.extensions._score_with_vision", return_value=(-1, ""))
    @patch("services.extensions._score_with_heuristic", return_value=(85, "无水印嫌疑"))
    def test_fallback_to_heuristic(self, mock_heuristic, mock_vision, sample_images: Path):
        result = score_image(str(sample_images / "blank.png"), use_vision=True)
        assert result["method"] == "heuristic"
        assert result["score"] == 85

    @patch("services.extensions._score_with_heuristic", return_value=(40, "疑似水印"))
    def test_heuristic_only(self, mock_heuristic, sample_images: Path):
        result = score_image(str(sample_images / "blank.png"), use_vision=False)
        assert result["method"] == "heuristic"
        assert result["score"] == 40


class TestScoreImagesBatch:
    @patch("services.extensions._score_with_vision", side_effect=[(90, "好图"), (-1, "")])
    @patch("services.extensions._score_with_heuristic", return_value=(65, "轻微水印特征"))
    def test_mixed_methods(self, mock_heuristic, mock_vision, sample_images: Path):
        paths = [str(sample_images / "blank.png"), str(sample_images / "tiny.png")]
        results = score_images_batch(paths, use_vision=True)
        assert "vision" in results[paths[0]]["method"]
        assert "heuristic" in results[paths[1]]["method"]


class TestSelectCover:
    def test_empty_list(self):
        assert select_cover([]) == ""

    def test_first_image(self):
        images = ["img1.jpg", "img2.jpg", "img3.jpg"]
        assert select_cover(images) == "img1.jpg"


class TestBuildHtml:
    def test_with_images(self):
        html = build_html("描述文字", ["img1.jpg", "img2.jpg"])
        assert "描述文字" in html
        assert "<section" in html
        # 图片由 wechat.py 通过文件上传处理，不再内嵌到 HTML 中
        assert "img1.jpg" not in html

    def test_empty_images(self):
        html = build_html("只有文字", [])
        assert "只有文字" in html
        assert "<img" not in html

    def test_paragraphs(self):
        html = build_html("第一段\n\n第二段", [])
        assert "<p" in html
        # 两段分别包裹在 p 标签中，段落间有 margin 间距
        assert html.count("<p") == 2
        assert "第一段" in html
        assert "第二段" in html
        assert "margin" in html

    def test_line_breaks(self):
        html = build_html("第一行\n第二行", [])
        assert "第一行" in html
        assert "第二行" in html
        assert "<br>" in html or "<br/>" in html
