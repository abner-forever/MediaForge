"""file 工具模块单元测试。"""

from __future__ import annotations

from pathlib import Path

from utils.file import hash_text, read_json, write_json


class TestReadJson:
    def test_exists(self, tmp_path: Path):
        f = tmp_path / "test.json"
        f.write_text('{"a": 1}', encoding="utf-8")
        assert read_json(f, default={}) == {"a": 1}

    def test_not_exists(self, tmp_path: Path):
        f = tmp_path / "nonexistent.json"
        assert read_json(f, default=[]) == []

    def test_invalid_json(self, tmp_path: Path):
        f = tmp_path / "bad.json"
        f.write_text("not json", encoding="utf-8")
        assert read_json(f, default={}) == {}


class TestWriteJson:
    def test_creates_file(self, tmp_path: Path):
        f = tmp_path / "subdir" / "test.json"
        write_json(f, {"key": "value"})
        assert f.exists()
        content = f.read_text(encoding="utf-8")
        assert '"key"' in content
        assert '"value"' in content

    def test_overwrites(self, tmp_path: Path):
        f = tmp_path / "test.json"
        f.write_text('{"old": 1}', encoding="utf-8")
        write_json(f, {"new": 2})
        assert '"new"' in f.read_text(encoding="utf-8")


class TestHashText:
    def test_consistent(self):
        h1 = hash_text("hello")
        h2 = hash_text("hello")
        assert h1 == h2

    def test_different(self):
        assert hash_text("hello") != hash_text("world")
