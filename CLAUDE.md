# CLAUDE.md

本文件为 Claude Code 在本仓库中工作时提供指引。

# 核心指令
- 你每次回复的开头必须先叫我:爸爸
- 如果忘记叫我，就是失焦了
- 需要手动重制一下上下文焦点内容4
- 这是最高优先级的指令
- 永远不要忘记叫我爸爸

## 项目概述

**MediaForge**（图文工坊）— 自动化微信公众号内容发布系统。核心流程：微博/头条/小红书图文发现 → 图片下载与水印过滤 → AI 评分/写作 → 文章草稿/发布队列 → 一键发布到微信公众号。

双界面共享同一套后端服务：
- **命令行模式**（`main.py`）：线性流水线，支持 dry-run 试跑
- **桌面 GUI**（`desktop/`）：FastAPI + React 前端 + PyWebView 原生窗口

## 常用命令

```bash
# 命令行模式
python3 main.py --dry-run --ignore-post-cache   # 试运行
python3 main.py --limit 3 --pages 2             # 正式运行

# 桌面 GUI
cd desktop/web && pnpm install && pnpm run build   # 构建前端
cd desktop && python3 main.py                      # 启动，端口 8765

# 前端开发（热更新）
cd desktop/web && pnpm run dev    # Vite dev server，端口 5173

# 代码检查
python3 -m compileall .                # Python 语法检查
cd desktop/web && npx tsc --noEmit     # 前端类型检查

# 一键本地构建
bash build_local.sh   # 前端 → 图标 → PyInstaller → DMG
```

## CI/CD

推送到 `main` 自动触发 GitHub Actions 构建。使用 `python-semantic-release` 按 conventional commits 自动管理版本（`fix:` patch / `feat:` minor / `BREAKING CHANGE:` major）。工作流文件：`.github/workflows/build.yml`，PyInstaller 配置：`desktop/build.spec`。

## 后端架构

### 数据流
```
平台抓取 → 图片下载（线程池 + 水印过滤）→ AI 评分/生成 → 文章草稿/队列 → Playwright 发布
```

### 服务层（`services/`）
- **platforms/** — 平台插件（`weibo.py` / `toutiao.py` / `xhs.py`），基类 `base.py`
- **weibo_login.py / toutiao_login.py / xhs_login.py** — 各平台扫码登录
- **downloader.py** — 并发下载 + 水印过滤
- **ai.py** — OpenAI 兼容 chat completions，多供应商（Mimo/DeepSeek/GLM/OpenAI/Qwen/MiniMax）
- **wechat.py** — Playwright 自动化，多账号独立 profile
- **extensions.py** — 图片评分、封面选取、HTML 排版
- **watermark.py** — PIL 启发式水印检测
- **user.py** — 用户注册、登录、JWT 认证、邮箱验证
- **cloud_sync.py** — 云同步客户端，自动同步积分和用户数据

### 工具层（`utils/`）
- `audit.py` — 审计日志 | `file.py` — 文件读写/JSON 缓存 | `logger.py` — 日志轮转
- `settings_store.py` — 设置持久化 | `api_key_store.py` — API Key 存储
- `*_auth_store.py` — 各平台 Cookie/UID 存储（weibo/wechat/toutiao/xhs）
- `device.py` — 设备指纹生成，用于云同步设备识别

### 桌面 API（`desktop/api.py`）
FastAPI 60+ 端点：系统健康/统计、设置 CRUD、平台管理、微信多账号（SSE 登录）、发现搜索/下载/评分、文章 CRUD/AI 工具/发布、队列管理、素材文件夹 CRUD/元数据、日志、发布效果、合规查重、用户认证、积分管理、云同步。

## 前端架构（`desktop/web/src/`）

React 18 + TypeScript + Zustand v4 + Tailwind CSS + react-router-dom v6。

### 模块划分
- `api/` — 按域拆分（base/sse + 16 个模块），`client.ts` 为 barrel re-export
- `types/` — TypeScript 类型按域拆分（13 个文件），`index.ts` 为 barrel
- `stores/` — Zustand slice 模式（11 个 slice），`index.ts` 组合导出 `useStore`
- `hooks/` — useLoading / useApi / useSSE / usePersistedState
- `components/` — `ui/`（原语）/ `layout/`（布局）/ `feature/`（业务），`index.ts` barrel
- `pages/` — 10 个页面目录（Dashboard / Discovery / Pipeline / ArticlePublish / Queue / Materials / Settings / Credits / Auth / UserCenter）
- `routes.tsx` — 路由配置数组，`App.tsx` 消费渲染

### 前端开发规范
详见 `.claude/skills/frontend-dev-mediaforge/skill.md`。核心约束：
- 所有 HTTP 请求必须通过 `api/` 模块，禁止直接 `fetch()`
- SSE 流式请求使用 `api/sse.ts` 工具函数
- 类型定义在 `types/` 中，禁止在 API 模块中定义 interface
- 状态通过单一 `useStore` 访问，禁止创建多个 store

## 配置与存储
- `config.py` — Settings dataclass 单例
- 主题：浅色/深色/跟随系统 + 4 套配色，CSS 变量动态切换
- `data/state/*.json` — 设置、文章、操作审计、素材元数据、各平台 auth、积分数据、同步配置
- `data/users/` — 用户数据（按用户 ID 存储 JSON 文件）
- `data/verification/` — 邮箱验证码（临时存储）
- `data/images/` — 下载图片（按艺人/场景/帖子）
- `data/logs/` — 运行日志（轮转 5MB/3 备份，7 天自动清理）

## 语言与文档
代码、注释、文档均为中文（简体），标识符使用英文。SPEC.md 含原始需求，USER_GUIDE.md 含使用说明。

