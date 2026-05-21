"""MediaForge 桌面应用入口。

启动 FastAPI 后端 + PyWebView 原生窗口。
"""

from __future__ import annotations

import sys
import threading
from pathlib import Path

import uvicorn

# 确保项目根目录在 sys.path 中
PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))


def _get_icon_candidates() -> list[Path]:
    """返回应用图标候选路径列表，按优先级排列。"""
    _root = Path(__file__).parent.parent  # 项目根目录
    _desktop = Path(__file__).parent      # desktop/
    return [
        _desktop / "web" / "public" / "logo-icon.png",   # dev 模式：web/public
        _desktop / "static" / "logo-icon.png",            # build 后：static/
        _root / "build" / "app.icns",                     # 打包用 ICNS
    ]


def _set_dock_icon() -> bool:
    """遍历候选路径设置 NSApplication 图标，成功返回 True。"""
    from AppKit import NSImage, NSApplication
    NSApplication.sharedApplication()
    for p in _get_icon_candidates():
        if p.exists():
            img = NSImage.alloc().initWithContentsOfFile_(str(p))
            if img:
                NSApplication.sharedApplication().setApplicationIconImage_(img)
                return True
    return False


# macOS: 尽早设置 Dock 图标和进程名称，在 uvicorn/webview 等加载前执行
try:
    from AppKit import NSProcessInfo, NSApplication, NSString, NSImage
    import ctypes, ctypes.util

    _set_dock_icon()

    # 设置进程名称（Dock hover tooltip）
    NSProcessInfo.processInfo().setProcessName_("图文工坊")

    # Carbon CPSSetProcessName 兜底
    carbon = ctypes.cdll.LoadLibrary(ctypes.util.find_library('Carbon'))

    class _PSN(ctypes.Structure):
        _fields_ = [('highLongOfPSN', ctypes.c_uint32), ('lowLongOfPSN', ctypes.c_uint32)]

    _psn = _PSN(0, 0)
    carbon.GetCurrentProcess(ctypes.byref(_psn))
    carbon.CPSSetProcessName(ctypes.byref(_psn), ctypes.c_void_p(id(NSString.stringWithString_("图文工坊"))))
except Exception:
    pass

from config import ensure_dirs


def start_server(host: str = "127.0.0.1", port: int = 8765) -> None:
    """在子线程中启动 FastAPI 服务。"""
    from desktop.api import app

    uvicorn.run(app, host=host, port=port, log_level="warning")


def main() -> None:
    try:
        _start_app()
    except Exception:
        import traceback
        try:
            crash_log = PROJECT_ROOT / "data" / "logs" / "crash.log"
            crash_log.parent.mkdir(parents=True, exist_ok=True)
            crash_log.write_text(
                f"[{__import__('datetime').datetime.now()}]\n{traceback.format_exc()}",
                encoding="utf-8",
            )
        except Exception:
            pass
        raise


