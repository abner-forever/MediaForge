"""api_key_store 模块单元测试。"""

from __future__ import annotations

from pathlib import Path

from utils.api_key_store import get_api_key, read_api_keys, save_api_keys


class TestApiKeyStore:
    def test_no_file_returns_empty(self, temp_data_dir: Path):
        assert read_api_keys() == {}

    def test_save_and_read(self, temp_data_dir: Path):
        save_api_keys({"provider_a": "key_123"})
        assert get_api_key("provider_a") == "key_123"

    def test_get_not_found(self, temp_data_dir: Path):
        assert get_api_key("nonexistent") == ""

    def test_save_empty_removes(self, temp_data_dir: Path):
        save_api_keys({"provider_a": "key_123"})
        save_api_keys({"provider_a": ""})
        assert get_api_key("provider_a") == ""

    def test_multiple_providers(self, temp_data_dir: Path):
        save_api_keys({"p1": "k1", "p2": "k2"})
        assert get_api_key("p1") == "k1"
        assert get_api_key("p2") == "k2"
