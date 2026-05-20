# 项目名称
MediaForge 自动化内容发布系统

> **说明**：本文档源自项目初始设计，并已按当前实现进展补充到 2026-05-20。最新运行方式见 [README.md](../README.md)，面向用户的操作说明见 [USER_GUIDE.md](./USER_GUIDE.md)。

业务描述：实现一个可以借助现在AI的一个工作流 解决我的每天重复性的工作
1. 我需要运营一个微信公众号 主要的发布内容是明星 美女图片 我需要登陆帐号 去发布
2. 素材来源是 我登陆微博账号 去寻找一些好看的帖子 手动下载里面的每一张图片保存到本地
3. 我再去新建文字然后手动上传图片 然后取一个标题 以及选择一个好看的封面然后发布

---

# 一、项目目标

构建一个自动化工作流，实现以下流程：

1. 从微博抓取包含图片的帖子
2. 自动下载图片到本地
3. 使用 AI 生成标题、正文、排版建议和封面选择
4. 在桌面端管理文章草稿、发布队列和本地素材
5. 自动保存草稿或发布到微信公众号（图文消息）

目标：
- 降低人工操作成本（30min → 3min）
- 支持一键执行（CLI）和可视化桌面操作（GUI）
- 支持多平台扩展、多账号公众号发布、原创文章生产和本地素材管理

---

# 二、技术栈（已实现）

- Python 3.10+
- FastAPI + Uvicorn（桌面 GUI 后端）
- React 18 + TypeScript + Vite + Tailwind CSS（桌面 GUI 前端）
- Zustand（前端状态管理）
- requests（HTTP请求）
- playwright（浏览器自动化）
- OpenAI 兼容 Chat Completions API（Mimo / DeepSeek / GLM / OpenAI / Qwen / MiniMax）
- pillow（图片处理）
- PyWebView（桌面壳）
- CodeMirror + Markdown 编辑器（文章发布页）

> 初始设计仅计划 CLI + requests，实际已扩展为 CLI + 桌面 GUI 双模式。

---

# 三、项目结构

```
MediaForge/
├── main.py                # CLI 入口（调度流程）
├── config.py              # 配置管理（dataclass 单例）
├── services/
│   ├── platforms/         # 平台插件架构（weibo/toutiao）
│   ├── ai.py              # AI 标题/文章生成、润色、排版
│   ├── downloader.py      # 图片下载与水印过滤
│   ├── extensions.py      # 图片评分/封面/排版
│   ├── watermark.py       # 水印检测
│   ├── wechat.py          # 公众号发布
│   └── weibo_login.py     # 微博扫码登录
├── utils/                 # 工具模块
├── desktop/               # 桌面 GUI（FastAPI + React）
│   ├── api.py             #   REST API 路由（设置/发现/文章/队列/素材/账号）
│   ├── main.py            #   应用入口
│   └── web/               #   React 前端
└── data/                  # 运行时数据
    ├── images/            #   图片存储
    ├── queue.json         #   发布队列
    ├── state/             #   持久化状态（设置、文章、账号、操作记录）
    └── logs/              #   运行日志
```

---

# 四、核心流程

