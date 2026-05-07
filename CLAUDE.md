# CLAUDE.md

本文件为 Claude Code (claude.ai/code) 在本仓库中工作时提供指引。

## 项目概述

**weibo2wechat**（图文工坊）是一个自动化微信公众号发布系统。核心流程：抓取微博图文帖子 -> 下载图片并过滤水印 -> AI 生成标题和描述 -> 通过浏览器自动化发布到微信公众号。

两个界面共享同一套后端服务：
- **命令行模式**（`main.py`）：线性流水线，逐条处理帖子
- **桌面 GUI**（`desktop/`）：FastAPI + PyWebView 应用，前端为 React/TypeScript（Zustand、React Router、Tailwind CSS、Vite）

## 常用命令

### 命令行模式
```bash
pip install -r requirements.txt
playwright install chromium
cp .env.example .env  # 填入 WEIBO_COOKIE、AI_API_KEY 等

python3 main.py --dry-run --ignore-post-cache   # 试运行（不发布）
python3 main.py --limit 3 --pages 2             # 正式运行
```

### 桌面 GUI
```bash
cd desktop/web && npm install && npm run build   # 构建 React 前端 -> desktop/static_dist/
cd desktop && python3 main.py                    # 启动 FastAPI + PyWebView，端口 8765
```

### 前端开发
```bash
cd desktop/web && npm run dev    # Vite 开发服务器，端口 5173，/api 代理到 8765
```

### 代码检查（无测试套件）
```bash
python3 -m compileall .                # Python 语法检查
cd desktop/web && npx tsc --noEmit     # 前端类型检查
```

## 架构

### 数据流
```
微博抓取 -> 下载图片（线程池 + 水印过滤）
  -> AI 生成内容（OpenAI 兼容 API）-> HTML 排版 -> Playwright 发布到微信
```

### 服务层（`services/`）
- **weibo.py** — 微博抓取，支持三种模式（`own`/`celebrities`/`mixed`）。将名人昵称解析为 UID。处理多种微博响应格式（pics、pic_infos、mix_media_info、retweeted）。
- **downloader.py** — 并发下载图片到 `data/images/<celebrity>/<scene>/<post_id>/`。每张图片独立进行水印过滤。
- **ai.py** — 调用 OpenAI 兼容的 chat completions 生成标题（<=20 字）+ 描述（<=30 字）。支持 Mimo/DeepSeek/GLM/OpenAI 多供应商，失败时回退到硬编码文本。
- **wechat.py** — Playwright Chromium 自动化操作微信公众号。处理扫码登录、文章编辑器、图片上传、发布。支持 GUI 的扫码/确认回调。
- **extensions.py** — 图片质量评分（Vision API + 启发式回退）、封面选取、HTML 排版生成。
- **watermark.py** — 基于 PIL 的启发式水印检测，通过分析角部/底部与中心的边缘强度比判断。

### 工具层（`utils/`）
- **file.py** — JSON 读写 + SHA-256 去重哈希
- **audit.py** — 每次运行的 JSONL 结构化审计日志
- **env_manager.py** — 读写 `.env`（保留注释格式），写入后自动调用 `reload_settings()`
- **logger.py**、**pathsafe.py** — 日志配置、路径安全化

### 桌面端（`desktop/`）
- **api.py** — FastAPI 路由：设置 CRUD、仪表盘、发现、队列管理、SSE 流式下载、图片代理
- **app_state.py** — 内存单例，存储已选图片、发布队列、发现结果、评分
- **web/src/** — React 单页应用：Dashboard、Discovery、Queue、Materials、Settings 页面，全局 Zustand store

### 配置
`config.py` 是单例 `Settings` dataclass，通过 python-dotenv 从 `.env` 加载。修改环境变量后调用 `reload_settings()`。所有变量参见 `.env.example`。

### 数据存储
- `data/posts.json` — 去重缓存（已处理帖子 ID）
- `data/images/` — 下载的图片，按名人/场景/帖子组织目录
- `data/audit/*.jsonl` — 每次运行的审计日志

## 语言与文档
代码库、SPEC.md 及用户文档均为中文（简体），代码标识符使用英文。
