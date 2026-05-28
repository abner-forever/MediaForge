#!/bin/bash
# ============================================================
# MediaForge macOS DMG Builder
# 高级版 DMG 安装包构建脚本
# Retina + Finder Layout + macOS 原生风格
# ============================================================

set -euo pipefail

ARCH="${1:-}"
VERSION="${2:-}"

APP_SRC="dist/MediaForge.app"

APP_NAME="图文工坊"
APP_DST="${APP_NAME}.app"

VOLNAME="图文工坊"

DMG_TEMP="$(pwd)/dmg_temp.dmg"

BG_DIR=".background"
BG_FILE="$(pwd)/dmg_bg.png"

# ============================================================
# 检查 APP
# ============================================================

if [ ! -d "$APP_SRC" ]; then
    echo "❌ 未找到 $APP_SRC"
    echo "请先执行 pyinstaller"
    exit 1
fi

# ============================================================
# 自动检测架构
# ============================================================

DMG_ARCH=""

APP_BINARY="$APP_SRC/Contents/MacOS/MediaForge"

if [ -f "$APP_BINARY" ]; then
    LIPO_INFO=$(lipo -info "$APP_BINARY" 2>/dev/null || true)

    if echo "$LIPO_INFO" | grep -q "are:"; then
        ARCH_LIST=$(echo "$LIPO_INFO" | grep -oE '(x86_64|arm64)' || true)
        ARCH_COUNT=$(echo "$ARCH_LIST" | wc -w | tr -d ' ')

        if [ "$ARCH_COUNT" -ge 2 ]; then
            DMG_ARCH="universal"
        else
            DMG_ARCH=$(echo "$ARCH_LIST" | head -1)
        fi

    elif echo "$LIPO_INFO" | grep -q "architecture:"; then
        DMG_ARCH=$(echo "$LIPO_INFO" | grep -oE '(x86_64|arm64)' | head -1)
    fi
fi

: "${DMG_ARCH:=${ARCH:-$(uname -m)}}"

# ============================================================
# DMG 文件名
# ============================================================

if [ -n "$VERSION" ]; then
    DMG_NAME="MediaForge-macOS-${DMG_ARCH}-${VERSION}.dmg"
else
    DMG_NAME="MediaForge-macOS-${DMG_ARCH}.dmg"
fi

echo ""
echo "📦 开始构建 DMG (${DMG_ARCH})"
echo ""

# ============================================================
# 清理
# ============================================================

rm -f "$DMG_TEMP"
rm -f "$DMG_NAME"
rm -f "$BG_FILE"

cleanup() {
    diskutil unmountDisk force "/Volumes/$VOLNAME" 2>/dev/null || true
    hdiutil detach "/Volumes/$VOLNAME" -force 2>/dev/null || true
    rm -f "$DMG_TEMP"
    rm -f "$BG_FILE"
}

trap cleanup EXIT

# ============================================================
# 1. 生成 Retina 背景图
# ============================================================

echo "  1/5 生成背景图..."

python3 << PYEOF
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import os

# Retina 分辨率
W, H = 1360, 840

bg = Image.new("RGBA", (W, H), (248, 248, 250, 255))
draw = ImageDraw.Draw(bg)

# ======================================================
# 顶部渐变
# ======================================================

for y in range(H):
    alpha = int(24 * (1 - y / H))
    draw.line(
        [(0, y), (W, y)],
        fill=(255, 255, 255, alpha)
    )

# ======================================================
# 字体
# ======================================================

font_path = None

for fp in [
    "/System/Library/Fonts/PingFang.ttc",
    "/System/Library/Fonts/SFNS.ttf",
]:
    if os.path.exists(fp):
        font_path = fp
        break

def font(size):
    if font_path:
        return ImageFont.truetype(font_path, size)
    return ImageFont.load_default()

# ======================================================
# 标题
# ======================================================

