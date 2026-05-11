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

    # macOS: 通过 AppKit 设置应用图标和名称
    try:
        from AppKit import NSImage, NSApplication, NSBundle
        icon_path = Path(__file__).parent / "static" / "logo.png"
        if icon_path.exists():
            img = NSImage.alloc().initWithContentsOfFile_(str(icon_path))
            if img:
                NSApplication.sharedApplication().setApplicationIconImage_(img)
        bundle = NSBundle.mainBundle()
        info = bundle.infoDictionary()
        if info is not None:
            info["CFBundleName"] = "图文工坊"
            info["CFBundleDisplayName"] = "图文工坊"
    except Exception:
        pass

    webview.start(debug=False)


if __name__ == "__main__":
    main()
