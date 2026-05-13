# -*- mode: python ; coding: utf-8 -*-
"""MediaForge PyInstaller 构建配置。

macOS: pyinstaller desktop/build.spec  →  dist/MediaForge.app
Windows: pyinstaller desktop/build.spec →  dist/MediaForge/MediaForge.exe
"""

import os
import sys
import platform
from pathlib import Path

system = platform.system()

# PyInstaller exec spec 文件时不注入 __file__，改用 sys.argv[0] 定位
_spec_path = Path(sys.argv[0])
if not _spec_path.is_absolute():
    _spec_path = Path.cwd() / _spec_path
SPEC_DIR = _spec_path.resolve().parent            # desktop/
PROJECT_ROOT = SPEC_DIR.parent                     # 项目根目录

# 从 pyproject.toml 读取版本号（兼容 Python 3.10，tomllib 需 3.11+）
import re
_pyproject_path = PROJECT_ROOT / 'pyproject.toml'
if _pyproject_path.exists():
    _match = re.search(r'^version\s*=\s*"([^"]+)"', _pyproject_path.read_text('utf-8'), re.M)
    APP_VERSION = _match.group(1) if _match else '0.0.0'
else:
    APP_VERSION = '0.0.0'

block_cipher = None

# ── Playwright 浏览器打包 ─────────────────────────────
# 检测已安装的 Playwright 浏览器并包含到安装包中，用户无需手动 playwright install chromium
_all_datas = [
    # 前端静态资源（Vite 构建产物）
    (str(SPEC_DIR / 'static' / 'assets'), 'desktop/static/assets'),
    (str(SPEC_DIR / 'static' / 'index.html'), 'desktop/static'),
    (str(SPEC_DIR / 'static' / 'logo.png'), 'desktop/static'),
    (str(SPEC_DIR / 'static' / 'logo-icon.png'), 'desktop/static'),
    # Windows 调试脚本
    (str(SPEC_DIR / 'run_console.bat'), 'desktop'),
]

# 自动检测 Playwright 浏览器缓存
_playwright_cache = None
if system == 'Darwin':
    _playwright_cache = Path.home() / 'Library' / 'Caches' / 'ms-playwright'
elif system == 'Windows':
    _playwright_cache = Path.home() / 'AppData' / 'Local' / 'ms-playwright'
elif system == 'Linux':
    _playwright_cache = Path.home() / '.cache' / 'ms-playwright'

# 优先使用 PLAYWRIGHT_BROWSERS_PATH 环境变量
_env_pw_path = os.environ.get('PLAYWRIGHT_BROWSERS_PATH')
if _env_pw_path:
    _playwright_cache = Path(_env_pw_path)

if _playwright_cache and _playwright_cache.exists():
    _found_any = False
    for _entry in sorted(_playwright_cache.iterdir()):
        if _entry.is_dir():
            # 只打包 chromium（firefox/webkit 不需要）
            if 'chromium' in _entry.name:
                _target = 'ms-playwright/' + _entry.name
                _all_datas.append((str(_entry), _target))
                _found_any = True
                print(f"[build.spec] [OK] Bundling Playwright: {_entry.name}")
    if not _found_any:
        print("[build.spec] [WARN] Playwright Chromium not found, skipping (run 'playwright install chromium' for WeChat publishing)")
else:
    print("[build.spec] [WARN] Playwright browser cache not found, skipping (run 'playwright install chromium' for WeChat publishing)")

# Runtime hook: set PLAYWRIGHT_BROWSERS_PATH in frozen app
_runtime_hook_path = str(SPEC_DIR / 'runtime_hook.py')
_runtime_hooks = [_runtime_hook_path] if os.path.exists(_runtime_hook_path) else []
if _runtime_hooks:
    print(f"[build.spec] [OK] Using runtime hook: {_runtime_hook_path}")
else:
    print(f"[build.spec] [WARN] Runtime hook not found: {_runtime_hook_path}")

