"""ai 模块单元测试。

测试策略：_normalize_model_name 和 _resolve_chat_url_candidates 为纯函数，直接测试。
generate_content 有 HTTP 调用，使用 unittest.mock.patch 拦截 requests.post。
"""

from __future__ import annotations

import json
from unittest.mock import patch, Mock

import pytest

from services.ai import (
    _normalize_model_name,
    _resolve_chat_url_candidates,
    generate_content,
)


class TestNormalizeModelName:
    def test_mimo_unchanged(self):
        assert _normalize_model_name("mimo-chat") == "mimo-chat"

    def test_deepseek_chat(self):
        assert _normalize_model_name("deepseek-chat") == "deepseek-v4-flash"

    def test_deepseek_reasoner(self):
        assert _normalize_model_name("deepseek-reasoner") == "deepseek-v4-pro"

    def test_empty_default(self):
        assert _normalize_model_name("") == "mimo-chat"

    def test_none_default(self):
        assert _normalize_model_name(None) == "mimo-chat"  # type: ignore[arg-type]


class TestResolveChatUrlCandidates:
    def test_deepseek_default_url(self, mock_settings):
        import os
        os.environ["AI_PROVIDER"] = "deepseek"
        os.environ["AI_BASE_URL"] = ""
        import config as config_module
        config_module.reload_settings()
        urls = _resolve_chat_url_candidates()
        assert "api.deepseek.com" in urls[0]

    def test_glm_default_url(self, mock_settings):
        import os
        os.environ["AI_PROVIDER"] = "glm"
        os.environ["AI_BASE_URL"] = ""
        import config as config_module
        config_module.reload_settings()
        urls = _resolve_chat_url_candidates()
        assert "open.bigmodel.cn" in urls[0]

    def test_mimo_requires_explicit_base(self, mock_settings):
        import os
        os.environ["AI_PROVIDER"] = "mimo"
        os.environ["AI_BASE_URL"] = ""
        import config as config_module
        config_module.reload_settings()
        assert _resolve_chat_url_candidates() == []

    def test_custom_base_url(self, mock_settings):
        import os
        os.environ["AI_BASE_URL"] = "https://custom.com/v1"
        import config as config_module
        config_module.reload_settings()
        urls = _resolve_chat_url_candidates()
        assert any("custom.com" in u for u in urls)


class TestGenerateContent:
    def test_no_api_key(self, mock_settings):
        import os
        os.environ["AI_API_KEY"] = ""
        import config as config_module
        config_module.reload_settings()
        title, desc = generate_content("test content")
        assert title == "今日美图分享"
        assert desc == ""

    def test_no_base_url_for_mimo(self, mock_settings):
        import os
        os.environ["AI_PROVIDER"] = "mimo"
        os.environ["AI_BASE_URL"] = ""
        os.environ["AI_API_KEY"] = "sk-test"
        import config as config_module
        config_module.reload_settings()
        title, desc = generate_content("test")
        assert title == "今日美图分享"

    def test_successful_response(self, mock_settings):
        import os
        os.environ["AI_PROVIDER"] = "openai"
        os.environ["AI_BASE_URL"] = "https://api.openai.com/v1"
        os.environ["AI_API_KEY"] = "sk-test"
        os.environ["AI_MODEL"] = "gpt-4o-mini"
        import config as config_module
        config_module.reload_settings()

        mock_resp = Mock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {
            "choices": [{"message": {"content": '{"title": "测试标题"}'}}],
        }

        with patch("requests.post", return_value=mock_resp):
            title, desc = generate_content("some text")
            assert title == "测试标题"
            assert desc == ""

    def test_retry_on_500_then_success(self, mock_settings):
        import os
        os.environ["AI_PROVIDER"] = "openai"
        os.environ["AI_BASE_URL"] = "https://api.openai.com/v1"
        os.environ["AI_API_KEY"] = "sk-test"
        os.environ["RETRY_TIMES"] = "3"
        import config as config_module
        config_module.reload_settings()

        fail_resp = Mock()
        fail_resp.status_code = 500

        success_resp = Mock()
        success_resp.status_code = 200
        success_resp.json.return_value = {
            "choices": [{"message": {"content": '{"title": "重试成功"}'}}],
        }

        with patch("requests.post", side_effect=[fail_resp, success_resp]):
            title, desc = generate_content("text")
            assert title == "重试成功"

    def test_all_retries_fail(self, mock_settings):
        import os
        os.environ["AI_PROVIDER"] = "openai"
        os.environ["AI_BASE_URL"] = "https://api.openai.com/v1"
        os.environ["AI_API_KEY"] = "sk-test"
        os.environ["RETRY_TIMES"] = "2"
        import config as config_module
        config_module.reload_settings()

        fail_resp = Mock()
        fail_resp.status_code = 500

        with patch("requests.post", return_value=fail_resp):
            title, desc = generate_content("text")
            assert title == "今日美图分享"

    def test_empty_title_in_response(self, mock_settings):
        import os
        os.environ["AI_PROVIDER"] = "openai"
        os.environ["AI_BASE_URL"] = "https://api.openai.com/v1"
        os.environ["AI_API_KEY"] = "sk-test"
        os.environ["RETRY_TIMES"] = "1"
        import config as config_module
        config_module.reload_settings()

        mock_resp = Mock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {
            "choices": [{"message": {"content": '{"title": ""}'}}],
        }

        with patch("requests.post", return_value=mock_resp):
            title, desc = generate_content("text")
            assert title == "今日美图分享"

    def test_title_truncated_to_20_chars(self, mock_settings):
        import os
        os.environ["AI_PROVIDER"] = "openai"
        os.environ["AI_BASE_URL"] = "https://api.openai.com/v1"
        os.environ["AI_API_KEY"] = "sk-test"
        os.environ["RETRY_TIMES"] = "1"
        import config as config_module
        config_module.reload_settings()

        mock_resp = Mock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {
            "choices": [{"message": {"content": json.dumps({"title": "这是一个非常长的标题超过二十个字会被截断"})}}],
        }

        with patch("requests.post", return_value=mock_resp):
            title, desc = generate_content("text")
            assert len(title) <= 20
