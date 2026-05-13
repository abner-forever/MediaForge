"""PyInstaller 运行时 Hook：在冻结应用的 Python 初始化阶段执行。

- 设置 PLAYWRIGHT_BROWSERS_PATH 环境变量
- 设置 macOS Dock 图标和进程名称，避免显示 Python 默认图标和名称
"""

import os
import sys


def _setup_playwright_browsers_path() -> None:
    """如果在 PyInstaller 打包环境中且有内置浏览器，设置浏览器路径。"""
    if not getattr(sys, "frozen", False):
        return

    meipass = getattr(sys, "_MEIPASS", None)
    if not meipass:
        return

    browser_path = os.path.join(meipass, "ms-playwright")
    if os.path.isdir(browser_path):
        os.environ["PLAYWRIGHT_BROWSERS_PATH"] = browser_path


def _set_dock_identity() -> None:
    """尽早设置 macOS Dock 图标和进程名称，避免显示 Python 默认火箭图标和名称。"""
    if not getattr(sys, "frozen", False):
        return
    if sys.platform != "darwin":
        return

    meipass = getattr(sys, "_MEIPASS", None)
    if not meipass:
        return

    try:
        from AppKit import NSImage, NSApplication, NSProcessInfo, NSString
        import ctypes, ctypes.util

        # ── 设置进程名称（Dock hover tooltip）──
        NSApplication.sharedApplication()
        NSProcessInfo.processInfo().setProcessName_("图文工坊")

        # 兜底：Carbon CPSSetProcessName 直接更新 Dock/Launch Services 名称
        carbon = ctypes.cdll.LoadLibrary(ctypes.util.find_library('Carbon'))

        class _PSN(ctypes.Structure):
            _fields_ = [('highLongOfPSN', ctypes.c_uint32), ('lowLongOfPSN', ctypes.c_uint32)]

        _psn = _PSN(0, 0)
        carbon.GetCurrentProcess(ctypes.byref(_psn))
        carbon.CPSSetProcessName(ctypes.byref(_psn), ctypes.c_void_p(id(NSString.stringWithString_("图文工坊"))))

        # ── 设置 Dock 图标 ──
        icon_path = os.path.join(meipass, "desktop", "static", "logo-icon.png")
        if os.path.isfile(icon_path):
            img = NSImage.alloc().initWithContentsOfFile_(icon_path)
            if img:
                NSApplication.sharedApplication().setApplicationIconImage_(img)
    except Exception:
        pass


_setup_playwright_browsers_path()
_set_dock_identity()