def _start_app() -> None:
    # macOS Dock 标识设置（非 frozen 模式的兜底，frozen 模式由 runtime_hook 处理）
    try:
        from AppKit import NSImage, NSApplication, NSBundle, NSProcessInfo, NSString
        import ctypes, ctypes.util

        NSApplication.sharedApplication()
        NSProcessInfo.processInfo().setProcessName_("图文工坊")

        # Carbon CPSSetProcessName 兜底
        carbon = ctypes.cdll.LoadLibrary(ctypes.util.find_library('Carbon'))
        class _PSN(ctypes.Structure):
            _fields_ = [('highLongOfPSN', ctypes.c_uint32), ('lowLongOfPSN', ctypes.c_uint32)]
        _psn = _PSN(0, 0)
        carbon.GetCurrentProcess(ctypes.byref(_psn))
        carbon.CPSSetProcessName(ctypes.byref(_psn), ctypes.c_void_p(id(NSString.stringWithString_("图文工坊"))))

        # 设置 Dock 图标
        _set_dock_icon()

        # 更新 bundle info 显示名称
        bundle = NSBundle.mainBundle()
        info = bundle.infoDictionary()
        if info is not None:
            info["CFBundleName"] = "图文工坊"
            info["CFBundleDisplayName"] = "图文工坊"
    except Exception:
        pass

    ensure_dirs()

    host = "127.0.0.1"
    port = 8765
    url = f"http://{host}:{port}"

    # 启动 FastAPI 服务线程
    server_thread = threading.Thread(target=start_server, args=(host, port), daemon=True)
    server_thread.start()

    # 等待服务就绪
    import time
    import requests
    for _ in range(30):
        try:
            requests.get(url, timeout=1)
            break
        except Exception:
            time.sleep(0.3)

    # 启动 PyWebView 窗口
    import webview
    from webview.menu import Menu, MenuAction, MenuSeparator

    webview.settings['SHOW_DEFAULT_MENUS'] = False

    localization = {
        'global.quitConfirmation': '确定要退出吗？',
        'global.ok': '好',
        'global.quit': '退出',
        'global.cancel': '取消',
        'global.saveFile': '保存文件',
        'cocoa.menu.about': '关于',
        'cocoa.menu.services': '服务',
        'cocoa.menu.view': '视图',
        'cocoa.menu.edit': '编辑',
        'cocoa.menu.hide': '隐藏',
        'cocoa.menu.hideOthers': '隐藏其他',
        'cocoa.menu.showAll': '显示全部',
        'cocoa.menu.quit': '退出',
        'cocoa.menu.fullscreen': '进入全屏',
        'cocoa.menu.cut': '剪切',
        'cocoa.menu.copy': '复制',
        'cocoa.menu.paste': '粘贴',
        'cocoa.menu.selectAll': '全选',
    }

    menus = [
        Menu("编辑", [
            MenuAction("撤销", lambda: None),
            MenuAction("重做", lambda: None),
            MenuSeparator(),
            MenuAction("剪切", lambda: None),
            MenuAction("复制", lambda: None),
            MenuAction("粘贴", lambda: None),
            MenuAction("全选", lambda: None),
        ]),
        Menu("窗口", [
            MenuAction("最小化", lambda: webview.windows[0].minimize() if webview.windows else None),
            MenuAction("缩放", lambda: webview.windows[0].maximize() if webview.windows else None),
        ]),
    ]

    window = webview.create_window(
        title="图文工坊",
        url=url,
        width=1280,
        height=900,
        min_size=(960, 640),
        text_select=True,
        menu=menus,
        localization=localization,
    )

    # PyWebView create_window 内部可能重置 Dock 图标与名称，在此重新设置
    _set_dock_icon()
    try:
        from AppKit import NSProcessInfo
        NSProcessInfo.processInfo().setProcessName_("图文工坊")
    except Exception:
        pass

    def _load_app_icon_nsimage() -> object | None:
        """加载应用图标为 NSImage 对象，供 NSAlert.setIcon_ 使用。"""
        try:
            from AppKit import NSImage
            for p in _get_icon_candidates():
                if p.exists():
                    img = NSImage.alloc().initWithContentsOfFile_(str(p))
                    if img:
                        return img
        except Exception:
            pass
        return None

    _app_icon_nsimage = _load_app_icon_nsimage()

    # 注册窗口关闭前检查
    def _before_close() -> bool:
        from desktop.app_state import app_state
        if app_state.publish_active:
            try:
                from AppKit import NSAlert, NSApplication
                NSApplication.sharedApplication()
                alert = NSAlert.alloc().init()
                alert.addButtonWithTitle_("退出")
                alert.addButtonWithTitle_("取消")
                alert.setMessageText_("正在发布公众号文章，确定要退出吗？")
                alert.setAlertStyle_(0)  # NSWarningAlertStyle
                if _app_icon_nsimage is not None:
                    alert.setIcon_(_app_icon_nsimage)
                return alert.runModal() == 1000  # NSAlertFirstButtonReturn
            except Exception:
                return True
        return True

    window.events.closing += _before_close

    def _set_main_thread_icon():
        """在主线程设置应用图标。"""
        try:
            from AppKit import NSImage, NSApplication
            for _p in _get_icon_candidates():
                if _p.exists():
                    _img = NSImage.alloc().initWithContentsOfFile_(str(_p))
                    if _img:
                        NSApplication.sharedApplication().setApplicationIconImage_(_img)
                        break
        except Exception:
            pass

    def _set_icon_after_start():
        """PyWebView 启动后通过主线程 runloop 设置图标。"""
        import time as _time
        _time.sleep(1)
        try:
            from PyObjCTools import AppHelper
            AppHelper.callAfter(_set_main_thread_icon)
        except Exception:
            pass

    webview.start(debug=False, func=_set_icon_after_start)


if __name__ == "__main__":
    main()
