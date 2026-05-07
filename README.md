# MediaForge · 图文工坊

自动化的微信公众号内容发布工具。从微博发现优质图文 → AI 智能评分与文案生成 → 一键发布到微信公众号。

## 功能特性

- **微博图文发现** — 支持明星列表、本人时间线、超话、关键词等五种抓取模式
- **智能水印过滤** — 基于边缘检测的启发式算法，自动识别并过滤水印图片
- **AI 图片评分** — Vision API + 启发式回退，多维度评分筛选优质图片
- **AI 文案生成** — 自动生成标题和描述，支持 Mimo / DeepSeek / GLM / OpenAI 多供应商
- **发布队列管理** — 预览、编辑文案、选择封面、保存草稿或直接发布
- **双模式运行** — 命令行批量处理 + 桌面 GUI 交互式管理
- **主题系统** — 浅色/深色/跟随系统，4 套主题配色可切换

## 快速开始

### 环境准备

```bash
pip install -r requirements.txt
playwright install chromium
cp .env.example .env
```

编辑 `.env`，配置必填项：

| 变量 | 说明 |
|------|------|
| `WEIBO_COOKIE` | 微博登录 Cookie |
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
新增一个今日头条的抓取数据平台配置 支持可切换 微博或者今日头条 后续可能还会新增平台 帮我实现 且要支持后续的可扩展性以及迭代优
## 项目结构

```
MediaForge/
├── main.py                 # CLI 入口
├── config.py               # 配置管理
├── .env                    # 环境变量
├── requirements.txt        # Python 依赖
├── services/
│   ├── weibo.py            # 微博数据采集
│   ├── downloader.py       # 图片下载与过滤
│   ├── ai.py               # AI 文案生成
│   ├── wechat.py           # 公众号发布
│   ├── extensions.py       # 图片评分/封面/排版
│   └── watermark.py        # 水印检测
├── utils/
│   ├── logger.py           # 日志
│   ├── file.py             # 文件与缓存
│   ├── audit.py            # 审计日志
│   └── env_manager.py      # .env 管理
├── desktop/
│   ├── main.py             # 桌面应用入口
│   ├── api.py              # FastAPI 路由
│   ├── app_state.py        # 应用状态管理
│   ├── static/             # 构建产物
│   └── web/                # React 前端源码
│       ├── src/
│       │   ├── pages/      # 页面组件
│       │   ├── components/ # 通用组件
│       │   ├── api/        # API 客户端
│       │   ├── stores/     # Zustand 状态
│       │   └── index.css   # 全局样式
│       ├── tailwind.config.ts
│       └── vite.config.ts
└── data/                   # 运行时数据
    ├── images/             # 下载图片
    ├── posts.json          # 去重缓存
    ├── state/              # 持久化状态
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
- **水印过滤** — 开关、阈值、严格模式、最少干净图数
- **AI 模型** — 供应商、模型名、API Key、Base URL
- **发布控制** — 每次处理条数、发布间隔、确认发布
