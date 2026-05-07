"""weibo2wechat 桌面应用入口。

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

    window = webview.create_window(
        title="图文工坊",
        url=url,
        width=1280,
        height=900,
        min_size=(960, 640),
        text_select=True,
    )
    webview.start(debug=False)


if __name__ == "__main__":
    main()
