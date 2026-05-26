# MediaForge · 图文工坊

![构建状态](https://img.shields.io/github/actions/workflow/status/abner-forever/MediaForge/build.yml?branch=main&logo=github&label=%E6%9E%84%E5%BB%BA)
![版本](https://img.shields.io/github/v/release/abner-forever/MediaForge?logo=semver&label=%E7%89%88%E6%9C%AC)
![Python](https://img.shields.io/badge/Python-3.10%2B-blue)
![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows-lightgrey)

自动化的微信公众号内容发布工具。从微博/头条/小红书发现优质图文 → 图片下载与水印过滤 → AI 智能评分/写作 → 草稿管理 → 一键保存草稿或发布到微信公众号。

## 当前实现进展

- **CLI 流水线已可用**：支持微博/头条抓取、去重缓存、图片下载、水印过滤、AI 标题生成、封面选择、微信公众号发布或 dry-run。
- **桌面 GUI 已成型**：FastAPI + React + PyWebView，包含首页、图片发现、文章发布、发布队列、本地素材、系统设置 6 个工作区。
- **多平台图文发现**：微博（五种模式）、今日头条（三种模式）、小红书均已接入，插件化架构可轻松扩展。
- **文章发布工作台已接入**：支持本地文章草稿、Markdown 编辑、AI 生成正文、校对润色、去 AI 味儿、标题候选、排版优化、对话式改写、灵感搜索和封面搜索/下载。
- **微信公众号多账号已实现**：每个账号使用独立 Chromium profile 与 `storage_state`，可设置默认账号、登录、登出、删除账号，支持发布历史查询。
- **本地配置与密钥存储已落地**：设置页写入 `data/state/settings.json`，AI Key 独立保存，各平台鉴权独立保存并支持清空。
- **素材管理升级**：支持文件夹树浏览、文件重命名、批量移动/删除、元数据管理（标签、评分、使用记录）。
- **文件日志系统**：桌面程序自动写入轮转日志文件，内置日志查看器可复制/导出日志，方便反馈问题。
- **测试与打包链路已建立**：`pytest`、前端 TypeScript 构建、PyInstaller、macOS DMG、Windows Inno Setup、GitHub Actions 自动构建与 semantic-release 发布。

## 功能特性

- **多平台图文发现** — 支持微博（明星列表、本人时间线、超话、关键词五种模式）、今日头条（feed/用户/关键词三种模式）、小红书
- **内置扫码登录** — 微博/头条/小红书均支持内置系统 WebView 扫码获取 Cookie，无需手动复制
- **智能水印过滤** — 基于边缘检测的启发式算法，自动识别并过滤水印图片
- **AI 图片评分** — Vision API + 启发式回退，多维度评分筛选优质图片
- **AI 内容生产** — 标题、正文、校对、去 AI 味儿、排版优化、标题候选、对话式改写，支持 Mimo / DeepSeek / GLM / OpenAI / Qwen / MiniMax 等 OpenAI 兼容接口
- **文章草稿与发布队列** — 独立文章工作台 + 队列管理，可编辑正文、选择封面、保存草稿或直接发布
- **微信公众号多账号** — 多公众号账号注册、默认账号、独立登录态与浏览器配置、发布历史
- **双模式运行** — 命令行批量处理 + 桌面 GUI 交互式管理
- **主题系统** — 浅色/深色/跟随系统，4 套主题配色可切换（默认蓝/清新绿/创作紫/暖阳橙）
- **素材管理** — 按艺人+场景分组或文件夹树浏览，支持文件重命名、移动、批量删除、元数据标记
- **日志管理** — 应用日志自动轮转，内置查看器支持在线查看、复制全部、保存到下载目录，集成 vConsole 开发者面板

## 快速开始

### 环境准备

```bash
pip install -r requirements.txt
playwright install chromium   # 微信发布需要浏览器引擎；安装包已内置，开发环境需手动安装
```

配置可通过桌面 GUI 的设置页面进行管理，或设置环境变量：

| 变量 | 说明 |
|------|------|
| `WEIBO_COOKIE` | 微博登录 Cookie |
| `AI_API_KEY` | 通用 AI 模型 API Key（也可使用供应商专用 Key） |
| `AI_BASE_URL` | OpenAI 兼容 API 地址 |
| `WEIBO_CELEBRITIES` | 明星列表（逗号分隔） |

### 命令行模式

```bash
# 试运行（不发布）
python3 main.py --dry-run --ignore-post-cache

# 正式运行（处理 3 条后发布）
python3 main.py --limit 3 --pages 2
```

### 桌面 GUI 模式

```bash
cd desktop/web
pnpm install && pnpm run build
cd ..
python3 main.py
```

浏览器访问 `http://127.0.0.1:8765` 即可使用。macOS 下会自动打开 PyWebView 原生窗口。

### 前端开发

```bash
cd desktop/web
pnpm install
pnpm run dev    # Vite 热更新，端口 5173，API 代理到 8765
```

### 打包桌面应用

```bash
# 构建前端
cd desktop/web && pnpm install --frozen-lockfile && pnpm run build

# 安装打包工具
pip install pyinstaller pillow

# 执行打包（项目根目录）
pyinstaller desktop/build.spec --clean
# macOS → dist/MediaForge.app  （可用 build_dmg.sh 制作 DMG）
# Windows → dist/MediaForge/   （可用 setup.iss 制作安装包）
```

> 推送到 `main` 分支会自动触发 GitHub Actions 构建安装包，详见 `.github/workflows/build.yml`。

## 平台支持

通过 `PLATFORM` 配置切换数据源，支持插件式扩展：

| 平台 | 模式 | 说明 |
|------|------|------|
| **微博** (`weibo`) | `own` / `celebrities` / `mixed` / `super_topic` / `keyword` | 明星时间线聚合、超话、关键词搜索 |
| **今日头条** (`toutiao`) | `feed` / `user` / `keyword` | feed 模式因签名限制会回退到关键词搜索 |
| **小红书** (`xhs`) | `search` | 通过 Playwright 拦截带 x-s/x-t 签名的 API，需要登录 |

采用 `services/platforms/` 插件架构，新增平台只需实现 `PlatformService` 协议。

## 项目结构

```
MediaForge/
├── main.py                 # CLI 入口（调度流程）
├── config.py               # 配置管理（dataclass 单例）
├── requirements.txt        # Python 依赖
├── services/
│   ├── platforms/          # 平台插件架构
│   │   ├── base.py         #   PlatformService 协议
│   │   ├── weibo.py        #   微博数据采集
│   │   ├── toutiao.py      #   今日头条数据采集
│   │   └── xhs.py          #   小红书数据采集
│   ├── ai.py               # AI 标题/文章生成、润色、排版优化
│   ├── downloader.py       # 图片下载与水印过滤
│   ├── extensions.py       # 图片评分/封面/排版
│   ├── watermark.py        # 水印检测
│   ├── wechat.py           # 公众号发布（Playwright）
│   ├── weibo_login.py      # 微博扫码登录
│   ├── toutiao_login.py    # 今日头条扫码登录
│   └── xhs_login.py        # 小红书扫码登录
├── utils/
│   ├── logger.py           # 日志（控制台 + 文件轮转）
│   ├── file.py             # 文件与缓存
│   ├── audit.py            # 审计日志（操作记录）
│   ├── api_key_store.py    # API Key 本地存储
│   ├── settings_store.py   # 桌面 GUI 设置持久化
│   ├── wechat_auth_store.py# 微信公众号多账号登录态
│   ├── weibo_auth_store.py # 微博 Cookie/UID/头像信息
│   ├── toutiao_auth_store.py # 今日头条 Cookie/UID/头像信息
│   ├── xhs_auth_store.py   # 小红书 Cookie/UID/头像信息
│   └── pathsafe.py         # 安全路径处理
├── desktop/
│   ├── main.py             # 桌面应用入口
│   ├── api.py              # FastAPI 路由（60+ 端点）
│   ├── app_state.py        # 应用状态管理
│   ├── build.spec          # PyInstaller 打包配置
│   ├── build_dmg.sh        # macOS DMG 制作脚本
│   ├── setup.iss           # Windows 安装包配置
│   ├── run_console.bat     # Windows 调试控制台
│   ├── static/             # 前端构建产物
│   └── web/                # React 前端源码
│       └── src/
│           ├── pages/      # Dashboard / Discovery / ArticlePublish / Queue / Materials / Settings
│           ├── components/ # ConfirmDialog / ContextMenu / RichTextEditor / Layout / Lightbox / 等
│           ├── hooks/      # useLoading
│           ├── api/        # API 客户端
│           ├── stores/     # Zustand 全局状态
│           └── index.css   # 全局样式 + 主题变量
└── data/                   # 运行时数据
    ├── images/             # 下载图片（按艺人/场景/帖子组织）
    ├── posts.json          # 去重缓存
    ├── queue.json          # 发布队列
    ├── state/              # 持久化状态
    │   ├── settings.json   #   桌面设置
    │   ├── articles.json   #   文章草稿
    │   ├── operations.json #   操作记录
    │   ├── materials_meta.json # 素材元数据（标签/评分/使用记录）
    │   ├── wechat.json     #   旧版公众号登录态
    │   ├── wechat_accounts.json # 多账号索引
    │   ├── wechat_accounts/ #   多账号独立 Chromium profile + storage_state
    │   ├── weibo_auth.json #   微博鉴权
    │   ├── weibo_uid_map.json
    │   ├── weibo_topic_map.json
    │   ├── toutiao_auth.json # 今日头条鉴权
    │   ├── xhs_auth.json   #   小红书鉴权
    │   ├── xhs_storage.json #  小红书 storage state
    │   ├── api_keys.json   #   API Key 本地存储
    │   └── wechat_chromium_profile/ # Chromium 用户数据
    └── logs/               # 运行日志
        └── runs/           # 审计日志文件
```

## 技术栈

| 层级 | 技术 |
|------|------|
| 后端 | Python 3.10+, FastAPI, Uvicorn |
| 前端 | React 18, TypeScript, Vite, Tailwind CSS |
| 状态管理 | Zustand |
| 浏览器自动化 | Playwright (Chromium) |
| AI | OpenAI 兼容 API（Mimo/DeepSeek/GLM/OpenAI/Qwen/MiniMax） |
| 编辑器 | CodeMirror + Markdown 编辑，Tiptap JSON 兼容层 |
| 图片处理 | Pillow |
| 桌面壳 | PyWebView |

## 配置说明

核心配置分组（在桌面 GUI 的设置页面配置，或通过环境变量设置）：

| 分组 | 变量 | 说明 | 默认值 |
|------|------|------|--------|
| **微博** | `WEIBO_COOKIE` | 登录 Cookie | — |
| | `WEIBO_UID` | 用户 UID | — |
| | `WEIBO_FETCH_MODE` | 抓取模式: `own` / `celebrities` / `mixed` / `super_topic` / `keyword` | 自动 |
| | `WEIBO_CELEBRITIES` | 明星列表（逗号分隔） | — |
| | `WEIBO_SEARCH_TAGS` | 搜索标签 | 美图,日常,时装周,美妆,穿搭 |
| | `WEIBO_KEYWORD_PAGES` | 关键词搜索页数 | 1 |
| | `WEIBO_SUPER_TOPICS` | 超话列表（逗号分隔） | — |
| **今日头条** | `TOUTIAO_COOKIE` | 登录 Cookie | — |
| | `TOUTIAO_USER_ID` | 用户 ID | — |
| | `TOUTIAO_FETCH_MODE` | 抓取模式: `feed` / `user` / `keyword` | feed |
| | `TOUTIAO_SEARCH_TAGS` | 搜索标签 | 时尚,明星,穿搭 |
| **小红书** | `XHS_COOKIE` | 登录 Cookie | — |
| | `XHS_UID` | 用户 UID | — |
| | `XHS_FETCH_MODE` | 抓取模式: `search` | search |
| | `XHS_SEARCH_TAGS` | 搜索标签 | 穿搭,美妆,护肤 |
| **AI 模型** | `AI_PROVIDER` | 供应商: `mimo` / `deepseek` / `glm` / `openai` / `qwen` / `minimax` | mimo |
| | `AI_MODEL` | 模型名 | mimo-chat |
| | `AI_API_KEY` | 通用 API Key | — |
| | `AI_BASE_URL` | 自定义 API 地址 | — |
| | `MIMO_API_KEY` | Mimo 专用 Key | — |
| | `DEEPSEEK_API_KEY` | DeepSeek 专用 Key | — |
| | `GLM_API_KEY` | GLM 专用 Key | — |
| | `OPENAI_API_KEY` | OpenAI 专用 Key | — |
| | `QWEN_API_KEY` | Qwen 专用 Key | — |
| | `MINIMAX_API_KEY` | MiniMax 专用 Key | — |
| **水印过滤** | `WATERMARK_FILTER` | 启用过滤 | true |
| | `WATERMARK_CORNER_RATIO` | 角部边缘强度阈值 | 1.38 |
| | `WATERMARK_BOTTOM_RATIO` | 底部边缘强度阈值 | 1.48 |
| | `WATERMARK_STRICT_MODE` | 严格模式 | true |
| | `MIN_CLEAN_IMAGES` | 最少干净图数 | 3 |
| | `ALLOW_WATERMARK_FALLBACK` | 无水印图时降级使用 | false |
| **发布控制** | `PLATFORM` | 数据源: `weibo` / `toutiao` / `xhs` | weibo |
| | `POST_LIMIT` | 每次处理条数 | 3 |
| | `WEIBO_PAGES` | 微博翻页数 | 2 |
| | `PUBLISH_INTERVAL_SECONDS` | 发布间隔（秒） | 10 |
| | `REQUIRE_CONFIRM` | 发布前确认 | true |
| **通用** | `REQUEST_TIMEOUT` | HTTP 请求超时（秒） | 20 |
| | `RETRY_TIMES` | 失败重试次数 | 3 |
| | `MATERIALS_PATH` | 自定义素材目录（默认 `data/images`） | — |
