"""微博平台单元测试。

测试纯函数部分：infer_scene_from_post_text, _extract_xsrf_token,
_strip_simple_html, _extract_images, _post_from_card, _finalize_post_meta。
"""

from __future__ import annotations

from unittest.mock import patch

import pytest

from services.platforms.weibo import (
    _extract_images,
    _extract_xsrf_token,
    _finalize_post_meta,
    _post_from_card,
    _strip_simple_html,
    infer_scene_from_post_text,
)


class TestInferScene:
    def test_match_shortest_not_preferred(self, mock_settings):
        """内置词「红毯」应被匹配。"""
        assert infer_scene_from_post_text("今天走了红毯") == "红毯"

    def test_longest_match_wins(self, mock_settings):
        """长词`巴黎时装周`应优先于短词`时装周`。"""
        assert infer_scene_from_post_text("巴黎时装周太美了") == "巴黎时装周"

    def test_empty_text(self, mock_settings):
        assert infer_scene_from_post_text("") == "日常"

    def test_no_match(self, mock_settings):
        assert infer_scene_from_post_text("今天天气不错") == "日常"

    def test_extra_tags_wins(self, mock_settings):
        import os
        os.environ["WEIBO_SCENE_EXTRA_TAGS"] = "定制标签"
        import config as config_module
        config_module.reload_settings()
        assert infer_scene_from_post_text("这是一条定制标签测试") == "定制标签"


class TestExtractXsrfToken:
    def test_found(self):
        cookie = "XSRF-TOKEN=abc123; other=val"
        assert _extract_xsrf_token(cookie) == "abc123"

    def test_not_found(self):
        assert _extract_xsrf_token("SOMETHING=else") == ""


class TestStripSimpleHtml:
    def test_strips_tags(self):
        assert _strip_simple_html("<p>hello</p>") == "hello"

    def test_replaces_nbsp(self):
        assert _strip_simple_html("hello&nbsp;world") == "hello world"

    def test_no_html(self):
        assert _strip_simple_html("plain text") == "plain text"


class TestExtractImages:
    def test_bmiddle_pic(self):
        item = {"bmiddle_pic": "https://weibo.com/test.jpg"}
        urls = _extract_images(item)
        assert urls == ["https://weibo.com/test.jpg"]

    def test_retweeted_status(self):
        item = {"retweeted_status": {"bmiddle_pic": "https://weibo.com/rt.jpg"}}
        urls = _extract_images(item)
        assert "https://weibo.com/rt.jpg" in urls

    def test_empty(self):
        assert _extract_images({}) == []

    def test_deduplicate(self):
        item = {
            "bmiddle_pic": "https://weibo.com/dup.jpg",
            "pics": [{"large": {"url": "https://weibo.com/dup.jpg"}}],
        }
        urls = _extract_images(item)
        assert len(urls) == 1

    def test_pic_infos(self):
        item = {"pic_infos": {"p1": {"largest": {"url": "https://weibo.com/p1.jpg"}}}}
        urls = _extract_images(item)
        assert "https://weibo.com/p1.jpg" in urls


class TestPostFromCard:
    def test_valid_card(self, mock_settings):
        card = {
            "id": "12345",
            "text_raw": "测试正文",
            "bmiddle_pic": "https://weibo.com/img.jpg",
            "user": {"screen_name": "测试用户"},
            "created_at": "2024-01-01",
        }
        result = _post_from_card(card, celebrity="测试", source="search")
        assert result is not None
        assert result["id"] == "12345"
        assert result["text"] == "测试正文"
        assert result["images"] == ["https://weibo.com/img.jpg"]
        assert result["celebrity"] == "测试"

    def test_no_images(self, mock_settings):
        assert _post_from_card({"id": "1"}, celebrity="", source="") is None

    def test_retweeted_images_counted(self, mock_settings):
        """转发帖子的图片也应被提取。"""
        card = {
            "id": "1",
            "text_raw": "转发",
            "retweeted_status": {
                "bmiddle_pic": "https://weibo.com/rt.jpg",
                "user": {"screen_name": "原用户"},
            },
            "user": {"screen_name": "转发用户"},
        }
        result = _post_from_card(card, celebrity="测试", source="search")
        assert result is not None
        assert "https://weibo.com/rt.jpg" in result["images"]


class TestFinalizePostMeta:
    def test_fills_empty_celebrity(self):
        result = _finalize_post_meta({"celebrity": "", "scene": "日常"})
        assert result["celebrity"] == "未命名艺人"

    def test_keeps_valid_celebrity(self):
        result = _finalize_post_meta({"celebrity": "明星A", "scene": "美图"})
        assert result["celebrity"] == "明星A"

    def test_infers_scene_from_text(self, mock_settings):
        result = _finalize_post_meta({"celebrity": "明星A", "scene": "", "text": "今天的红毯造型"})
        assert result["scene"] == "红毯"

    def test_default_scene_when_no_text(self, mock_settings):
        result = _finalize_post_meta({"celebrity": "明星A", "scene": ""})
        assert result["scene"] == "日常"
