#!/bin/bash
# ══════════════════════════════════════════════════════════
# MediaForge（图文工坊）开发启动脚本
# 使用 Launch Services 注册临时 .app 包装，Dock 正确显示"图文工坊"
# ══════════════════════════════════════════════════════════
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")" && pwd)"
APP_PATH="/tmp/MediaForge-dev.app"
LOG_FILE="$PROJECT_ROOT/data/logs/dev.log"
PID_FILE="$PROJECT_ROOT/data/logs/dev.pid"

mkdir -p "$PROJECT_ROOT/data/logs"
mkdir -p "$APP_PATH/Contents/MacOS"

# ── 生成 Info.plist ──────────────────────────────────────
if [ ! -f "$APP_PATH/Contents/Info.plist" ]; then
  cat > "$APP_PATH/Contents/Info.plist" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleExecutable</key>
  <string>MediaForge</string>
  <key>CFBundleName</key>
  <string>图文工坊</string>
  <key>CFBundleDisplayName</key>
  <string>图文工坊</string>
  <key>CFBundleIdentifier</key>
  <string>com.mediaforge.dev</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleInfoDictionaryVersion</key>
  <string>6.0</string>
</dict>
</plist>
EOF
fi

# ── 生成启动脚本（重定向 output 到日志文件）─────────────
cat > "$APP_PATH/Contents/MacOS/MediaForge" << LAUNCH_SCRIPT
#!/bin/bash
echo \$\$ > "$PID_FILE"
exec >> "$LOG_FILE" 2>&1
cd "$PROJECT_ROOT" && exec python3 desktop/main.py
LAUNCH_SCRIPT
chmod +x "$APP_PATH/Contents/MacOS/MediaForge"

# ── 启动 ──────────────────────────────────────────────────
echo "━━━ MediaForge Dev ━━━"
echo "  Log: $LOG_FILE"
echo "  PID: file://$PID_FILE"

# 如果已有旧进程，先杀掉
if [ -f "$PID_FILE" ]; then
  OLD_PID=$(cat "$PID_FILE" 2>/dev/null || echo "")
  if [ -n "$OLD_PID" ] && kill -0 "$OLD_PID" 2>/dev/null; then
    echo "  Killing old process ($OLD_PID)..."
    kill "$OLD_PID" 2>/dev/null || true
    sleep 1
  fi
fi

# Launch Services 注册启动（Dock 从 Info.plist 读取"图文工坊"）
open "$APP_PATH"
sleep 1

# 等待日志文件出现
for i in $(seq 1 10); do
  if [ -f "$LOG_FILE" ] && [ -s "$LOG_FILE" ]; then
    break
  fi
  sleep 0.5
done

echo "━━━ 输出 ━━━"
tail -f "$LOG_FILE"