a = Analysis(
    [str(SPEC_DIR / 'main.py')],
    pathex=[str(PROJECT_ROOT)],
    binaries=[],
    datas=_all_datas,
    hiddenimports=[
        # ── 项目模块 ──────────────────────────
        'config',
        'desktop.api',
        'desktop.app_state',
        'services',
        'services.ai',
        'services.downloader',
        'services.extensions',
        'services.platforms',
        'services.platforms.base',
        'services.platforms.weibo',
        'services.platforms.toutiao',
        'services.watermark',
        'services.wechat',
        'services.weibo',
        'services.weibo_login',
        'utils',
        'utils.audit',
        'utils.file',
        'utils.logger',
        'utils.pathsafe',
        # ── GUI ──────────────────────────────
        'webview',
        'webview.menu',
        # ── pywebview Windows 平台 ─────────────
        'webview.platforms.edgechromium',
        'webview.platforms.winforms',
        'webview.platforms.mshtml',
        'webview.platforms.cef',
        'clr',
        'clr.System',
        'clr.System.Windows.Forms',
        'clr.System.Drawing',
        'winreg',
        # ── ASGI 服务器 ──────────────────────
        'uvicorn',
        'uvicorn.loggers',
        'uvicorn.loops',
        'uvicorn.loops.auto',
        'uvicorn.protocols',
        'uvicorn.protocols.http',
        'uvicorn.protocols.http.auto',
        'uvicorn.protocols.websockets',
        'uvicorn.protocols.websockets.auto',
        'uvicorn.middleware',
        'uvicorn.middleware.wsgi',
        # ── FastAPI / Starlette ──────────────
        'fastapi',
        'fastapi.routing',
        'starlette',
        'starlette.routing',
        'starlette.middleware',
        'starlette.middleware.cors',
        'starlette.staticfiles',
        'starlette.responses',
        'pydantic',
        # ── 第三方 ───────────────────────────
        'dotenv',
        'PIL',
        'PIL._imaging',
        'PIL.Image',
        'PIL.ImageFilter',
        'PIL.ImageStat',
        'PIL.ImageOps',
        'requests',
        'openai',
        'playwright',
        'playwright.sync_api',
        'tenacity',
    ],
    hookspath=[],
    runtime_hooks=_runtime_hooks,
    excludes=[
        # 不需要的庞大模块
        'matplotlib',
        'scipy',
        'sympy',
        'notebook',
        'jupyter',
        'pandas',
        'tensorflow',
        'torch',
        'numpy',
        'pyarrow',
    ],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

if system == 'Darwin':
    # macOS: .app 包（BUNDLE 自动执行 COLLECT 逻辑）
    app_icon = PROJECT_ROOT / 'build' / 'app.icns'
    exe = EXE(
        pyz,
        a.scripts,
        exclude_binaries=True,
        name='MediaForge',
        debug=False,
        bootloader_ignore_signals=False,
        strip=False,
        upx=True,
        upx_exclude=[],
        runtime_tmpdir=None,
        console=False,
        disable_windowed_traceback=False,
        argv_emulation=False,
        target_arch=None,
        codesign_identity=None,
        entitlements_file=None,
    )
    app = BUNDLE(
        exe,
        a.binaries,
        a.zipfiles,
        a.datas,
        name='MediaForge.app',
        icon=str(app_icon) if app_icon.exists() else None,
        bundle_identifier='com.mediaforge.app',
        info_plist={
            'CFBundleName': '图文工坊',
            'CFBundleDisplayName': '图文工坊',
            'CFBundleExecutable': 'MediaForge',
            'CFBundleIdentifier': 'com.mediaforge.app',
            'CFBundleVersion': APP_VERSION,
            'CFBundleShortVersionString': APP_VERSION,
            'CFBundleDevelopmentRegion': 'zh_CN',
            'CFBundlePackageType': 'APPL',
            'LSMinimumSystemVersion': '10.15',
            'NSHighResolutionCapable': True,
            'NSRequiresAquaSystemAppearance': False,
        },
        version=APP_VERSION,
    )
elif system == 'Windows':
    # Windows: 单目录模式 → dist/MediaForge/MediaForge.exe
    app_icon = SPEC_DIR / 'build' / 'app.ico'
    exe = EXE(
        pyz,
        a.scripts,
        exclude_binaries=True,
        name='MediaForge',
        debug=False,
        bootloader_ignore_signals=False,
        strip=False,
        upx=True,
        upx_exclude=[],
        runtime_tmpdir=None,
        console=False,
        disable_windowed_traceback=False,
        argv_emulation=False,
        target_arch=None,
        codesign_identity=None,
        entitlements_file=None,
        icon=str(app_icon) if app_icon.exists() else None,
    )
    coll = COLLECT(
        exe,
        a.binaries,
        a.zipfiles,
        a.datas,
        name='MediaForge',
    )
