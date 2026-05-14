"""weibo_auth_store 模块单元测试。"""

from __future__ import annotations

from pathlib import Path

from utils.weibo_auth_store import (
    clear_weibo_auth,
    get_weibo_cookie,
    get_weibo_uid,
    read_weibo_auth,
    write_weibo_auth,
)


class TestWeiboAuthStore:
    def test_no_file_returns_empty(self, temp_data_dir: Path):
        assert read_weibo_auth() == {}

    def test_save_and_read(self, temp_data_dir: Path):
        write_weibo_auth(cookie="cookie123", uid="uid456")
        data = read_weibo_auth()
        assert data.get("cookie") == "cookie123"
        assert data.get("uid") == "uid456"

    def test_get_cookie(self, temp_data_dir: Path):
        write_weibo_auth(cookie="test_cookie", uid="test_uid")
        assert get_weibo_cookie() == "test_cookie"
        assert get_weibo_uid() == "test_uid"

    def test_clear(self, temp_data_dir: Path):
        write_weibo_auth(cookie="c", uid="u")
        clear_weibo_auth()
        assert get_weibo_cookie() == ""

    def test_overwrite(self, temp_data_dir: Path):
        write_weibo_auth(cookie="old", uid="old_uid")
        write_weibo_auth(cookie="new", uid="new_uid")
        assert get_weibo_cookie() == "new"
