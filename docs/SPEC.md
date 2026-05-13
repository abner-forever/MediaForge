# 项目名称
MediaForge 自动化内容发布系统

> **说明**：本文档为项目初始设计文档，记录了最初的需求分析与架构设计。实际实现已在迭代中扩展，详见 [README.md](../README.md) 和 [CLAUDE.md](../CLAUDE.md) 获取最新项目状态。

业务描述：实现一个可以借助现在AI的一个工作流 解决我的每天重复性的工作
1. 我需要运营一个微信公众号 主要的发布内容是明星 美女图片 我需要登陆帐号 去发布
2. 素材来源是 我登陆微博账号 去寻找一些好看的帖子 手动下载里面的每一张图片保存到本地
3. 我再去新建文字然后手动上传图片 然后取一个标题 以及选择一个好看的封面然后发布

---

# 一、项目目标

构建一个自动化工作流，实现以下流程：

1. 从微博抓取包含图片的帖子
2. 自动下载图片到本地
3. 使用 AI 生成标题和文案
4. 自动发布到微信公众号（图文消息）

目标：
- 降低人工操作成本（30min → 3min）
- 支持一键执行（CLI）
- 支持后续扩展（AI筛选 / 定时任务 / 原创内容）

---

# 二、技术栈（已实现）

- Python 3.10+
- FastAPI + Uvicorn（桌面 GUI 后端）
- React 18 + TypeScript + Vite + Tailwind CSS（桌面 GUI 前端）
- Zustand（前端状态管理）
- requests（HTTP请求）
- playwright（浏览器自动化）
- openai / DeepSeek / GLM / Mimo 多供应商 AI API
- pillow（图片处理）
- PyWebView（桌面壳）

> 初始设计仅计划 CLI + requests，实际已扩展为 CLI + 桌面 GUI 双模式。

---

# 三、项目结构

```
MediaForge/
├── main.py                # CLI 入口（调度流程）
├── config.py              # 配置管理（dataclass 单例）
├── services/
│   ├── platforms/         # 平台插件架构（weibo/toutiao）
│   ├── ai.py              # AI 文案生成
│   ├── downloader.py      # 图片下载与水印过滤
│   ├── extensions.py      # 图片评分/封面/排版
│   ├── watermark.py       # 水印检测
│   ├── wechat.py          # 公众号发布
│   └── weibo_login.py     # 微博扫码登录
├── utils/                 # 工具模块
├── desktop/               # 桌面 GUI（FastAPI + React）
│   ├── api.py             #   REST API 路由
│   ├── main.py            #   应用入口
│   └── web/               #   React 前端
└── data/                  # 运行时数据
    ├── images/            #   图片存储
    ├── state/             #   持久化状态
    └── logs/              #   运行日志
```

---

# 四、核心流程

```
fetch_posts()                          # 微博/头条多平台
↓
download_images() + watermark_filter   # 下载 + 水印过滤
↓
score_images() + select_cover()        # AI 评分 + 选封面
↓
generate_content()                     # AI 生成标题
↓
publish_article()                      # 公众号发布
```

---

# 五、模块设计

## 1. 数据采集模块（services/platforms/）

### 功能
- 多平台帖子抓取（微博、今日头条）
- 提取文本 + 图片 URL
- 标准化 Post 字典格式

### 输入
平台、模式、页码、搜索参数

### 输出
```python
[
  {
    "id": "post_id",
    "text": "帖子内容",
    "images": ["url1", "url2"],
    "celebrity": "艺人名",
    "scene": "场景标签",
    "source": "数据来源",
    "screen_name": "作者名",
    "created_at": "时间戳"
  }
]
```

### 要求

* 使用 cookie 登录
* 过滤无图内容
* 支持去重缓存

---

## 2. 图片下载模块（downloader.py）

### 功能

* 并发下载图片到本地
* 水印过滤（调用 watermark.py）

### 输入

```python
images: List[str]
celebrity: str
scene: str
post_slug: str
```

### 输出

```python
(kept_images: List[str], dropped_count: int)
```

### 要求

* 目录结构 images/<艺人>/<场景>/<帖子>/
* 水印过滤后的干净图列表
* 严格模式可跳过干净图不足的帖子

