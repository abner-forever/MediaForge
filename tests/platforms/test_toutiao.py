"""今日头条平台单元测试。

测试纯函数部分：_strip_html, _extract_images, _post_from_item,
_merge_posts, _finalize_post_meta。
"""

from __future__ import annotations

from services.platforms.toutiao import (
    _extract_images,
    _finalize_post_meta,
    _merge_posts,
    _post_from_item,
    _strip_html,
)


class TestStripHtml:
    def test_strips_tags(self):
        assert _strip_html("<b>text</b>") == "text"

    def test_replaces_nbsp(self):
        assert _strip_html("a&nbsp;b") == "a b"

    def test_plain(self):
        assert _strip_html("plain text") == "plain text"


class TestExtractImages:
    def test_image_list(self):
        item = {"image_list": [{"url": "https://toutiao.com/img1.jpg"}, {"url": "https://toutiao.com/img2.jpg"}]}
        urls = _extract_images(item)
        assert len(urls) == 2
        assert "https://toutiao.com/img1.jpg" in urls

    def test_large_img_url_fallback(self):
        item = {"large_img_url": "https://toutiao.com/big.jpg"}
        urls = _extract_images(item)
        assert urls == ["https://toutiao.com/big.jpg"]

    def test_thumb_fallback(self):
        item = {"thumb_url": "https://toutiao.com/thumb.jpg"}
        urls = _extract_images(item)
        assert urls == ["https://toutiao.com/thumb.jpg"]

    def test_empty(self):
        assert _extract_images({}) == []

    def test_all_image_list(self):
        item = {"all_image_list": [{"url": "https://toutiao.com/a.jpg"}]}
        urls = _extract_images(item)
        assert "https://toutiao.com/a.jpg" in urls

    def test_query_string_cleaned(self):
        item = {"image_list": [{"url": "https://toutiao.com/img.jpg?x=1&y=2"}]}
        urls = _extract_images(item)
        assert urls == ["https://toutiao.com/img.jpg"]
        assert "?" not in urls[0]


class TestPostFromItem:
    def test_valid_item(self):
        item = {
            "id": "group_123",
            "title": "测试标题",
            "original_page_url": "http://m.toutiao.com/group/group_123/",
            "image_list": [{"url": "https://toutiao.com/img.jpg"}],
        }
        result = _post_from_item(item, celebrity="测试", source="keyword", scene="时尚")
        assert result is not None
        assert result["id"] == "group_123"
        assert "group_123" in result["id"]
        assert "https://toutiao.com/img.jpg" in result["images"]
        assert result["scene"] == "时尚"

    def test_no_images(self):
        assert _post_from_item({"id": "1"}, celebrity="", source="") is None

    def test_trailing_ellipsis_removed(self):
        item = {
            "id": "2",
            "title": "测试标题…",
            "image_list": [{"url": "https://toutiao.com/img.jpg"}],
        }
        result = _post_from_item(item, celebrity="", source="keyword", scene="时尚")
        assert result is not None
        assert not result["text"].endswith("…")

    def test_timestamp_conversion(self):
        import time
        ts = int(time.time())
        item = {
            "id": "3",
            "title": "带时间戳",
            "image_list": [{"url": "https://toutiao.com/img.jpg"}],
            "info": {"publish_time": ts},
        }
        result = _post_from_item(item, celebrity="", source="keyword", scene="时尚")
        assert result is not None
        assert result["created_at"]  # 应被转换为 ISO 格式

    def test_no_text_fallback(self):
        item = {
            "id": "4",
            "image_list": [{"url": "https://toutiao.com/img.jpg"}],
        }
        result = _post_from_item(item, celebrity="", source="keyword", scene="时尚")
        assert result is not None
        assert "时尚" in result["text"]


class TestMergePosts:
    def test_deduplication(self):
        posts = [{"id": "1"}, {"id": "2"}, {"id": "1"}]
        merged = _merge_posts([posts])
        assert len(merged) == 2


class TestFinalizePostMeta:
    def test_fills_empty_celebrity(self):
        r = _finalize_post_meta({"celebrity": "", "scene": "日常"})
        assert r["celebrity"] == "未命名艺人"

    def test_fills_empty_scene(self):
        r = _finalize_post_meta({"celebrity": "某用户", "scene": ""})
        assert r["scene"] == "日常"
