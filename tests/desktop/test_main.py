"""测试 desktop/main.py：应用入口、Dock 图标等。"""

from __future__ import annotations

import socket
import sys
from pathlib import Path

import pytest

from desktop.dock_utils import get_icon_candidates, set_dock_icon
from desktop.main import _find_available_port, _is_port_free


class TestGetIconCandidates:
    def test_returns_list_of_paths(self) -> None:
        candidates = get_icon_candidates()
        assert isinstance(candidates, list)
        assert len(candidates) >= 2
        for c in candidates:
            assert isinstance(c, Path)

    def test_first_is_web_public(self) -> None:
        candidates = get_icon_candidates()
        assert candidates[0].name == "logo-icon.png"
        assert "web" in candidates[0].parts and "public" in candidates[0].parts

    def test_second_is_static(self) -> None:
        candidates = get_icon_candidates()
        assert "static" in candidates[1].parts

    def test_last_is_build_icns(self) -> None:
        candidates = get_icon_candidates()
        assert candidates[-1].suffix == ".icns"


class TestSetDockIcon:
    def test_returns_false_on_non_macos(self) -> None:
        """非 macOS 系统应直接返回 False，不抛出 ModuleNotFoundError。"""
        result = set_dock_icon()
        if sys.platform != "darwin":
            assert result is False
        # 如果运行在 macOS 上，不做断言（需要真实环境）


def test_is_port_free_can_detect_bound_port() -> None:
    host = "127.0.0.1"
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind((host, 0))
        busy_port = sock.getsockname()[1]
        assert _is_port_free(host, busy_port) is False


def test_find_available_port_skips_busy_port() -> None:
    host = "127.0.0.1"
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind((host, 0))
        busy_port = sock.getsockname()[1]
        sock.listen(1)
        selected_port = _find_available_port(host, busy_port, max_offset=5)
        assert selected_port != busy_port
        assert selected_port >= busy_port
        assert _is_port_free(host, selected_port)