draw.text(
    (W // 2, 120),
    "图文工坊",
    fill=(35, 35, 35),
    font=font(68),
    anchor="mm"
)

draw.text(
    (W // 2, 190),
    "AI Image Studio",
    fill=(120, 120, 120),
    font=font(30),
    anchor="mm"
)

# ======================================================
# 中间箭头
# ======================================================

arrow_y = 430

line_color = (80, 140, 255)

# 阴影层
shadow = Image.new("RGBA", (W, H), (0,0,0,0))
sd = ImageDraw.Draw(shadow)

sd.line(
    [(500, arrow_y), (860, arrow_y)],
    fill=(0,0,0,70),
    width=16
)

shadow = shadow.filter(ImageFilter.GaussianBlur(10))

bg.alpha_composite(shadow)

# 主箭头
draw.line(
    [(500, arrow_y), (860, arrow_y)],
    fill=line_color,
    width=12
)

draw.polygon(
    [
        (860, arrow_y),
        (810, arrow_y - 30),
        (810, arrow_y + 30)
    ],
    fill=line_color
)

# ======================================================
# 底部说明
# ======================================================

draw.text(
    (W // 2, 650),
    "将 图文工坊 拖拽到 Applications 文件夹完成安装",
    fill=(70, 70, 70),
    font=font(36),
    anchor="mm"
)

draw.text(
    (W // 2, 720),
    "安装后可从 Launchpad 或 应用程序 中启动",
    fill=(150, 150, 150),
    font=font(24),
    anchor="mm"
)

bg.save("$BG_FILE", "PNG")

print("✓ 高级背景图已生成")
PYEOF

# ============================================================
# 2. 创建空白 DMG
# ============================================================

echo "  2/5 创建 DMG..."

hdiutil create \
    -size 3000m \
    -volname "$VOLNAME" \
    -fs HFS+ \
    "$DMG_TEMP" >/dev/null

# ============================================================
# 3. 挂载 DMG
# ============================================================

echo "  3/5 挂载 DMG..."

MOUNT="/Volumes/$VOLNAME"

hdiutil attach \
    "$DMG_TEMP" \
    -noverify \
    -noautoopen \
    -nobrowse >/dev/null

# 禁用 Spotlight 索引，防止 CI 环境下 Spotlight 持有卷引用
mdutil -i off "$MOUNT" 2>/dev/null || true

# ============================================================
# 拷贝 APP
# ============================================================

echo "      → 拷贝应用..."

cp -R "$APP_SRC" "$MOUNT/$APP_DST"

# Applications 快捷方式
ln -s /Applications "$MOUNT/Applications"

# ============================================================
# 背景图
# ============================================================

echo "      → 配置背景..."

mkdir -p "$MOUNT/$BG_DIR"

cp "$BG_FILE" "$MOUNT/$BG_DIR/background.png"

# 隐藏背景目录
SetFile -a V "$MOUNT/$BG_DIR" || true

# ============================================================
# 4. Finder 布局
# ============================================================

echo "  4/5 设置 Finder 布局..."

if osascript -e 'return true' &>/dev/null; then

osascript <<EOF || true

tell application "Finder"

    tell disk "$VOLNAME"

        open

        tell container window

            set current view to icon view

            set toolbar visible to false
            set statusbar visible to false
            set pathbar visible to false

            set bounds to {120, 120, 920, 660}

        end tell

        tell icon view options of container window

            set arrangement to not arranged

            set icon size to 96

            set text size to 14

            set label position to bottom

        end tell

        # APP icon
        set position of item "$APP_DST" to {180, 260}

        # Applications icon
        set position of item "Applications" to {500, 260}

        update without registering applications

        delay 1

        close

        open

        update without registering applications

        delay 1

    end tell

end tell

EOF

    echo "      ✓ Finder 布局完成"

else

    echo "      ⚠ 当前环境无 GUI，跳过 Finder 布局"

fi

# ============================================================
# 同步写盘
# ============================================================

echo "      → 同步磁盘..."

sync
# 等待所有文件操作完成
sleep 3

# ============================================================
# 5. 卸载 + 生成最终 DMG
# ============================================================

echo "  5/5 压缩 DMG..."

# 先查找挂载设备号（如 /dev/disk6），detach 需要它
DISK_DEV=$(hdiutil info | grep -B2 "$MOUNT" | grep "/dev/disk" | awk '{print $1}' | head -1)

# 杀掉可能持有卷引用的进程
killall Finder 2>/dev/null || true
killall mdworker 2>/dev/null || true
killall mds 2>/dev/null || true
sleep 1

# 先强制卸载文件系统，再 detach 磁盘设备（两者缺一不可）
diskutil unmount force "$MOUNT" 2>/dev/null || true
hdiutil detach "$MOUNT" -force 2>/dev/null || true
sleep 1

# 兜底：如果设备路径还在，用设备号 detach
if [ -n "$DISK_DEV" ]; then
    for i in 1 2 3 4 5; do
        hdiutil detach "$DISK_DEV" -force 2>/dev/null && break
        echo "      → 设备卸载重试 ($i/5)..."
        sleep 3
    done
fi

sleep 2

hdiutil convert \
    "$DMG_TEMP" \
    -format UDZO \
    -imagekey zlib-level=9 \
    -o "$DMG_NAME" >/dev/null

# ============================================================
# 清理
# ============================================================

rm -f "$DMG_TEMP"
rm -f "$BG_FILE"

echo ""
echo "✅ DMG 构建完成"
echo ""
echo "文件:"
echo "  $DMG_NAME"
echo ""
echo "大小:"
echo "  $(du -h "$DMG_NAME" | cut -f1)"
echo ""
echo "运行:"
echo "  open \"$DMG_NAME\""
echo ""
