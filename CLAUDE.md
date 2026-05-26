# CLAUDE.md

本文件为 Claude Code 在本仓库中工作时提供指引。

## 项目概述

**MediaForge**（图文工坊）是一个自动化微信公众号内容发布系统。核心流程：微博/头条/小红书图文发现 → 图片下载与水印过滤 → AI 智能评分/写作 → 文章草稿与发布队列 → 一键保存草稿或发布到微信公众号。

双界面共享同一套后端服务：
- **命令行模式**（`main.py`）：线性流水线，支持 dry-run 试跑，适合批量定时任务
- **桌面 GUI**（`desktop/`）：FastAPI + React 前端 + PyWebView 原生窗口，交互式可视化操作，包含文章发布工作台和多公众号账号管理

## 常用命令

### 命令行模式
```bash
pip install -r requirements.txt
playwright install chromium
python3 main.py --dry-run --ignore-post-cache   # 试运行
python3 main.py --limit 3 --pages 2             # 正式运行
```

### 桌面 GUI（生产）
```bash
cd desktop/web && pnpm install && pnpm run build   # 构建前端 -> desktop/static/
cd desktop && python3 main.py                    # 启动 FastAPI + PyWebView，端口 8765
```

### 前端开发（热更新）
```bash
cd desktop/web && pnpm run dev    # Vite dev server，端口 5173，/api 代理到 8765
```

### 代码检查
```bash
python3 -m compileall .                # Python 语法检查
cd desktop/web && npx tsc --noEmit     # 前端类型检查
```

### 桌面应用打包（PyInstaller）
```bash
cd desktop/web && pnpm install --frozen-lockfile && pnpm run build   # 先构建前端
cd ../..
pip install pyinstaller pillow              # 安装打包工具
pyinstaller desktop/build.spec --clean      # 打包
# macOS → dist/MediaForge.app
# Windows → dist/MediaForge/MediaForge.exe
```

### 一键本地构建（推荐）
```bash
bash build_local.sh   # 自动完成全部步骤：前端 → 图标 → PyInstaller → DMG
```

### macOS DMG 制作（本地）
```bash
bash desktop/build_dmg.sh        # 自动检测当前架构
bash desktop/build_dmg.sh x86_64 # 强制 Intel 架构
bash desktop/build_dmg.sh arm64  # 强制 Apple Silicon 架构
```

### Windows 安装包制作（本地，需 Windows 环境 + Inno Setup）
```bash
pip install -r requirements.txt pyinstaller pillow
cd desktop/web && pnpm install --frozen-lockfile && pnpm run build && cd ../..
pyinstaller desktop/build.spec --clean
iscc /dMyAppVersion="$(python -c "import tomllib; print(tomllib.load(open('pyproject.toml','rb'))['project']['version'])")" desktop/setup.iss
# → dist/MediaForge-Windows-Setup.exe
```

### Windows 调试
如果安装后 `.exe` 无法运行，可在安装目录运行 `desktop\run_console.bat` 查看错误输出，或检查 `data/logs/crash.log` 文件。

## CI/CD

推送到 `main` 分支自动触发 GitHub Actions 构建桌面安装包：
- **macOS** — PyInstaller 构建 `.app` → `hdiutil` 打包为 `.dmg`（未签名）
- **Windows** — PyInstaller 构建目录 → Inno Setup 打包为 `.exe` 安装包
- **Release** — semantic-release 根据 conventional commits 自动生成 `v{semver}` tag，并上传 DMG/EXE 到 GitHub Release

手动触发：GitHub 仓库 Actions 页面 → "构建桌面安装包" → "Run workflow"

### 版本号管理

使用 `python-semantic-release` 自动管理版本：
- 版本定义在 `pyproject.toml` 的 `[project] version`
- 推送 `main` 时自动分析 commit 信息，按 conventional commits 推导版本号
  - `fix:` → patch 升级（1.0.0 → 1.0.1）
  - `feat:` → minor 升级（1.0.0 → 1.1.0）
  - `BREAKING CHANGE:` → major 升级（1.0.0 → 2.0.0）
