"""main.py CLI 入口单元测试。"""

from __future__ import annotations

import pytest


class TestParseArgs:
    def test_defaults(self, mock_settings):
        import sys
        sys.argv = ["main.py"]
        from main import parse_args
        args = parse_args()
        assert args.limit == 3
        assert args.dry_run is False
        assert args.ignore_post_cache is False

    def test_overrides(self, mock_settings):
        import sys
        sys.argv = ["main.py", "--limit", "2", "--dry-run", "--ignore-post-cache"]
        from main import parse_args
        args = parse_args()
        assert args.limit == 2
        assert args.dry_run is True
        assert args.ignore_post_cache is True


class TestLoadCache:
    def _patch_main_path(self, monkeypatch):
        """辅助：让 main 模块的 POSTS_CACHE_PATH 指向当前的临时路径。"""
        import main
        import config as config_module
        monkeypatch.setattr(main, "POSTS_CACHE_PATH", config_module.POSTS_CACHE_PATH)
        return main

    def test_old_format_list(self, mock_settings, monkeypatch):
        """旧格式列表 → 转换为 dict 格式。"""
        main = self._patch_main_path(monkeypatch)
        main.POSTS_CACHE_PATH.write_text('["hash1", "hash2"]', encoding="utf-8")
        cache = main._load_cache()
        assert cache["post_hashes"] == {"hash1", "hash2"}
        assert cache["post_ids"] == set()

    def test_new_format_dict(self, mock_settings, monkeypatch):
        """新格式字典正常解析。"""
        main = self._patch_main_path(monkeypatch)
        main.POSTS_CACHE_PATH.write_text(
            '{"post_ids": ["id1"], "post_hashes": ["hash1"]}', encoding="utf-8"
        )
        cache = main._load_cache()
        assert cache["post_ids"] == {"id1"}
        assert cache["post_hashes"] == {"hash1"}

    def test_missing_file(self, mock_settings, monkeypatch):
        """不存在的文件返回空集合。"""
        main = self._patch_main_path(monkeypatch)
        cache = main._load_cache()
        assert cache["post_ids"] == set()
        assert cache["post_hashes"] == set()