---

## 3. AI 模块（ai.py）

### 功能

生成标题（20字以内）

### 输入

```python
text: str
```

### 输出

```python
(title: str, desc: str)
```

### Prompt 规范（已更新）

```
你是公众号运营专家，请润色以下内容，生成吸引点击的标题（20字以内）：
风格：轻松、有吸引力、不违规
请严格返回 JSON：{"title":"..."}
```

### 要求

* 支持多供应商切换（Mimo / DeepSeek / GLM / OpenAI）
* 失败重试 + 兜底文案

---

## 4. 公众号发布模块（wechat.py）

### 功能

自动发布图文消息

### 技术

playwright（浏览器自动化）

### 输入

```python
title: str
content: str
images: List[str]
dry_run: bool
```

### 流程

1. 打开 [https://mp.weixin.qq.com/](https://mp.weixin.qq.com/)
2. 使用 storage_state 登录（首次扫码）
3. 点击「新建图文」
4. 填写标题
5. 填写正文
6. 上传图片
7. 选择封面
8. 点击发布 / 保存草稿

### 要求

* 登录态持久化（wechat.json）
* iframe 操作支持
* 上传图片循环处理

---

## 5. 主流程（main.py）

### 功能

串联所有模块（CLI 模式）

### 流程

```python
posts = platform_svc.fetch_posts(mode, max_pages=pages)

for post in posts:
    images, dropped = download_images(...)
    title, desc = generate_content(...)
    cover = select_cover(images)

    if not dry_run:
        publish_article(title, content, images, dry_run=False)
```

### 要求

* CLI 参数：--platform / --mode / --limit / --pages / --dry-run / --ignore-post-cache
* 支持限制处理数量（风控 1~3 条）
* 异常不中断整体流程

---

## 6. 桌面 GUI（desktop/）

### 功能

交互式图形界面，覆盖完整工作流

### 页面

- **Dashboard** — 健康状态、统计数据、快捷操作、最近操作记录
- **Discovery** — 搜索参数配置、帖子列表、图片画廊、AI 评分
- **Queue** — 发布队列管理、AI 润色、保存草稿/发布/删除
- **Materials** — 本地素材（按艺人+场景分组）、右键菜单管理
- **Settings** — 主题切换、AI 模型配置、微博配置、水印参数

---

# 六、配置设计（config.py）

通过环境变量配置：

---

# 七、CLI 设计

```bash
python main.py
python main.py --limit 5 --pages 2
python main.py --platform toutiao --mode keyword
python main.py --dry-run
```

说明：

- `--limit`：限制处理条数（1~3）
- `--pages`：抓取页数
- `--platform`：平台选择（weibo/toutiao）
- `--mode`：抓取模式
- `--dry-run`：不发布，仅打印
- `--ignore-post-cache`：忽略去重缓存

---

# 八、异常处理

* 网络失败（重试3次）
* AI接口失败（重试 + 兜底文案）
* 图片下载失败（跳过单个图片）
* 发布失败（记录日志，不中断流程）

---

# 九、日志系统

- Python logging 模块，按天轮转
- 桌面 GUI 操作记录（operations.json）
- CLI 审计日志（data/logs/）

---

# 十、扩展点（已实现）

## 1. 图片筛选（AI Vision）

```python
def score_image(path) -> float
```

## 2. 自动封面选择

```python
def select_cover(images) -> str
```

## 3. HTML排版

```python
def build_html(desc, images) -> str
```

## 4. 多平台支持

```python
# services/platforms/base.py
class PlatformService(Protocol):
    def fetch_posts(mode, ...) -> List[Dict]
```

---

# 十一、风控策略

* 每次最多发布 1~3 篇（CLI）
* 发布间隔 ≥ 10 秒 + 随机延时
* 支持人工确认模式（REQUIRE_CONFIRM）
* 桌面 GUI 需手动点击发布

---

# 十二、最终形态

项目已从最初的 CLI 脚本进化为完整的 CLI + 桌面 GUI 双模式内容发布系统，支持微博/头条双数据源、AI 全流程处理、微信公众号自动化发布。