- 自动生成 `v{semver}` 格式 tag 并创建 GitHub Release
- 应用版本写入 macOS `CFBundleVersion` / `CFBundleShortVersionString`

手动触发版本：提交时使用 `fix:` / `feat:` / `BREAKING CHANGE:` 前缀控制升级级别。也可在 Actions 页面手动触发 workflow。

工作流文件：`.github/workflows/build.yml`
PyInstaller 配置：`desktop/build.spec`

> 注意：Playwright Chromium 浏览器已打包进安装包（约 350MB），开箱即用。微博/小红书/头条扫码登录均已改用系统 WebView，无需 Playwright 内置浏览器。

## 架构

### 数据流
```
微博/头条/小红书抓取 -> 图片下载（线程池 + 水印过滤）
  -> AI 评分（Vision / 启发式）-> AI 生成标题/正文
  -> 文章草稿/发布队列 -> HTML 排版 -> Playwright 自动化保存草稿或发布到微信公众号
```

### 服务层（`services/`）
- **platforms/** — 平台插件架构，基类 `base.py` 定义 `PlatformService` 协议。内置：
  - `weibo.py` — 微博平台服务（搜索用户/超话帖子）
  - `toutiao.py` — 今日头条平台服务（搜索文章/图文）
  - `xhs.py` — 小红书平台服务（搜索笔记，通过 Playwright 拦截带 x-s/x-t 签名的 API）
- **weibo_login.py** — 内置 WebView 微博扫码登录，自动获取 Cookie。
- **toutiao_login.py** — 今日头条扫码登录，捕获 HTTP-only cookie（sessionid、tt_webid 等）。
- **xhs_login.py** — 小红书扫码/手机号登录，通过 Playwright 捕获完整 Cookie。
- **downloader.py** — 并发下载图片到 `data/images/<celebrity>/<scene>/<post_id>/`，每张独立水印过滤。
- **ai.py** — OpenAI 兼容 chat completions，支持标题生成、文章生成、校对润色、去 AI 味儿、排版优化和对话式改写。支持 Mimo/DeepSeek/GLM/OpenAI/Qwen/MiniMax 多供应商，失败时回退硬编码。
- **wechat.py** — Playwright Chromium 自动化，处理扫码登录、文章编辑、图片上传、封面选择、保存草稿/发布，多账号通过独立 profile 与 `storage_state` 隔离。
- **extensions.py** — 图片评分（Vision API + 启发式回退）、封面选取（最高分或首图）、HTML 排版生成。
- **watermark.py** — 基于 PIL 的启发式水印检测，分析角部/底部与中心的边缘强度比。

### 工具层（`utils/`）
- **audit.py** — 审计日志，记录操作到 `data/state/operations.json`
- **api_key_store.py** — API Key 本地存储
- **file.py** — 文件读取/写入，JSON 缓存，文本 hash
- **pathsafe.py** — 安全路径处理
- **logger.py** — 日志配置，支持控制台输出 + 按大小轮转的文件日志（5MB/备份3个），自动清理超过 7 天的旧日志
- **settings_store.py** — 桌面设置持久化到 `data/state/settings.json`
- **weibo_auth_store.py** — 微博 Cookie/UID/头像本地存储与清空
- **wechat_auth_store.py** — 微信公众号多账号注册表、默认账号、独立 profile/state 路径
- **toutiao_auth_store.py** — 今日头条 Cookie/UID/用户名/头像本地存储与清空
- **xhs_auth_store.py** — 小红书 Cookie/UID/用户名/头像本地存储与清空

### 桌面 API（`desktop/api.py`）
FastAPI 路由，覆盖 60+ 个端点：

- **系统** — 健康检查、统计、运行记录
- **设置 CRUD** — 读写所有配置项，AI 连接测试
- **平台** — 列出可用平台及元信息
- **微信公众号账号** — 新增、登录（SSE 流式）、登出、默认账号、删除、发布历史
- **发现** — 搜索（SSE 流式）、下载（SSE 流式进度）、评分、水印检测、热门艺人推荐
- **文章** — 草稿 CRUD、AI 生成/润色/去 AI 味儿/标题候选/排版优化、灵感搜索、封面搜索/下载、对话式改写、加入队列、发布
- **队列** — 增删改、AI 润色、发布（保存草稿/直接发布）、发布日志轮询
- **素材** — 分组列表、文件夹树/浏览、创建/重命名/删除文件夹、重命名文件、批量删除、移动、评分、元数据（标签/评分/使用记录）
- **图片代理** — 本地图片静态服务、远程图片 proxy
- **日志与反馈** — 日志文件列表/内容阅读、系统剪贴板写入、保存到下载目录、Toast 日志记录
- **发布效果** — 发布后数据记录与查询
- **合规** — 标题查重

### 前端（`desktop/web/src/`）
React 单页应用，6 个页面：
- **Dashboard** — 健康状态、统计数据、快捷操作、最近操作记录
- **Discovery** — 多平台搜索参数配置、帖子列表、本地图片画廊、AI 评分
- **ArticlePublish** — 文章草稿、Markdown 编辑、灵感搜索、封面搜索、AI 写作工具（生成/润色/去AI/标题候选/排版/对话改写）、发布流转
- **Queue** — 发布队列管理、AI 润色、保存草稿/直接发布/删除
- **Materials** — 按艺人+场景分组或文件夹树浏览的本地素材管理、右键菜单、文件重命名/移动/删除
- **Settings** — 主题切换（3 种模式 + 4 套配色）、大模型配置、媒体来源（微博/头条/小红书配置与登录）、微信公众号多账号、素材目录、水印参数、版本信息与日志管理

全局 Zustand store 管理：主题、toast、lightbox、进度浮层、发现页选中状态/评分、素材文件夹浏览/选中、文章列表/筛选、灵感结果、队列、微信侧边栏刷新、AI 推荐艺人。

### 配置
`config.py` 是 `Settings` dataclass 单例。

### 主题系统
支持浅色/深色/跟随系统三种模式，4 套主题配色（默认蓝/清新绿/创作紫/暖阳橙），通过 CSS 变量动态切换。原生窗口主题同步（深色模式自动适配 macOS 窗口外观）。

### 数据存储
- `data/images/` — 下载图片，按艺人/场景/帖子组织
- `data/posts.json` — 去重缓存（已处理帖子 ID + hash）
- `data/queue.json` — 发布队列持久化
- `data/state/settings.json` — 桌面 GUI 配置
- `data/state/articles.json` — 文章草稿
- `data/state/operations.json` — 操作审计记录
- `data/state/materials_meta.json` — 素材元数据（标签、来源平台、评分、使用记录、封面标记等）
- `data/state/wechat.json` — 旧版单账号公众号登录态
- `data/state/wechat_accounts.json` — 微信公众号多账号索引
- `data/state/wechat_accounts/` — 多账号独立 Chromium profile 与 storage_state
- `data/state/wechat_chromium_profile/` — Chromium 用户数据
- `data/state/weibo_auth.json` — 微博 Cookie/UID/头像
- `data/state/weibo_uid_map.json` — 昵称→UID 缓存
- `data/state/weibo_topic_map.json` — 超话名→hash 缓存
- `data/state/toutiao_auth.json` — 今日头条 Cookie/UID/用户名/头像
- `data/state/xhs_auth.json` — 小红书 Cookie/UID/用户名/头像
- `data/state/xhs_storage.json` — 小红书 Playwright storage state
- `data/logs/` — 运行日志（app.log + 轮转备份、crash.log、runs/ 审计日志）

## 语言与文档
代码、注释、文档均为中文（简体），代码标识符使用英文。SPEC.md 含原始需求与设计，USER_GUIDE.md 含使用说明。
