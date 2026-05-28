"""MediaForge 桌面应用入口。

启动 FastAPI 后端 + PyWebView 原生窗口。
"""

from __future__ import annotations

import socket
import sys
import threading
from pathlib import Path

# 注意：uvicorn 在 start_server 中按需导入，避免模块级加载拖慢启动

# 确保项目根目录在 sys.path 中
PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from desktop.dock_utils import APP_NAME, get_icon_candidates, set_dock_icon, setup_dock_identity

# macOS: 尽早设置 Dock 标识
try:
    setup_dock_identity()
except Exception:
    pass

from config import ensure_dirs


def _resolve_loading_html_path() -> Path:
    """返回一个存在的 loading.html 路径，兼容开发与 PyInstaller 打包后的多种位置。"""
    candidates = []
    candidates.append(Path(__file__).parent / "loading.html")

    meipass = getattr(sys, '_MEIPASS', None)
    if meipass:
        meipass = Path(meipass)
        candidates.extend([
            meipass / 'desktop' / 'loading.html',
            meipass / 'loading.html',
            meipass / '_internal' / 'loading.html',
            meipass / '_internal' / 'desktop' / 'loading.html',
        ])

    project_root = Path(__file__).resolve().parent.parent
    candidates.append(project_root / 'desktop' / 'loading.html')

    for c in candidates:
        try:
            if c.exists():
                return c
        except Exception:
            continue

    return Path(__file__).parent / 'loading.html'


def _is_port_free(host: str, port: int, timeout: float = 0.1) -> bool:
    """检查指定地址是否可用。"""
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            sock.settimeout(timeout)
            sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            sock.bind((host, port))
        return True
    except OSError:
        return False


def _find_available_port(host: str = "127.0.0.1", preferred_port: int = 8765, max_offset: int = 16) -> int:
    """优先使用首选端口，若被占用则查找下一个可用端口。"""
    for port in range(preferred_port, preferred_port + max_offset + 1):
        if _is_port_free(host, port):
            return port

    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind((host, 0))
        return sock.getsockname()[1]


def _make_loading_html(host: str, port: int) -> str:
    """生成启动加载页面 HTML，自动轮询后端服务直至就绪后跳转。"""
    import base64
    target_url = f"http://{host}:{port}"
    path = _resolve_loading_html_path()
    html = path.read_text(encoding="utf-8")
    html = html.replace("__TARGET_URL__", target_url)

    logo_candidates = [
        path.parent / "assets" / "logo.png",
        path.parent / "static" / "logo.png",
    ]
    for logo_path in logo_candidates:
        if logo_path.exists():
            logo_b64 = base64.b64encode(logo_path.read_bytes()).decode()
            html = html.replace("./assets/logo.png", f"data:image/png;base64,{logo_b64}")
            break

    return html


