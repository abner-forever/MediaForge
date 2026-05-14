"""settings_store 模块单元测试。"""

from __future__ import annotations

from pathlib import Path

from utils.settings_store import clear_settings, read_settings, write_settings


class TestSettingsStore:
    def test_no_file_returns_empty(self, temp_data_dir: Path):
        assert read_settings() == {}

    def test_bool_to_string(self, temp_data_dir: Path):
        write_settings({"bool_key": "true"})
        data = read_settings()
        assert data.get("bool_key") == "true"

    def test_numeric_to_string(self, temp_data_dir: Path):
        write_settings({"num": "123"})
        data = read_settings()
        assert data.get("num") == "123"

    def test_none_filtered(self, temp_data_dir: Path):
        write_settings({"key1": "val1"})
        data = read_settings()
        assert "key1" in data

    def test_write_merges(self, temp_data_dir: Path):
        write_settings({"a": "1"})
        write_settings({"b": "2"})
        data = read_settings()
        assert data.get("a") == "1"
        assert data.get("b") == "2"

    def test_empty_value_removes(self, temp_data_dir: Path):
        write_settings({"a": "1"})
        write_settings({"a": ""})
        data = read_settings()
        assert "a" not in data

    def test_clear(self, temp_data_dir: Path):
        write_settings({"a": "1"})
        clear_settings()
        assert read_settings() == {}

    def test_invalid_json(self, temp_data_dir: Path):
        import config
        f = config.DATA_DIR / "state" / "settings.json"
        f.parent.mkdir(parents=True, exist_ok=True)
        f.write_text("not json", encoding="utf-8")
        assert read_settings() == {}
