"""macOS Dock 标识工具函数。

统一设置 Dock 图标、进程名称和 NSBundle 信息，
消除 main.py 和 runtime_hook.py 中的重复代码。
"""

from __future__ import annotations

import sys
from pathlib import Path

APP_NAME = "图文工坊"


def get_icon_candidates() -> list[Path]:
    """返回应用图标候选路径列表，按优先级排列。"""
    root = Path(__file__).resolve().parent.parent  # 项目根目录
    desktop = Path(__file__).resolve().parent      # desktop/
    return [
        desktop / "web" / "public" / "logo-icon.png",   # dev 模式
        desktop / "static" / "logo-icon.png",            # build 后
        root / "build" / "app.icns",                     # 打包用 ICNS
    ]


def set_dock_icon() -> bool:
    """遍历候选路径设置 NSApplication 图标，成功返回 True。"""
    if sys.platform != "darwin":
        return False
    try:
        from AppKit import NSImage, NSApplication
        NSApplication.sharedApplication()
        for p in get_icon_candidates():
            if p.exists():
                img = NSImage.alloc().initWithContentsOfFile_(str(p))
                if img:
                    NSApplication.sharedApplication().setApplicationIconImage_(img)
                    return True
    except Exception:
        pass
    return False


def setup_dock_identity() -> None:
    """设置 macOS Dock 图标、进程名、Bundle 信息。

    在非 frozen 模式下调用，frozen 模式由 runtime_hook 处理。
    """
    if sys.platform != "darwin":
        return
    try:
        from AppKit import NSProcessInfo, NSApplication, NSString, NSBundle
        import ctypes, ctypes.util

        # 1. 更新 NSBundle 信息
        bundle = NSBundle.mainBundle()
        info = bundle.infoDictionary()
        if info:
            info["CFBundleName"] = APP_NAME
            info["CFBundleDisplayName"] = APP_NAME

        # 2. 设置进程名称
        NSProcessInfo.processInfo().setProcessName_(APP_NAME)

        # 3. Carbon CPSSetProcessName 兜底
        carbon = ctypes.cdll.LoadLibrary(ctypes.util.find_library('Carbon'))

        class _PSN(ctypes.Structure):
            _fields_ = [('highLongOfPSN', ctypes.c_uint32), ('lowLongOfPSN', ctypes.c_uint32)]

        psn = _PSN(0, 0)
        carbon.GetCurrentProcess(ctypes.byref(psn))
        process_name = NSString.stringWithString_(APP_NAME)
        carbon.CPSSetProcessName(ctypes.byref(psn), ctypes.c_void_p(id(process_name)))

        # 4. 设置激活策略为 Regular（前台应用）
        NSApplication.sharedApplication().setActivationPolicy_(0)

        # 5. 设置 Dock 图标
        set_dock_icon()
    except Exception:
        pass