def start_server(host: str = "127.0.0.1", port: int = 8765) -> None:
    """在子线程中启动 FastAPI 服务。"""
    try:
        import uvicorn
        from desktop.api import app
        uvicorn.run(app, host=host, port=port, log_level="warning")
    except Exception:
        import traceback
        crash_log = PROJECT_ROOT / "data" / "logs" / "crash.log"
        try:
            crash_log.parent.mkdir(parents=True, exist_ok=True)
            crash_log.write_text(
                f"[{__import__('datetime').datetime.now()}]\n"
                f"[server_thread] uvicorn 启动失败:\n"
                f"{traceback.format_exc()}",
                encoding="utf-8",
            )
        except Exception:
            pass


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
    if sys.platform == "darwin":
        try:
            setup_dock_identity()
        except Exception:
            pass

    ensure_dirs()

    host = "127.0.0.1"
    preferred_port = 8765
    port = _find_available_port(host, preferred_port)
    if port != preferred_port:
        print(f"端口 {preferred_port} 已被占用，改用可用端口 {port}。")

    server_thread = threading.Thread(target=start_server, args=(host, port), daemon=True)
    server_thread.start()

    loading_html = _make_loading_html(host, port)

    # 启动 PyWebView 窗口
    try:
        import webview
    except ModuleNotFoundError:
        import webbrowser
        import time

        url = f"http://{host}:{port}/"
        print("警告: PyWebView 未安装或不可用，使用系统默认浏览器打开网页：", url)
        try:
            webbrowser.open(url)
        except Exception:
            print("打开浏览器失败，请手动访问：", url)

        print("后端服务已在子线程启动。按 Ctrl+C 可退出程序。")
        try:
            while server_thread.is_alive():
                time.sleep(1)
        except KeyboardInterrupt:
            pass
        return

    # 导入 webview.menu 子模块（兼容不同版本）
    try:
        from webview.menu import Menu, MenuAction, MenuSeparator
    except Exception:
        Menu = getattr(webview, "Menu", None)
        MenuAction = getattr(webview, "MenuAction", getattr(webview, "MenuItem", None))
        MenuSeparator = getattr(webview, "MenuSeparator", None)

        if Menu is None:
            class Menu:
                def __init__(self, title, items):
                    self.title = title
                    self.items = items

        if MenuAction is None:
            class MenuAction:
                def __init__(self, title, callback):
                    self.title = title
                    self.callback = callback

        if MenuSeparator is None:
            class MenuSeparator:
                pass

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

    menus = []

    window = webview.create_window(
        title=APP_NAME,
        html=loading_html,
        width=1280,
        height=900,
        min_size=(960, 640),
        text_select=True,
        menu=menus,
        localization=localization,
    )

    # Windows 11: 启用 Mica 半透明背景效果
    if sys.platform == "win32":
        def _apply_mica():
            import time
            time.sleep(0.5)
            try:
                import ctypes
                hwnd = int(window.native._winfo_id())
                hwnd = ctypes.windll.user32.GetParent(hwnd) or hwnd
                DWMWA_SYSTEMBACKDROP_TYPE = 38
                DWMSBT_MAINWINDOW = 2
                ctypes.windll.dwmapi.DwmSetWindowAttribute(
                    hwnd, DWMWA_SYSTEMBACKDROP_TYPE,
                    ctypes.byref(ctypes.c_int(DWMSBT_MAINWINDOW)),
                    ctypes.sizeof(ctypes.c_int),
                )
            except Exception:
                pass
        threading.Thread(target=_apply_mica, daemon=True).start()

    # 注册原生窗口
    try:
        from desktop.native_theme import register as _register_native
        _register_native(window)
    except Exception:
        pass

    # PyWebView create_window 可能重置 Dock 图标，在此重新设置
    set_dock_icon()
    if sys.platform == "darwin":
        try:
            from AppKit import NSProcessInfo
            NSProcessInfo.processInfo().setProcessName_(APP_NAME)
        except Exception:
            pass

    # 设置窗口缩略图图标
    try:
        from AppKit import NSImage
        for _p in get_icon_candidates():
            if _p.exists():
                _minimg = NSImage.alloc().initWithContentsOfFile_(str(_p))
                if _minimg:
                    window.native.setMiniwindowImage_(_minimg)
                    break
    except Exception:
        pass

    def _load_app_icon_nsimage() -> object | None:
        try:
            from AppKit import NSImage
            for p in get_icon_candidates():
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
                alert.setAlertStyle_(0)
                if _app_icon_nsimage is not None:
                    alert.setIcon_(_app_icon_nsimage)
                return alert.runModal() == 1000
            except Exception:
                return True
        return True

    window.events.closing += _before_close

    def _set_main_thread_icon():
        try:
            from AppKit import NSImage, NSApplication
            for _p in get_icon_candidates():
                if _p.exists():
                    _img = NSImage.alloc().initWithContentsOfFile_(str(_p))
                    if _img:
                        NSApplication.sharedApplication().setApplicationIconImage_(_img)
                        break
        except Exception:
            pass

    # ── macOS: 自定义 About 面板 ──
    _about_handler = None
    try:
        from AppKit import NSObject, NSApplication, NSImage
        import re

        _app_version = "0.0.0"
        _pyproject_path = Path(__file__).resolve().parent.parent / "pyproject.toml"
        if _pyproject_path.exists():
            _match = re.search(r'^version\s*=\s*"([^"]+)"', _pyproject_path.read_text("utf-8"), re.M)
            if _match:
                _app_version = _match.group(1)

        class _AboutHandler(NSObject):
            def handleAbout_(self, sender):
                opts = {
                    "ApplicationName": APP_NAME,
                    "ApplicationVersion": _app_version,
                }
                for _p in get_icon_candidates():
                    if _p.exists():
                        _img = NSImage.alloc().initWithContentsOfFile_(str(_p))
                        if _img:
                            opts["ApplicationIcon"] = _img
                        break
                NSApplication.sharedApplication().orderFrontStandardAboutPanelWithOptions_(opts)

        _about_handler = _AboutHandler.alloc().init()
    except Exception:
        pass

    def _patch_about_menu():
        if _about_handler is None:
            return
        try:
            from AppKit import NSApplication
            _app = NSApplication.sharedApplication()
            _main_menu = _app.mainMenu()
            if not _main_menu:
                return
            _app_menu_item = _main_menu.itemAtIndex_(0)
            if not _app_menu_item:
                return
            _app_menu = _app_menu_item.submenu()
            if not _app_menu:
                return
            _about_item = _app_menu.itemAtIndex_(0)
            if _about_item and _about_item.action() is not None:
                _about_item.setTarget_(_about_handler)
                _about_item.setAction_("handleAbout:")
        except Exception:
            pass

    def _set_icon_after_start():
        import time as _time
        _time.sleep(1)
        try:
            from PyObjCTools import AppHelper
            AppHelper.callAfter(_set_main_thread_icon)
            AppHelper.callAfter(_patch_about_menu)
        except Exception:
            pass

    webview.start(debug=False, func=_set_icon_after_start)


if __name__ == "__main__":
    main()
