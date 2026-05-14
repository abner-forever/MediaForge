"""pathsafe 工具模块单元测试。"""

from __future__ import annotations

from utils.pathsafe import sanitize_segment


class TestSanitizeSegment:
    def test_normal(self):
        assert sanitize_segment("艺人A") == "艺人A"

    def test_strips_invalid_chars(self):
        assert "/" not in sanitize_segment("a/b\\c")
        assert ":" not in sanitize_segment("a:b")

    def test_truncates_long(self):
        s = sanitize_segment("a" * 300, max_len=200)
        assert len(s) <= 200

    def test_empty_input(self):
        result = sanitize_segment("")
        assert result == "未命名"
        # 全是空白
        result2 = sanitize_segment("   ")
        assert result2 == "未命名"

    def test_strips_leading_trailing_dots(self):
        result = sanitize_segment("..test..")
        assert not result.startswith(".")
        assert not result.endswith(".")

    def test_newlines_and_tabs(self):
        result = sanitize_segment("test\nnew\tline")
        assert "\n" not in result
        assert "\t" not in result

    def test_unicode(self):
        result = sanitize_segment("✨测试🌟")
        assert "✨测试🌟" == result

    def test_custom_max_len(self):
        result = sanitize_segment("hello world", max_len=5)
        assert len(result) <= 5
