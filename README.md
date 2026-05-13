# MediaForge · 图文工坊

![构建状态](https://img.shields.io/github/actions/workflow/status/abner-forever/MediaForge/build.yml?branch=main&logo=github&label=%E6%9E%84%E5%BB%BA)
![版本](https://img.shields.io/github/v/release/abner-forever/MediaForge?logo=semver&label=%E7%89%88%E6%9C%AC)
![Python](https://img.shields.io/badge/Python-3.10%2B-blue)
![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows-lightgrey)

自动化的微信公众号内容发布工具。从微博/头条发现优质图文 → AI 智能评分与文案生成 → 一键发布到微信公众号。

## 功能特性

- **多平台图文发现** — 支持微博（明星列表、本人时间线、超话、关键词五种模式）和今日头条
- **微博扫码登录** — 内置 WebView 扫码获取 Cookie，无需手动复制
- **智能水印过滤** — 基于边缘检测的启发式算法，自动识别并过滤水印图片
- **AI 图片评分** — Vision API + 启发式回退，多维度评分筛选优质图片
- **AI 文案生成** — 自动生成标题，支持 Mimo / DeepSeek / GLM / OpenAI 多供应商
- **发布队列管理** — 编辑文案、选择封面、保存草稿或直接发布
- **双模式运行** — 命令行批量处理 + 桌面 GUI 交互式管理
- **主题系统** — 浅色/深色/跟随系统，4 套主题配色可切换
- **素材管理** — 按艺人+场景分组的本地图片浏览与管理

## 快速开始

### 环境准备

```bash
pip install -r requirements.txt
playwright install chromium   # 微信发布需要浏览器引擎；安装包已内置，开发环境需手动安装
cp .env.example .env
```

编辑 `.env`，配置必填项：

| 变量 | 说明 |
|------|------|
| `WEIBO_COOKIE` | 微博登录 Cookie（也可在 GUI 中扫码获取） |
| `AI_API_KEY` | AI 模型 API Key |
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
npm install
npm run build
cd ..
python3 main.py
```

浏览器访问 `http://127.0.0.1:8765` 即可使用。macOS 下会自动打开 PyWebView 原生窗口。

### 前端开发

```bash
cd desktop/web
npm run dev    # Vite 热更新，端口 5173，API 代理到 8765
```

### 打包桌面应用

```bash
# 构建前端
cd desktop/web && npm ci && npm run build

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
| **今日头条** (`toutiao`) | `feed` / `user` / `keyword` | 信息流推荐、用户主页、关键词搜索 |

采用 `services/platforms/` 插件架构，新增平台只需实现 `PlatformService` 协议。

## 项目结构

```
MediaForge/
├── main.py                 # CLI 入口（调度流程）
├── config.py               # 配置管理（dataclass 单例）
├── .env                    # 环境变量
├── .env.example            # 配置模板
├── requirements.txt        # Python 依赖
├── services/
│   ├── platforms/          # 平台插件架构
│   │   ├── base.py         #   PlatformService 协议
│   │   ├── weibo.py        #   微博数据采集
│   │   └── toutiao.py      #   今日头条数据采集
│   ├── ai.py               # AI 文案生成
│   ├── downloader.py       # 图片下载与水印过滤
│   ├── extensions.py       # 图片评分/封面/排版
│   ├── watermark.py        # 水印检测
│   ├── wechat.py           # 公众号发布（Playwright）
│   └── weibo_login.py      # 微博扫码登录
├── utils/
│   ├── logger.py           # 日志
│   ├── file.py             # 文件与缓存
│   ├── audit.py            # 审计日志（操作记录）
│   ├── env_manager.py      # .env 管理
│   ├── api_key_store.py    # API Key 本地加密存储
│   └── pathsafe.py         # 安全路径处理
├── desktop/
│   ├── main.py             # 桌面应用入口
│   ├── api.py              # FastAPI 路由（~30 端点）
│   ├── app_state.py        # 应用状态管理
│   ├── build.spec          # PyInstaller 打包配置
│   ├── build_dmg.sh        # macOS DMG 制作脚本
│   ├── setup.iss           # Windows 安装包配置
│   ├── run_console.bat     # Windows 调试控制台
│   ├── static/             # 前端构建产物
│   └── web/                # React 前端源码
│       └── src/
│           ├── pages/      # Dashboard / Discovery / Queue / Materials / Settings
│           ├── components/ # ConfirmDialog / ContextMenu / Layout / Lightbox / 等
│           ├── hooks/      # useLoading
│           ├── api/        # API 客户端
│           ├── stores/     # Zustand 全局状态
│           └── index.css   # 全局样式 + 主题变量
└── data/                   # 运行时数据
    ├── images/             # 下载图片（按艺人/场景/帖子组织）
    ├── posts.json          # 去重缓存
    ├── state/              # 持久化状态
    │   ├── queue.json      #   发布队列
    │   ├── operations.json #   操作记录
    │   ├── wechat.json     #   公众号登录态
    │   ├── weibo_uid_map.json
    │   ├── weibo_topic_map.json
    │   ├── api_keys.json   #   加密存储的 API Key
    │   └── wechat_chromium_profile/  # Chromium 用户数据
    └── logs/               # 运行日志
```

## 技术栈

| 层级 | 技术 |
|------|------|
| 后端 | Python 3.10+, FastAPI, Uvicorn |
| 前端 | React 18, TypeScript, Vite, Tailwind CSS |
| 状态管理 | Zustand |
| 浏览器自动化 | Playwright (Chromium) |
| AI | OpenAI 兼容 API（Mimo/DeepSeek/GLM/OpenAI） |
| 图片处理 | Pillow |
| 桌面壳 | PyWebView |

## 配置说明

完整配置项参见 `.env.example`。核心配置分组：

- **微博抓取** — Cookie、UID、抓取模式、明星列表、搜索标签、超话
- **今日头条** — Cookie、用户 ID、抓取模式、搜索标签
- **水印过滤** — 开关、阈值、严格模式、最少干净图数、降级开关
- **AI 模型** — 供应商、模型名、API Key、Base URL
- **发布控制** — 每次处理条数、发布间隔、确认发布
