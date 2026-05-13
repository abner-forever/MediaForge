"""PyInstaller 运行时 Hook：在冻结应用中设置 Playwright 浏览器路径。

当应用被打包为 PyInstaller 单文件/单目录应用时，Playwright 浏览器
会作为 data 文件被打包。此 hook 在应用启动时（main 脚本之前）设置
PLAYWRIGHT_BROWSERS_PATH 环境变量，让 Playwright 能正确找到内置浏览器。
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


_setup_playwright_browsers_path()
