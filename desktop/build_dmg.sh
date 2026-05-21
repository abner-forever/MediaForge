#!/bin/bash
# ============================================================
# macOS DMG 安装包构建脚本
# 使用标准挂载+布局流程
# ============================================================
set -euo pipefail

ARCH="${1:-$(uname -m)}"
VERSION="${2:-}"
APP_SRC="dist/MediaForge.app"
APP_NAME="图文工坊"
APP_DST="${APP_NAME}.app"
if [ -n "$VERSION" ]; then
    DMG_NAME="MediaForge-macOS-${ARCH}-${VERSION}.dmg"
else
    DMG_NAME="MediaForge-macOS-${ARCH}.dmg"
fi
VOLNAME="图文工坊"
DMG_TEMP="$(pwd)/dmg_temp.dmg"
BG_DIR=".background"

if [ ! -d "$APP_SRC" ]; then
    echo "❌ 未找到 $APP_SRC，请先运行 pyinstaller"
    exit 1
fi

echo "📦 创建 DMG 安装包 (${ARCH})..."

# 清理残留
rm -f "$DMG_TEMP" "$DMG_NAME"

# 退出清理（卸载 + 删临时文件）
cleanup() {
    hdiutil detach "/Volumes/$VOLNAME" -quiet -force 2>/dev/null || true
    rm -f "$DMG_TEMP"
}
trap cleanup EXIT

# ══════════════════════════════════════════════════════
# 1. 生成背景图
# ══════════════════════════════════════════════════════
echo "  1/5 生成背景图..."
BG_FILE="$(pwd)/dmg_bg.png"
python3 << PYEOF
from PIL import Image, ImageDraw, ImageFont
import os

W, H = 540, 380
bg = Image.new("RGBA", (W, H), (250, 250, 248, 255))
draw = ImageDraw.Draw(bg)

font = None
for fp in ["/System/Library/Fonts/PingFang.ttc",
           "/System/Library/Fonts/STHeiti Light.ttc"]:
    if os.path.exists(fp):
        try:
            font = ImageFont.truetype(fp, 26)
            break
        except:
            pass
if font is None:
    font = ImageFont.load_default()

def get_font(size):
    try:
        return ImageFont.truetype(font.path, size)
    except:
        return ImageFont.load_default()

# 标题
draw.text((W//2, 28), "图文工坊", fill=(50, 50, 50, 255), font=get_font(22), anchor="mt")
draw.line([(W//2-50, 54), (W//2+50, 54)], fill=(220, 220, 220, 255), width=1)

# 箭头
arrow_y = 175
arrow_color = (70, 130, 200, 255)
draw.rounded_rectangle([(100, arrow_y-35), (175, arrow_y+35)], radius=14,
                       fill=(240, 240, 245, 255), outline=(180, 180, 200, 255), width=2)
draw.text((137, arrow_y), "图文工坊", fill=(80, 80, 80, 255), font=get_font(11), anchor="mm")
draw.line([(188, arrow_y), (345, arrow_y)], fill=arrow_color, width=3)
draw.polygon([(348, arrow_y), (335, arrow_y-8), (335, arrow_y+8)], fill=arrow_color)
draw.rounded_rectangle([(360, arrow_y-35), (455, arrow_y+35)], radius=14,
                       fill=(240, 248, 240, 255), outline=(180, 210, 180, 255), width=2)
draw.text((407, arrow_y), "Applications", fill=(80, 80, 80, 255), font=get_font(11), anchor="mm")

# 提示
draw.text((W//2, 265), "将 图文工坊 拖拽到 Applications 文件夹", fill=(120, 120, 120, 255),
          font=get_font(13), anchor="mt")
draw.text((W//2, 295), "拖拽安装后，请从「启动台」或「应用程序」中打开", fill=(180, 180, 180, 255),
          font=get_font(12), anchor="mt")

bg.save("$BG_FILE", "PNG")
print("  ✓ background.png 已生成")
PYEOF

# ══════════════════════════════════════════════════════
# 2. 创建空白读写 DMG
# ══════════════════════════════════════════════════════
echo "  2/5 创建空白 DMG..."
hdiutil create -size 1500m -volname "$VOLNAME" \
    -fs HFS+ "$DMG_TEMP" >/dev/null

# ══════════════════════════════════════════════════════
# 3. 挂载并填充内容
# ══════════════════════════════════════════════════════
echo "  3/5 挂载并填充内容..."
MOUNT="/Volumes/$VOLNAME"
hdiutil attach "$DMG_TEMP" -noverify -noautoopen >/dev/null

# 复制内容到 DMG
cp -R "$APP_SRC" "$MOUNT/$APP_DST"
ln -s /Applications "$MOUNT/Applications"

# 复制背景图到 .background 目录
mkdir -p "$MOUNT/$BG_DIR"
cp "$BG_FILE" "$MOUNT/$BG_DIR/background.png"

# ══════════════════════════════════════════════════════
# 4. AppleScript 设置 Finder 布局
# ══════════════════════════════════════════════════════
echo "  4/5 设置 Finder 布局..."

# 检测 GUI 可用
if osascript -e 'return true' &>/dev/null; then
    echo "  → 执行布局设置..."
    AS_OUT=$(osascript 2>&1 <<-ASEND || true
        tell application "Finder"
            tell disk "$VOLNAME"
                open
                tell container window
                    set current view to icon view
                    set toolbar visible to false
                    set statusbar visible to false
                    set bounds to {200, 100, 740, 480}
                end tell
                tell icon view options of container window
                    set icon size to 72
                    set arrangement to not arranged
                end tell
                set background picture of icon view options of container window to file ".background:background.png"
                set position of item "$APP_DST" to {137, 200}
                set position of item "Applications" to {407, 200}
                close
            end tell
        end tell
ASEND
)
    if [ -n "$AS_OUT" ]; then
        echo "  ⚠ 提示: $AS_OUT"
    else
        echo "  ✓ 布局已设置"
    fi
else
    echo "  ⚠ 无 GUI 环境，跳过布局设置"
fi

# ══════════════════════════════════════════════════════
# 5. 卸载并转换为只读 DMG
# ══════════════════════════════════════════════════════
echo "  5/5 完成 DMG..."
sleep 0.5
hdiutil detach "$MOUNT" -quiet >/dev/null
sleep 0.3

hdiutil convert "$DMG_TEMP" -format UDZO -o "$DMG_NAME" >/dev/null

# 清理临时文件
rm -f "$DMG_TEMP" "$BG_FILE"

echo "✅ 已生成: $DMG_NAME"
echo "   大小: $(du -h "$DMG_NAME" | cut -f1)"
echo "   安装: open $DMG_NAME"
