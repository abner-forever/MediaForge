"""测试 desktop/main.py：应用入口、Dock 图标等。"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

from desktop.main import _get_icon_candidates, _set_dock_icon


class TestGetIconCandidates:
    def test_returns_list_of_paths(self) -> None:
        candidates = _get_icon_candidates()
        assert isinstance(candidates, list)
        assert len(candidates) >= 2
        for c in candidates:
            assert isinstance(c, Path)

    def test_first_is_web_public(self) -> None:
        candidates = _get_icon_candidates()
        assert candidates[0].name == "logo-icon.png"
        assert "web" in candidates[0].parts and "public" in candidates[0].parts

    def test_second_is_static(self) -> None:
        candidates = _get_icon_candidates()
        assert "static" in candidates[1].parts

    def test_last_is_build_icns(self) -> None:
        candidates = _get_icon_candidates()
        assert candidates[-1].suffix == ".icns"


class TestSetDockIcon:
    def test_returns_false_on_non_macos(self) -> None:
        """非 macOS 系统应直接返回 False，不抛出 ModuleNotFoundError。"""
        result = _set_dock_icon()
        if sys.platform != "darwin":
            assert result is False
        # 如果运行在 macOS 上，不做断言（需要真实环境）
