"""downloader 模块单元测试。

测试策略：_coerce_folder_label 直接测试，_download_one 和 download_images 使用
unittest.mock.patch 拦截 requests.get，mock watermark 模块来控制水印过滤逻辑。
"""

from __future__ import annotations

from pathlib import Path
from unittest.mock import Mock, patch

import pytest

from services.downloader import _coerce_folder_label, _download_one, download_images


class TestCoerceFolderLabel:
    def test_none(self):
        assert _coerce_folder_label(None, "fallback") == "fallback"

    def test_empty(self):
        assert _coerce_folder_label("", "fallback") == "fallback"

    def test_whitespace(self):
        assert _coerce_folder_label("  ", "fallback") == "fallback"

    def test_valid(self):
        assert _coerce_folder_label("艺人A", "fallback") == "艺人A"

    def test_stripped(self):
        assert _coerce_folder_label("  艺人A  ", "fallback") == "艺人A"


class TestDownloadOne:
    @patch("services.downloader.should_drop_as_watermarked", return_value=False)
    def test_already_exists_pass(self, mock_drop, tmp_path: Path):
        f = tmp_path / "existing.jpg"
        f.write_bytes(b"dummy")
        result = _download_one("http://example.com/img.jpg", f, overwrite=False)
        assert result == str(f)

    @patch("services.downloader.should_drop_as_watermarked", return_value=True)
    def test_already_exists_drop(self, mock_drop, tmp_path: Path):
        f = tmp_path / "existing.jpg"
        f.write_bytes(b"dummy")
        result = _download_one("http://example.com/img.jpg", f, overwrite=False)
        assert result is None

    def test_success(self, tmp_path: Path):
        f = tmp_path / "new.jpg"
        mock_resp = Mock()
        mock_resp.status_code = 200
        mock_resp.content = b"image_bytes"

        with patch("requests.get", return_value=mock_resp):
            with patch("services.downloader.should_drop_as_watermarked", return_value=False):
                result = _download_one("http://example.com/img.jpg", f, overwrite=True)
                assert result == str(f)
                assert f.read_bytes() == b"image_bytes"

    def test_http_error(self, tmp_path: Path):
        f = tmp_path / "fail.jpg"
        mock_resp = Mock()
        mock_resp.status_code = 404

        with patch("requests.get", return_value=mock_resp):
            result = _download_one("http://example.com/img.jpg", f, overwrite=True)
            assert result is None

    @patch("services.downloader.should_drop_as_watermarked", return_value=True)
    def test_downloaded_but_dropped(self, mock_drop, tmp_path: Path):
        f = tmp_path / "dropped.jpg"
        mock_resp = Mock()
        mock_resp.status_code = 200
        mock_resp.content = b"watermarked_img"

        with patch("requests.get", return_value=mock_resp):
            result = _download_one("http://example.com/img.jpg", f, overwrite=True)
            assert result is None


class TestDownloadImages:
    def test_empty_list(self, temp_data_dir):
        saved, dropped = download_images([], celebrity="test", scene="test", post_slug="test", prefix="test")
        assert saved == []
        assert dropped == 0

    def test_basic_download(self, temp_data_dir):
        mock_resp = Mock()
        mock_resp.status_code = 200
        mock_resp.content = b"img"

        with patch("requests.get", return_value=mock_resp):
            with patch("services.downloader.should_drop_as_watermarked", return_value=False):
                saved, dropped = download_images(
                    ["http://example.com/1.jpg", "http://example.com/2.jpg"],
                    celebrity="艺人",
                    scene="日常",
                    post_slug="post-1",
                    prefix="img",
                )
                assert len(saved) == 2
                assert dropped == 0

    def test_path_sanitization(self, temp_data_dir):
        mock_resp = Mock()
        mock_resp.status_code = 200
        mock_resp.content = b"img"

        with patch("requests.get", return_value=mock_resp):
            with patch("services.downloader.should_drop_as_watermarked", return_value=False):
                saved, _ = download_images(
                    ["http://example.com/1.jpg"],
                    celebrity="艺人/测试",
                    scene="日常:精选",
                    post_slug="post/1",
                    prefix="img",
                )
                assert len(saved) == 1

    def test_watermark_filter_count(self, temp_data_dir):
        mock_resp = Mock()
        mock_resp.status_code = 200
        mock_resp.content = b"img"

        call_count = [0]

        def side_effect(path):
            call_count[0] += 1
            return call_count[0] == 2  # 第二张图片返回 True(drop)

        with patch("requests.get", return_value=mock_resp):
            with patch("services.downloader.should_drop_as_watermarked", side_effect=side_effect):
                saved, dropped = download_images(
                    ["http://example.com/ok.jpg", "http://example.com/bad.jpg"],
                    celebrity="test",
                    scene="test",
                    post_slug="test",
                    prefix="test",
                )
                assert len(saved) == 1
                assert dropped >= 1

    def test_deduplication(self, temp_data_dir):
        mock_resp = Mock()
        mock_resp.status_code = 200
        mock_resp.content = b"img"

        with patch("requests.get", return_value=mock_resp):
            with patch("services.downloader.should_drop_as_watermarked", return_value=False):
                saved, _ = download_images(
                    ["http://example.com/img.jpg", "http://example.com/img.jpg"],
                    celebrity="test",
                    scene="test",
                    post_slug="test",
                    prefix="test",
                )
                assert len(saved) == 2
                assert saved[0] != saved[1]
