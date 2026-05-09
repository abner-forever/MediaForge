# -*- mode: python ; coding: utf-8 -*-
"""MediaForge PyInstaller 构建配置。

macOS: pyinstaller desktop/build.spec  →  dist/MediaForge.app
Windows: pyinstaller desktop/build.spec →  dist/MediaForge/MediaForge.exe
"""

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

# 从 pyproject.toml 读取版本号
import tomllib
_pyproject_path = PROJECT_ROOT / 'pyproject.toml'
if _pyproject_path.exists():
    _pyproject_data = tomllib.loads(_pyproject_path.read_text(encoding='utf-8'))
    APP_VERSION = _pyproject_data['project']['version']
else:
    APP_VERSION = '0.0.0'

block_cipher = None

a = Analysis(
    [str(SPEC_DIR / 'main.py')],
    pathex=[str(PROJECT_ROOT)],
    binaries=[],
    datas=[
        # 前端静态资源（Vite 构建产物）
        (str(SPEC_DIR / 'static' / 'assets'), 'desktop/static/assets'),
        (str(SPEC_DIR / 'static' / 'index.html'), 'desktop/static'),
        (str(SPEC_DIR / 'static' / 'logo.png'), 'desktop/static'),
        # .env 模板（首次运行可拷贝）
        (str(PROJECT_ROOT / '.env.example'), '.'),
    ],
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
        'utils',
        'utils.audit',
        'utils.env_manager',
        'utils.file',
        'utils.logger',
        'utils.pathsafe',
        # ── GUI ──────────────────────────────
        'webview',
        'webview.menu',
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
    runtime_hooks=[],
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
    ],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

if system == 'Darwin':
    # macOS: .app 包（BUNDLE 自动执行 COLLECT 逻辑）
    app_icon = SPEC_DIR / 'build' / 'app.icns'
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
            'CFBundleVersion': APP_VERSION,
            'CFBundleShortVersionString': APP_VERSION,
            'CFBundleDevelopmentRegion': 'zh_CN',
            'NSHighResolutionCapable': True,
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
