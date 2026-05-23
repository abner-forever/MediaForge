#!/bin/bash
# ============================================================
# MediaForge（图文工坊）本地构建脚本
# 使用: bash build_local.sh
# 功能: 构建前端 → PyInstaller 打包 → 生成安装包
# ============================================================
set -euo pipefail

# ── 颜色 ──────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[0;33m'
CYAN='\033[0;36m'; NC='\033[0m'
log()  { echo -e "${CYAN}[$(date +%H:%M:%S)]${NC} $1"; }
ok()   { echo -e "  ${GREEN}✓${NC} $1"; }
warn() { echo -e "  ${YELLOW}⚠${NC} $1"; }
fail() { echo -e "  ${RED}✗${NC} $1"; exit 1; }

# ── 检测系统 ──────────────────────────────────────────
OS="$(uname -s)"
ARCH="$(uname -m)"
case "$OS" in
  Darwin) OS_TYPE="macos" ;;
  Linux)  OS_TYPE="linux" ;;
  MINGW*|MSYS*|CYGWIN*) OS_TYPE="windows" ;;
  *)      fail "不支持的系统: $OS" ;;
esac

log "系统: $OS_TYPE / $ARCH"
log ""

PROJECT_ROOT="$(cd "$(dirname "$0")" && pwd)"
APP_VERSION="$(grep '^version\s*=' "$PROJECT_ROOT/pyproject.toml" | head -1 | sed 's/.*=\s*"\(.*\)"/\1/')"
log "版本: $APP_VERSION"

# ── 0. 检查前置依赖 ─────────────────────────────────
log "${YELLOW}[1/5]${NC} 检查前置依赖..."
command -v node  >/dev/null 2>&1 || fail "请先安装 Node.js"
command -v npm   >/dev/null 2>&1 || fail "请先安装 npm"
command -v python3 >/dev/null 2>&1 || fail "请先安装 Python 3"
python3 -c "import sys; sys.exit(0 if sys.version_info >= (3,10) else 1)" 2>/dev/null || fail "Python 版本过低，需要 >=3.10"
ok "依赖检查通过"

# ── 1. 安装 Python 依赖 ──────────────────────────────
log "${YELLOW}[2/5]${NC} 安装 Python 依赖..."
pip3 install -q pyinstaller pillow 2>/dev/null
pip3 install -q -r "$PROJECT_ROOT/requirements.txt" 2>/dev/null
ok "Python 依赖已安装"

# 安装 Playwright 浏览器（用于打包到安装包）
python3 -m playwright install chromium 2>/dev/null && ok "Playwright Chromium 已就绪" || warn "Playwright Chromium 安装失败，跳过（微信发布功能不可用）"

# ── 2. 构建前端 ──────────────────────────────────────
log "${YELLOW}[3/5]${NC} 构建前端..."
cd "$PROJECT_ROOT/desktop/web"
if [ ! -d "node_modules" ]; then
  log "  安装 npm 依赖..."
  npm ci --silent 2>/dev/null
fi
npm run build 2>/dev/null
ok "前端构建完成（desktop/web/dist/ → desktop/static/）"

# ── 3. 生成应用图标 ─────────────────────────────────
log "${YELLOW}[4/5]${NC} 生成应用图标..."
cd "$PROJECT_ROOT"
mkdir -p build

if [ "$OS_TYPE" = "macos" ]; then
  # macOS: .icns
  mkdir -p build/icon.iconset
  python3 -c "
from PIL import Image
import os
img = Image.open('desktop/static/logo-icon.png')
size = min(img.size)
left = (img.width - size) // 2
top = (img.height - size) // 2
img = img.crop((left, top, left + size, top + size))
os.makedirs('build/icon.iconset', exist_ok=True)
for s in [16, 32, 64, 128, 256, 512, 1024]:
    resized = img.resize((s, s), Image.LANCZOS)
    resized.save(f'build/icon.iconset/icon_{s}x{s}.png')
    if s * 2 <= 1024:
        resized.save(f'build/icon.iconset/icon_{s}x{s}@2x.png')
import subprocess
subprocess.run(['iconutil', '-c', 'icns', 'build/icon.iconset', '-o', 'build/app.icns'], check=True)
"
  rm -rf build/icon.iconset
  ok "图标已生成: build/app.icns"

elif [ "$OS_TYPE" = "windows" ]; then
  # Windows: .ico（保存到 desktop/build/，与 setup.iss 路径一致）
  mkdir -p desktop/build
  python3 -c "
from PIL import Image
img = Image.open('desktop/static/logo-icon.png')
size = min(img.size)
left = (img.width - size) // 2
top = (img.height - size) // 2
img = img.crop((left, top, left + size, top + size))
img.save('desktop/build/app.ico', sizes=[(256, 256)])
"
  ok "图标已生成: desktop/build/app.ico"
fi

# ── 4. PyInstaller 打包 ──────────────────────────────
log "${YELLOW}[5/5]${NC} PyInstaller 打包..."
cd "$PROJECT_ROOT"
pyinstaller desktop/build.spec --clean --noconfirm > /tmp/pyinstaller.log 2>&1 &
PID=$!
spin='-\|/'
i=0
while kill -0 $PID 2>/dev/null; do
  printf "\r  %s 正在打包（分析依赖 → 编译 → 收集文件）请稍候..." "${spin:i++%4:1}"
  sleep 0.3
done
wait $PID
pyinstaller_exit=$?
if [ $pyinstaller_exit -ne 0 ]; then
  echo ""
  fail "PyInstaller 打包失败，查看日志: tail -50 /tmp/pyinstaller.log"
fi
echo ""
ok "PyInstaller 打包完成"

if [ "$OS_TYPE" = "macos" ] && [ -d "dist/MediaForge.app" ]; then
  ok "app 已生成: dist/MediaForge.app"

  # ── 5. macOS: 创建 DMG ────────────────────────────
  log "${YELLOW}[6/5]${NC} 创建 DMG 安装包..."
  bash "$PROJECT_ROOT/desktop/build_dmg.sh"
  DMG_FILE=$(ls -t MediaForge-macOS-*.dmg 2>/dev/null | head -1)
  if [ -n "$DMG_FILE" ] && [ -f "$DMG_FILE" ]; then
    ok "DMG 已生成: $DMG_FILE"
    echo "   安装: open $DMG_FILE"
  fi

elif [ "$OS_TYPE" = "windows" ] && [ -d "dist/MediaForge" ]; then
  ok "可执行文件已生成: dist/MediaForge/MediaForge.exe"
  echo ""
  warn "Windows 安装包需要使用 Inno Setup 在 Windows 环境下构建"
  warn "命令: iscc /dMyAppVersion=\"${APP_VERSION}\" desktop/setup.iss"
  echo ""
  log "Windows 调试方法:"
  echo "  运行 dist/MediaForge/desktop/run_console.bat 查看错误输出"
  echo ""

elif [ "$OS_TYPE" = "linux" ]; then
  warn "Linux 仅完成 PyInstaller 打包，无安装包生成"
fi

# ── 完成 ──────────────────────────────────────────────
echo ""
log "${GREEN}构建完成！${NC}"
echo "  输出目录: $PROJECT_ROOT/dist/"
echo "  版本:     $APP_VERSION"
