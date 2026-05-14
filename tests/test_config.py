"""config 模块单元测试。

测试策略：_csv_tuple / _effective_weibo_fetch_mode 为纯函数直接测试。
Settings 单例通过 monkeypatch 环境变量后重建来验证。
"""

from __future__ import annotations

import os

import config as config_module


class TestCsvTuple:
    def test_empty(self):
        assert config_module._csv_tuple("") == ()

    def test_single(self):
        assert config_module._csv_tuple("a") == ("a",)

    def test_multiple(self):
        assert config_module._csv_tuple("a,b,c") == ("a", "b", "c")

    def test_chinese_comma(self):
        """中文逗号应被当作分隔符。"""
        result = config_module._csv_tuple("甲，乙")
        assert result == ("甲", "乙")

    def test_semicolons(self):
        """分号应被当作分隔符。"""
        assert config_module._csv_tuple("x;y;z") == ("x", "y", "z")

    def test_strip_whitespace(self):
        assert config_module._csv_tuple(" a , b ") == ("a", "b")

    def test_trailing_comma_ignored(self):
        assert config_module._csv_tuple("a,") == ("a",)


class TestEffectiveWeiboFetchMode:
    def test_known_own(self):
        assert config_module._effective_weibo_fetch_mode("own", ()) == "own"

    def test_known_celebrities(self):
        assert config_module._effective_weibo_fetch_mode("celebrities", ()) == "celebrities"

    def test_empty_with_celebrities(self):
        """mode 为空且有艺人列表时返回 celebrities。"""
        assert config_module._effective_weibo_fetch_mode("", ("艺人A",)) == "celebrities"

    def test_empty_without_celebrities(self):
        """mode 为空且无艺人列表时返回 own。"""
        assert config_module._effective_weibo_fetch_mode("", ()) == "own"

    def test_unknown_mode(self):
        """未知 mode 回退到 own。"""
        assert config_module._effective_weibo_fetch_mode("invalid", ()) == "own"


class TestSettingsDefaults:
    def test_default_ai_provider(self, mock_settings):
        assert config_module.settings.ai_provider == "mimo"

    def test_default_post_limit(self, mock_settings):
        assert config_module.settings.post_limit == 3

    def test_default_watermark_filter(self, mock_settings):
        assert config_module.settings.watermark_filter is True

    def test_default_retry_times(self, mock_settings):
        assert config_module.settings.retry_times == 2  # 我们设置的

    def test_env_override(self, monkeypatch, mock_settings):
        monkeypatch.setenv("AI_PROVIDER", "deepseek")
        config_module.reload_settings()
        assert config_module.settings.ai_provider == "deepseek"

    def test_reload_updates(self, monkeypatch, mock_settings, tmp_path):
        monkeypatch.setenv("AI_BASE_URL", "https://test.example.com")
        config_module.reload_settings()
        assert config_module.settings.ai_base_url == "https://test.example.com"
