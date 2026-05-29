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

# 优先使用 CI 传入的 APP_VERSION（构建时 pyproject.toml 尚未被 semantic-release 更新）
# 兜底读取 pyproject.toml（本地构建场景）
import os, re
APP_VERSION = os.environ.get('APP_VERSION') or ''
if not APP_VERSION:
    _pyproject_path = PROJECT_ROOT / 'pyproject.toml'
    if _pyproject_path.exists():
        _match = re.search(r'^version\s*=\s*"([^"]+)"', _pyproject_path.read_text('utf-8'), re.M)
        APP_VERSION = _match.group(1) if _match else '0.0.0'
    else:
        APP_VERSION = '0.0.0'

# ── 自动生成应用图标（如果不存在）───────────────────────
# 确保 PyInstaller 构建产物拥有正确图标，而非 Python 默认小火箭
if system == 'Darwin':
    _mac_icon = PROJECT_ROOT / 'build' / 'app.icns'
    if not _mac_icon.exists():
        _src_icon = SPEC_DIR / 'static' / 'logo-icon.png'
        if _src_icon.exists():
            try:
                from PIL import Image
                import subprocess, shutil
                _img = Image.open(str(_src_icon))
                _size = min(_img.size)
                _left = (_img.width - _size) // 2
                _top = (_img.height - _size) // 2
                _img = _img.crop((_left, _top, _left + _size, _top + _size))
                _iconset = _mac_icon.parent / 'icon.iconset'
                _iconset.mkdir(parents=True, exist_ok=True)
                for _s in [16, 32, 64, 128, 256, 512, 1024]:
                    _resized = _img.resize((_s, _s), Image.LANCZOS)
                    _resized.save(str(_iconset / f'icon_{_s}x{_s}.png'))
                    if _s * 2 <= 1024:
                        _resized.save(str(_iconset / f'icon_{_s}x{_s}@2x.png'))
                subprocess.run(['iconutil', '-c', 'icns', str(_iconset), '-o', str(_mac_icon)], check=True)
                shutil.rmtree(_iconset)
                print(f"[build.spec] [OK] Auto-generated icon: {_mac_icon}")
            except Exception as _e:
                print(f"[build.spec] [WARN] Could not auto-generate .icns: {_e}")
elif system == 'Windows':
    _win_icon = SPEC_DIR / 'build' / 'app.ico'
    if not _win_icon.exists():
        _src_icon = SPEC_DIR / 'static' / 'logo-icon.png'
        if _src_icon.exists():
            try:
                from PIL import Image
                _win_icon.parent.mkdir(parents=True, exist_ok=True)
                _img = Image.open(str(_src_icon))
                _size = min(_img.size)
                _left = (_img.width - _size) // 2
                _top = (_img.height - _size) // 2
                _img = _img.crop((_left, _top, _left + _size, _top + _size))
                _img.save(str(_win_icon), sizes=[(256, 256)])
                print(f"[build.spec] [OK] Auto-generated icon: {_win_icon}")
            except Exception as _e:
                print(f"[build.spec] [WARN] Could not auto-generate .ico: {_e}")

block_cipher = None

# ── Playwright 浏览器打包 ─────────────────────────────
# 检测已安装的 Playwright 浏览器并包含到安装包中，用户无需手动 playwright install chromium
_all_datas = [
    # 前端静态资源（Vite 构建产物）
    (str(SPEC_DIR / 'static' / 'assets'), 'desktop/static/assets'),
    (str(SPEC_DIR / 'static' / 'index.html'), 'desktop/static'),
    (str(SPEC_DIR / 'static' / 'logo.png'), 'desktop/static'),
    (str(SPEC_DIR / 'static' / 'logo-icon.png'), 'desktop/static'),
    # 前端打包产物中的 js 和 vendor 目录（Vite 输出）
    (str(SPEC_DIR / 'static' / 'js'), 'desktop/static/js'),
    (str(SPEC_DIR / 'static' / 'vendor'), 'desktop/static/vendor'),
    # Windows 调试脚本
    (str(SPEC_DIR / 'run_console.bat'), 'desktop'),
    # 启动加载页
    (str(SPEC_DIR / 'loading.html'), 'desktop'),
]

# 显式包含 pywebview 包目录（某些发行版需要将 package files 一并收集）
try:
    import webview as _webview_mod
    _webview_path = Path(_webview_mod.__file__).resolve().parent
    if _webview_path.exists():
        _all_datas.append((str(_webview_path), 'webview'))
        print(f"[build.spec] [OK] Bundling pywebview: {_webview_path}")
except Exception as _e:
    print(f"[build.spec] [WARN] pywebview package not found or cannot be bundled: {_e}")

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
    # 只打包最新版本的 chromium（跳过 headless_shell，微信发布不需要）
    _chromium_dirs = []
    for _entry in sorted(_playwright_cache.iterdir()):
        if _entry.is_dir() and 'chromium' in _entry.name and 'headless' not in _entry.name:
            _chromium_dirs.append(_entry)

    if _chromium_dirs:
        # 只保留最新版本（列表已排序，最后一个版本号最大）
        _latest = _chromium_dirs[-1]
        _target = 'ms-playwright/' + _latest.name
        _all_datas.append((str(_latest), _target))
        print(f"[build.spec] [OK] Bundling Playwright (latest only): {_latest.name}")
        if len(_chromium_dirs) > 1:
            _skipped = [d.name for d in _chromium_dirs[:-1]]
            print(f"[build.spec] [INFO] Skipping older versions: {', '.join(_skipped)}")
    else:
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
        'services.platforms.xhs',        # 延迟导入，需显式声明
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
        'uvicorn.loops.asyncio',          # uvloop fallback（Windows 必须）
        'uvicorn.protocols',
        'uvicorn.protocols.http',
        'uvicorn.protocols.http.auto',
        'uvicorn.protocols.http.h11_impl', # httptools fallback（Windows 必须）
        'h11',                             # h11_impl 依赖
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
        # 不需要的 IDE/交互模块
        'jedi',
        'IPython',
        'ipykernel',
        'ipywidgets',
        # 不需要的消息队列/网络模块
        'zmq',
        'pyzmq',
        # 不需要的 GUI 工具包（已有 pywebview）
        'tkinter',
        '_tkinter',
        'tcl',
        '_tcl_data',
        '_tk_data',
        'ttk',
        # 不需要的测试/调试模块
        'unittest',
        'doctest',
        'pdb',
        'pydoc',
        # 其他不需要的模块
        'xmlrpc',
        'cgi',
        'cProfile',
        'profile',
        'pty',
        'pipes',
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
        strip=True,
        upx=True,
        upx_exclude=[],
        runtime_tmpdir=None,
        console=False,
        disable_windowed_traceback=False,
        argv_emulation=False,
        target_arch=None,  # 使用当前架构（避免 single-arch 原生库无法合并为 universal2）
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
        strip=True,
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
