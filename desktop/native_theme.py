"""macOS 原生窗口主题桥接。

在 main.py 中注册 PyWebView 窗口后，通过 API 路由调用 set_appearance
设置 NSWindow 的 appearance，使标题栏跟随 Dark/Light 模式。
"""

from __future__ import annotations

_window = None  # PyWebView Window 实例


def register(window: object) -> None:
    """注册 PyWebView 窗口实例。"""
    global _window
    _window = window


def set_appearance(theme: str) -> None:
    """设置 macOS 原生窗口 appearance。

    theme 取值: 'light' | 'dark' | 'auto'
    auto 时设为 None，让系统自动跟随。
    """
    if _window is None:
        return
    try:
        from AppKit import NSAppearance

        if theme == "dark":
            appearance = NSAppearance.appearanceNamed_("NSAppearanceNameDarkAqua")
        elif theme == "light":
            appearance = NSAppearance.appearanceNamed_("NSAppearanceNameAqua")
        else:
            appearance = None

        # 通过 PyObjC 调度到主线程 runloop 执行
        from PyObjCTools import AppHelper
        AppHelper.callAfter(_window.native.setAppearance_, appearance)
    except Exception:
        pass
