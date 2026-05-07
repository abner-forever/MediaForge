# CLAUDE.md

本文件为 Claude Code 在本仓库中工作时提供指引。

## 项目概述

**MediaForge**（图文工坊）是一个自动化微信公众号内容发布系统。核心流程：微博图文发现 → 图片下载与水印过滤 → AI 智能评分与文案生成 → 一键发布到微信公众号。

双界面共享同一套后端服务：
- **命令行模式**（`main.py`）：线性流水线，支持 dry-run 试跑，适合批量定时任务
- **桌面 GUI**（`desktop/`）：FastAPI + React 前端 + PyWebView 原生窗口，交互式可视化操作

## 常用命令

### 命令行模式
```bash
pip install -r requirements.txt
playwright install chromium
cp .env.example .env  # 配置 WEIBO_COOKIE、AI_API_KEY 等
python3 main.py --dry-run --ignore-post-cache   # 试运行
python3 main.py --limit 3 --pages 2             # 正式运行
```

### 桌面 GUI（生产）
```bash
cd desktop/web && npm install && npm run build   # 构建前端 -> desktop/static/
cd desktop && python3 main.py                    # 启动 FastAPI + PyWebView，端口 8765
```

### 前端开发（热更新）
```bash
cd desktop/web && npm run dev    # Vite dev server，端口 5173，/api 代理到 8765
```

### 代码检查
```bash
python3 -m compileall .                # Python 语法检查
cd desktop/web && npx tsc --noEmit     # 前端类型检查
```

## 架构

### 数据流
```
微博抓取 -> 图片下载（线程池 + 水印过滤）
  -> AI 评分（Vision / 启发式）-> AI 生成标题文案
  -> HTML 排版 -> Playwright 自动化发布到微信公众号
```

### 服务层（`services/`）
- **weibo.py** — 微博抓取，支持五种模式（`own`/`celebrities`/`mixed`/`super_topic`/`keyword`）。名人昵称自动解析 UID，处理 pics/pic_infos/mix_media_info/retweeted 多种响应格式。
- **downloader.py** — 并发下载图片到 `data/images/<celebrity>/<scene>/<post_id>/`，每张独立水印过滤。
- **ai.py** — OpenAI 兼容 chat completions 生成标题（≤20字）+ 描述（≤30字）。支持 Mimo/DeepSeek/GLM/OpenAI 多供应商，失败时回退硬编码。
- **wechat.py** — Playwright Chromium 自动化，处理扫码登录、文章编辑、图片上传、封面选择、发布。
- **extensions.py** — 图片评分（Vision API + 启发式回退）、封面选取（最高分或首图）、HTML 排版生成。
- **watermark.py** — 基于 PIL 的启发式水印检测，分析角部/底部与中心的边缘强度比。

### 桌面 API（`desktop/api.py`）
FastAPI 路由，约 30 个端点：
- 设置 CRUD（读写 .env）
- 仪表盘（健康检查、统计、操作记录）
- 发现（搜索、下载、评分、水印检测、SSE 流式下载进度）
- 队列（增删改、AI 生成文案、发布、发布日志轮询）
- 素材（列表浏览、批量删除）
- 图片代理（本地图片静态服务、远程图片 proxy）

### 前端（`desktop/web/src/`）
React 单页应用，5 个页面：
- **Dashboard** — 健康状态、统计数据、快捷操作、最近操作记录
- **Discovery** — 搜索参数配置、帖子列表、本地图片画廊、AI 评分
- **Queue** — 发布队列管理、AI 生成文案、保存草稿/直接发布/预览
- **Materials** — 按艺人+场景分组的本地素材管理、右键菜单
- **Settings** — 主题切换（3 种模式 + 4 套配色）、大模型配置、微博配置、水印参数

全局 Zustand store 管理：toast、lightbox、进度浮层、选中状态。

### 配置
`config.py` 是 `Settings` dataclass 单例，通过 python-dotenv 从 `.env` 加载。调用 `reload_settings()` 重新加载。所有变量参见 `.env.example`。

### 主题系统
支持浅色/深色/跟随系统三种模式，4 套主题配色（蓝/红/绿/紫），通过 CSS 变量动态切换。

### 数据存储
- `data/images/` — 下载图片，按艺人/场景/帖子组织
- `data/posts.json` — 去重缓存（已处理帖子 ID + hash）
- `data/state/queue.json` — 发布队列持久化
- `data/state/operations.json` — 操作记录
- `data/state/wechat.json` — 公众号登录态
- `data/state/wechat_chromium_profile/` — Chromium 用户数据
- `data/state/weibo_uid_map.json` — 昵称→UID 缓存
- `data/state/weibo_topic_map.json` — 超话名→hash 缓存
- `data/logs/` — 运行日志

## 语言与文档
代码、注释、文档均为中文（简体），代码标识符使用英文。SPEC.md 含原始需求与设计，USER_GUIDE.md 含使用说明。