```
fetch_posts()                          # 微博/头条多平台
↓
download_images() + watermark_filter   # 下载 + 水印过滤
↓
score_images() + select_cover()        # AI/启发式评分 + 选封面
↓
generate_content()/generate_article()  # AI 生成标题/文章
↓
queue/article workspace                # 草稿、队列、人工编辑
↓
publish_article()                      # 保存草稿或公众号发布
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

* 支持多供应商切换（Mimo / DeepSeek / GLM / OpenAI / Qwen / MiniMax）
* 失败重试 + 兜底文案
* 支持正文生成、校对润色、去 AI 味儿、标题生成、Markdown 排版优化和对话式改写

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
* 多账号独立登录态（wechat_accounts.json + 独立 Chromium profile）
* iframe 操作支持
* 上传图片循环处理
* 支持保存草稿与直接发布

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
- **Article Publish** — 文章草稿、灵感搜索、封面搜索、AI 写作工具、发布流转
- **Queue** — 发布队列管理、AI 润色、保存草稿/发布/删除
- **Materials** — 本地素材（按艺人+场景分组）、右键菜单管理
- **Settings** — 主题切换、AI 模型配置、微博/头条配置、微信公众号多账号、素材目录、水印参数

---

# 六、配置设计（config.py）

配置来源优先级：

1. 环境变量
2. 桌面设置文件 `data/state/settings.json`
3. 独立鉴权/密钥存储（`weibo_auth.json`、`api_keys.json`）
4. `config.py` 默认值

主要配置分组：

- 平台：`PLATFORM`、`WEIBO_FETCH_MODE`、`TOUTIAO_FETCH_MODE`
- AI：`AI_PROVIDER`、`AI_MODEL`、`AI_BASE_URL`、供应商 API Key
- 运行：`POST_LIMIT`、`WEIBO_PAGES`、`PUBLISH_INTERVAL_SECONDS`
- 水印：`WATERMARK_FILTER`、阈值、严格模式、最少干净图数
- 素材：`MATERIALS_PATH`

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

## 5. 文章生产工作台

```python
generate_article(topic, title)
polish_article(content)
de_ai_article(content)
generate_article_title(content)
optimize_layout(content)
chat_article(content, instruction)
```

## 6. 微信公众号多账号

```python
add_account(name)
set_default_account(account_id)
get_account_paths(account_id)
publish_article(..., account_id=account_id)
```

---

# 十一、风控策略

* 每次最多发布 1~3 篇（CLI）
* 发布间隔 ≥ 10 秒 + 随机延时
* 支持人工确认模式（REQUIRE_CONFIRM）
* 桌面 GUI 需手动点击发布

---

# 十二、产品定位与二期方向

## 1. 产品定位

MediaForge 二期不再定位为单纯的“自动发图文脚本”，而应定位为：

> 面向微信公众号运营者的 AI 内容生产与发布工作台，帮助用户从素材发现、筛选、写作、排版到发布，把重复性的图文运营流程压缩成一个可控的半自动工作流。

关键词：

- **半自动**：AI 负责提效，用户保留最终审核和发布决策。
- **可控**：发布前必须清楚账号、标题、封面、正文、图片和风险状态。
- **工作台**：围绕每天的运营任务组织入口，而不是堆叠功能按钮。
- **矩阵扩展**：多公众号账号、多素材目录、多内容风格是后续核心增长方向。

## 2. 核心用户场景

### 场景 A：找图发文

适合运营图片合集、明星动态、穿搭美图类账号。

流程：

1. 选择平台与抓取模式
2. 搜索并筛选帖子
3. 下载图片并水印过滤
4. 查看图片评分与推荐封面
5. 加入发布队列
6. 编辑标题、正文、封面
7. 发布前预览确认
8. 保存公众号草稿或直接发布

### 场景 B：写文章发文

适合原创、半原创、热点改写类账号。

流程：

1. 新建文章草稿
2. 搜索灵感或手动输入主题
3. 选择文章类型与语气
4. AI 生成初稿
5. 校对、去 AI 味儿、标题优化、排版优化
6. 搜索或选择封面
7. 加入发布队列或直接进入发布确认
8. 保存公众号草稿或直接发布

## 3. 二期设计原则

- **主路径优先**：优先打磨“找图发文”和“写文章发文”两条路径，不做无序功能堆叠。
- **发布安全优先**：任何直接发布动作都必须经过清晰的预览和账号确认。
- **AI 流程化**：AI 能力应围绕内容生产步骤组织，而不是只作为分散按钮存在。
- **状态透明**：文章、队列、账号、发布任务都要有明确状态和可恢复路径。
- **本地优先**：继续保持桌面端、本地素材、本地登录态的产品优势。

---

# 十三、二期迭代计划

二期目标：把现有功能收束成稳定、清晰、可每天使用的内容运营工作台。

## P0：主流程体验版（建议 v1.4）

目标：让用户打开应用后，不用思考就能完成找图、写文、确认、发布。

### 1. 首页工作台重构

当前 Dashboard 应从状态展示页升级为工作台首页。

核心模块：

- **找图发文**：进入 Discovery 主流程
- **写文章发文**：进入 Article Publish 主流程
- **当前默认公众号账号**：显示账号名、登录状态、切换入口
- **待发布队列**：展示最近待发布内容
- **最近草稿**：展示最近编辑文章
- **最近操作**：保留操作记录，但降低优先级

验收标准：

- 用户首次进入首页即可看到两条主工作流入口
- 默认公众号账号与登录状态在首页可见
- 点击入口后能直接进入对应页面并开始操作

### 2. 发布前预览确认

新增统一发布确认层，覆盖文章发布页和发布队列。

确认内容：

- 当前公众号账号
- 发布动作：保存草稿 / 直接发布
- 标题
- 封面
- 正文预览
- 图片数量
- 图片缩略图
- 风险提示

基础风险提示：

- 未选择公众号账号
- 账号未登录
- 标题为空或过长
- 正文为空
- 封面为空
- 图片为空
- 图片数量低于建议值
- 存在疑似水印图片

验收标准：

- 直接发布前必须出现确认层
- 保存公众号草稿前也需要展示关键信息确认
- 用户能在确认层取消、返回编辑或继续发布

### 3. 当前账号状态常驻可见

在侧边栏底部或顶部区域增加当前默认公众号账号状态。

展示信息：

- 默认账号名称
- 登录状态
- 快速进入设置页
- 多账号场景下支持切换入口

验收标准：

- 用户在任何主要页面都能知道当前默认公众号账号
- 未登录时有明显提示
- 发布时使用的账号与页面显示一致

### 4. 错误提示产品化

将技术错误统一转换为用户能理解的提示。

示例：

- `WEIBO_COOKIE` 失效 → “微博登录已失效，请重新扫码”
- AI Base URL 为空 → “当前 AI 服务需要配置 Base URL”
- 公众号未登录 → “公众号账号未登录，请先扫码”
- Playwright 找不到编辑器 → “微信后台页面结构可能已更新，请重试或保存日志”

验收标准：

- 常见失败场景不直接暴露底层异常栈
- 错误提示包含下一步操作建议
- 发布失败保留技术日志，便于排查

## P1：内容质量与效率版（建议 v1.5）

目标：提高内容质量，减少用户反复编辑成本。

### 1. 标题多候选

AI 标题生成从单一结果升级为多候选。

候选类型：

- 稳妥版
- 点击率版
- 温柔版
- 热点版
- 简短版

验收标准：

- 一次生成 3-5 个标题候选
- 用户点击候选即可替换当前标题
- 候选标题仍需满足字数与合规约束

### 2. 文章模板

新增文章生成模板，提高 AI 输出稳定性。

首批模板：

- 图片合集模板
- 明星动态模板
- 穿搭解析模板
- 今日精选模板
- 简短图文模板

模板参数：

- 文章类型
- 语气风格
- 字数范围
- 是否带小标题
- 是否适合图集

验收标准：

- 用户生成文章前可以选择模板
- 不同模板生成结构有明显差异
- 模板配置可在前端扩展，不强依赖后端改代码

### 3. 图片评分可视化

把现有图片评分能力产品化。

展示维度：

- 推荐封面
- 清晰度
- 构图/主体
- 疑似水印
- 是否重复
- 建议保留/删除

验收标准：

- Discovery 和 Materials 中可看到评分结果
- 系统推荐封面有可解释原因
- 用户可手动覆盖系统推荐

### 4. 草稿状态流转

文章和队列需要更清晰的状态机。

建议状态：

- `draft`：草稿
- `reviewing`：待检查
- `queued`：待发布
- `saved_to_wechat`：已保存公众号草稿
- `published`：已发布
- `failed`：发布失败

验收标准：

- 文章列表和队列显示状态
- 发布成功/失败后自动更新状态
- 失败状态保留错误信息和重试入口

## P2：安全合规与矩阵运营版（建议 v1.6-v2.0）

目标：从单人提效工具升级为长期运营系统。

### 1. 发布前合规检查

新增轻量合规检查，不代替人工判断。

检查项：

- 敏感词
- 标题党风险
- 正文过短
- 封面缺失
- 水印风险
- 图片来源风险提示
- 重复发布风险

验收标准：

- 发布确认层展示风险等级
- 风险项有具体原因和处理建议
- 高风险时需要用户二次确认

### 2. 矩阵账号运营

围绕多公众号账号扩展运营能力。

能力：

- 队列按账号分组
- 每个账号独立默认风格
- 每个账号独立素材偏好
- 每个账号发布历史
- 批量保存公众号草稿

验收标准：

- 用户可以按账号查看待发布内容
- 文章创建时可指定目标账号
- 发布历史可追溯到账号、文章、时间、结果

### 3. 素材资产库

从文件浏览升级为可运营的素材库。

元数据：

- 人物
- 场景
- 标签
- 来源平台
- 来源链接
- 是否已使用
- 使用次数
- 推荐封面标记

验收标准：

- 素材可按标签、人物、场景筛选
- 已使用素材有标记
- 发布文章后自动记录素材使用关系

### 4. 发布效果回填

为后续智能选题和标题优化预留数据闭环。

数据：

- 阅读量
- 点赞
- 分享
- 收藏
- 发布时间
- 标题
- 封面
- 账号

首期可支持手动录入，后续再评估自动抓取。

验收标准：

- 已发布文章可录入效果数据
- 可按账号查看基础效果趋势
- 后续 AI 标题/模板优化可引用历史效果

---

# 十四、二期优先级结论

短期不建议继续横向增加新平台或新 AI 供应商。二期应优先完成：

1. 首页工作台重构
2. 发布前预览确认
3. 当前公众号账号常驻可见
4. 错误提示产品化
5. 标题多候选
6. 文章模板
7. 草稿状态流转

核心判断标准：

> 用户每天打开 MediaForge，能稳定完成“找素材 / 写文章 / 确认 / 发布”，并且始终知道自己将用哪个账号发布什么内容。

---

# 十五、最终形态

项目已从最初的 CLI 脚本进化为完整的 CLI + 桌面 GUI 双模式内容发布系统，支持微博/头条双数据源、AI 全流程处理、原创文章工作台、本地素材管理、微信公众号多账号自动化发布和跨平台安装包构建。
