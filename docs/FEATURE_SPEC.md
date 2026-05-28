# 功能迭代规格说明

> **说明**：本文档定义 MediaForge 下一阶段的 5 个业务功能模块的详细设计。每个模块包含数据模型、API 端点、前端交互、实现要点和验收标准。

---

# 一、数据分析与效果追踪

## 1.1 现状

- 3 个基础端点：`GET/POST /api/effects`、`GET /api/effects/{item_id}`
- `PublishEffect` 数据模型已有：`reads`、`likes`、`shares`、`favorites`
- 数据手动录入，无自动化采集
- 无专用前端页面，仅在文章发布页有入口

## 1.2 目标

提供发布效果的可视化分析，帮助运营者识别最佳发布时间、最优内容类型，用数据驱动内容策略。

## 1.3 数据模型扩展

```typescript
interface PublishEffect {
  item_id: string;
  title?: string;
  account_id?: string;
  publish_time?: string;
  // 基础指标
  reads: number;
  likes: number;
  shares: number;
  favorites: number;
  // 新增指标
  comments?: number;          // 评论数
  new_followers?: number;     // 新增关注
  // 内容维度标签
  content_type?: 'image' | 'article';  // 内容类型
  source_platform?: string;   // 素材来源平台（weibo/toutiao/xhs）
  celebrity?: string;         // 关联艺人
  image_count?: number;       // 图片数量
  // 元数据
  updated_at: string;
  created_at?: string;
}
```

```typescript
// 聚合分析结果
interface EffectSummary {
  total_posts: number;
  total_reads: number;
  total_likes: number;
  avg_reads: number;
  avg_likes: number;
  best_publish_hour: number;       // 最佳发布小时（0-23）
  best_day_of_week: number;        // 最佳发布星期（0-6）
  top_celebrities: Array<{ name: string; avg_reads: number; count: number }>;
  trend: Array<{ date: string; reads: number; likes: number; posts: number }>;
}
```

## 1.4 API 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/effects` | 列表（已有） |
| `GET` | `/api/effects/{item_id}` | 单条详情（已有） |
| `POST` | `/api/effects/{item_id}` | 保存/更新（已有） |
| `GET` | `/api/effects/summary` | **新增** 聚合分析数据 |
| `GET` | `/api/effects/trend?days=30` | **新增** 趋势图数据（按天聚合） |
| `GET` | `/api/effects/compare` | **新增** 多维度对比（按来源/艺人/内容类型） |
| `GET` | `/api/effects/export?format=csv` | **新增** 导出报表 |

### `GET /api/effects/summary` 响应

```json
{
  "total_posts": 128,
  "total_reads": 45600,
  "total_likes": 3200,
  "avg_reads": 356,
  "avg_likes": 25,
  "best_publish_hour": 20,
  "best_day_of_week": 5,
  "top_celebrities": [
    { "name": "迪丽热巴", "avg_reads": 520, "count": 15 },
    { "name": "杨幂", "avg_reads": 480, "count": 12 }
  ]
}
```

### `GET /api/effects/trend?days=30` 响应

```json
{
  "trend": [
    { "date": "2026-05-01", "reads": 1200, "likes": 80, "posts": 3 },
    { "date": "2026-05-02", "reads": 950, "likes": 65, "posts": 2 }
  ]
}
```

## 1.5 前端页面

新增 `Effects` 页面（路由 `/effects`），包含：

1. **数据概览卡片**：总阅读/总点赞/平均阅读/发布总数
2. **趋势折线图**：近 7/14/30 天的阅读量和点赞趋势
3. **最佳时段热力图**：按星期 × 小时展示阅读量分布
4. **艺人效果排行**：按平均阅读量排序的艺人列表
5. **内容对比**：按来源平台/内容类型的阅读量对比柱状图
6. **导出按钮**：CSV 下载

图表库建议：使用轻量的 CSS + SVG 方案（项目当前无图表依赖，避免引入 ECharts 等重型库）。

## 1.6 实现要点

- `app_state.py` 中 `update_publish_effect` 已支持 merge 更新，需扩展字段
- `summary` 端点在内存中聚合，数据量小时无需数据库
- `trend` 端点按 `publish_time` 分组，需处理无数据日期的零值填充
- `export` 端点返回 `text/csv` 的 StreamingResponse

## 1.7 验收标准

- [ ] 效果页面展示 4 个概览指标卡片
- [ ] 趋势图正确展示近 30 天数据
- [ ] 艺人排行按平均阅读量降序排列
- [ ] CSV 导出包含所有字段且 Excel 可直接打开
- [ ] 无发布数据时展示空状态引导

---

# 二、AI 能力增强

## 2.1 现状

- AI 已支持：标题生成、文章生成、润色、去 AI 味、排版优化、明星推荐
- 图片评分使用 Vision API（4 维度 0-100 分）
- 所有 AI 调用走统一的 `services/ai/client.py`，支持 6 个 provider

## 2.2 新增功能

### 2.2.1 自动配图建议

根据文章正文内容，从素材库中推荐最匹配的图片。

**API：**

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/api/articles/{article_id}/suggest-images` | 为文章推荐配图 |

**请求体：**

```json
{
  "limit": 10,
  "score_threshold": 60
}
```

**实现逻辑：**

1. 提取文章关键词（艺人名、场景、主题）
2. 从素材元数据中筛选匹配的图片（按 `celebrity`、`tags`、`scene` 匹配）
3. 用 Vision API 对候选图片做语义相关性评分
4. 返回按相关性排序的图片列表

**响应：**

```json
{
  "suggestions": [
    { "path": "迪丽热巴/日常/img_1.jpg", "score": 92, "reason": "图片风格与文章清新主题高度匹配" },
    { "path": "杨幂/活动/img_3.jpg", "score": 85, "reason": "人物气质与文章描述一致" }
  ]
}
```

### 2.2.2 多标题 A/B 测试

已有的 `generate_article_title_candidates` 生成 5 个标题，扩展为支持追踪每个标题的实际表现。

**API：**

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/articles/{article_id}/title-variants` | 获取标题候选及效果 |
| `POST` | `/api/articles/{article_id}/title-variants/{variant_id}/select` | 选择使用某个标题 |

**数据模型扩展：**

```typescript
interface TitleVariant {
  id: string;
  title: string;
  type: 'safe' | 'clickbait' | 'gentle' | 'trending' | 'short';
  selected: boolean;
  effect?: {
    reads: number;
    likes: number;
  };
}
```

**实现逻辑：**

- 文章生成标题候选时，同时保存到 `data/state/title_variants.json`
- 用户选择某个标题后标记 `selected=true`
- 发布后将效果数据关联到对应 variant

### 2.2.3 多模态图片内容理解

用 Vision API 分析图片内容，生成结构化描述，用于：
- 自动打标签（场景、服装、风格、情绪）
- 辅助配图建议
- 提升搜索精度

**API：**

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/api/materials/analyze` | 批量分析图片内容 |

**请求体：**

```json
{
  "paths": ["迪丽热巴/日常/img_1.jpg", "杨幂/活动/img_3.jpg"]
}
```

**响应：**

```json
{
  "results": [
    {
      "path": "迪丽热巴/日常/img_1.jpg",
      "tags": ["户外", "清新", "自然光", "微笑"],
      "scene": "日常",
      "style": "日系",
      "emotion": "愉悦"
    }
  ]
}
```

**实现逻辑：**

- 复用现有 `_score_with_vision` 的 Vision API 通道
- 新增 prompt 要求返回结构化 JSON：`{tags, scene, style, emotion}`
- 分析结果写入 `MaterialMeta.tags` 和新增字段

### 2.2.4 风格迁移

基于历史爆款文章的写作风格生成新文章。

**API：**

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/api/articles/generate-with-style` | 基于风格模板生成文章 |

**请求体：**

```json
{
  "topic": "迪丽热巴最新活动照",
  "reference_article_id": "article-uuid-123",
  "word_count": 800
}
```

**实现逻辑：**

1. 读取参考文章内容
2. 用 AI 提取风格特征（语气、句式、段落结构、标题风格）
3. 将风格特征作为 system prompt 的一部分
4. 生成新文章时遵循该风格

## 2.3 验收标准

- [ ] 自动配图建议返回与文章内容相关的图片
- [ ] 多模态分析能正确识别图片的场景和风格标签
- [ ] 风格迁移生成的文章能体现参考文章的风格特征
- [ ] 所有 AI 功能在 API Key 未配置时给出友好提示

---

# 三、内容源扩展

## 3.1 现状

- 已支持 3 个平台：微博、头条、小红书
- 平台插件架构已就绪：`PlatformService` Protocol + 注册表模式
- 新增平台只需实现 `check_auth()` 和 `fetch_posts()` 两个方法

## 3.2 新增平台

### 3.2.1 RSS 订阅源

通用 RSS/Atom 解析器，支持任意 RSS 源。

**新增文件：** `services/platforms/rss.py`

```python
class RSSMeta:
    id = "rss"
    name = "RSS 订阅"
    auth_fields = []  # 无需认证
    fetch_modes = {"feed": "订阅源"}
    default_fetch_mode = "feed"

class RSSService:
    @staticmethod
    def check_auth() -> bool:
        return bool(settings.rss_feeds)  # 需要至少配置一个源

    @staticmethod
    def fetch_posts(mode, *, max_pages=1, rss_url="", **kwargs) -> list:
        # 使用 feedparser 解析 RSS
        # 提取含图片的条目
        # 标准化为 Post dict
```

**配置扩展（Settings 页面新增）：**

```typescript
interface RSSSettings {
  rss_feeds: Array<{
    url: string;
    name: string;
    enabled: boolean;
    filter_keywords?: string[];  // 关键词过滤
  }>;
}
```

**依赖：** `pip install feedparser`

**优势：** 无需登录、无反爬风险、维护成本极低。

### 3.2.2 抖音图文

**新增文件：** `services/platforms/douyin.py`

**实现方案：**

- 方案 A：Playwright 自动化（类似小红书登录流程）
- 方案 B：第三方 API 服务（如 RapidAPI 的 Douyin API）
- **推荐方案 A**：与现有架构一致，不引入外部依赖

**认证方式：** Cookie（与小红书类似）

**fetch_modes：**
- `user` — 指定用户主页的图文
- `hashtag` — 指定话题标签下的图文

**注意：** 抖音反爬较强，需要：
- 浏览器指纹伪装
- 请求频率限制（建议 2-3 秒/请求）
- Cookie 有效期较短，需要频繁刷新

### 3.2.3 自定义爬虫插件机制

允许用户通过配置文件定义自己的内容源。

**插件定义格式（JSON/YAML）：**

```json
{
  "id": "custom_site",
  "name": "自定义站点",
  "base_url": "https://example.com",
  "endpoints": {
    "search": "/api/search?q={keyword}&page={page}",
    "detail": "/post/{id}"
  },
  "selectors": {
    "post_list": ".post-item",
    "title": ".post-title",
    "images": ".post-image img",
    "next_page": ".pagination .next"
  },
  "headers": {
    "Cookie": "{cookie}"
  },
  "rate_limit": 2000
}
```

**新增文件：** `services/platforms/custom.py`

**实现逻辑：**

1. 从 `data/state/custom_platforms.json` 加载插件定义
2. 用 `requests` + `BeautifulSoup` 解析页面
3. 根据 CSS 选择器提取数据
4. 标准化为 Post dict

**依赖：** `pip install beautifulsoup4`

**前端：** Settings 页面新增「自定义源」配置区，支持添加/编辑/删除/启用/禁用。

## 3.3 API 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/platforms` | 列出所有可用平台（已有，扩展返回 RSS 和自定义源） |
| `GET` | `/api/settings/rss-feeds` | 获取 RSS 源列表 |
| `PUT` | `/api/settings/rss-feeds` | 更新 RSS 源列表 |
| `GET` | `/api/settings/custom-platforms` | 获取自定义平台列表 |
| `POST` | `/api/settings/custom-platforms` | 添加自定义平台 |
| `PUT` | `/api/settings/custom-platforms/{id}` | 更新自定义平台 |
| `DELETE` | `/api/settings/custom-platforms/{id}` | 删除自定义平台 |

## 3.4 验收标准

- [ ] RSS 源配置后可在发现页选择「RSS 订阅」作为平台
- [ ] RSS 解析正确提取含图片的条目
- [ ] 抖音平台登录后可搜索图文内容
- [ ] 自定义平台配置后可抓取目标站点图片
- [ ] 所有新平台在 Pipeline 中可正常运行

---

# 四、定时发布与协作

## 4.1 现状

- 队列支持状态：`draft` → `queued` → `publishing` → `published/failed`
- 发布立即执行，无定时功能
- 多公众号已有基础（`account_id` 字段 + 独立 browser profile）
- 草稿仅存在于内存和本地 JSON

## 4.2 定时发布

### 4.2.1 数据模型扩展

```typescript
interface QueueItem {
  // ... 现有字段 ...
  scheduled_at?: string;     // ISO 8601 定时发布时间
  schedule_status?: 'pending' | 'scheduled' | 'overdue';  // 定时状态
}
```

### 4.2.2 后端调度器

**新增模块：** `services/scheduler.py`

```python
class PublishScheduler:
    """后台定时发布调度器。"""

    def __init__(self):
        self._running = False
        self._thread = None

    def start(self):
        """启动调度器，每 30 秒检查一次到期任务。"""

    def stop(self):
        """停止调度器。"""

    def _check_and_publish(self):
        """检查队列中 scheduled_at <= now 的项目并触发发布。"""
```

**实现逻辑：**

1. 应用启动时自动启动调度器线程
2. 每 30 秒扫描队列中 `scheduled_at <= now && status == 'queued'` 的项目
3. 到期后自动触发发布流程（复用现有 `_run_queue_publish_background`）
4. 发布失败时标记 `status='failed'`，不自动重试

### 4.2.3 API 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| `PUT` | `/api/queue/{item_id}` | 扩展：支持设置 `scheduled_at` |
| `GET` | `/api/queue/scheduled` | 获取所有定时发布任务 |

### 4.2.4 前端交互

- 队列卡片新增「定时发布」按钮
- 点击弹出日期时间选择器
- 定时中的项目显示倒计时标签
- 支持取消定时（清除 `scheduled_at`）

## 4.3 草稿导入/导出

### 4.3.1 导出格式

```json
{
  "version": "1.0",
  "exported_at": "2026-05-28T10:00:00Z",
  "articles": [
    {
      "title": "文章标题",
      "content": "Markdown 内容...",
      "images": ["base64_encoded_image_1..."],
      "cover_index": 0,
      "tags": ["明星", "活动"],
      "metadata": {
        "source_platform": "weibo",
        "celebrity": "迪丽热巴"
      }
    }
  ]
}
```

### 4.3.2 API 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/articles/export?ids=1,2,3` | 导出文章（含图片 base64） |
| `POST` | `/api/articles/import` | 导入文章（解析 JSON，图片写入素材库） |

### 4.3.3 前端交互

- 文章列表页新增「导出」按钮（支持多选导出）
- 文章列表页新增「导入」按钮（上传 JSON 文件）
- 导入时预览文章列表，确认后批量创建

## 4.4 验收标准

- [ ] 设置定时发布时间后，队列卡片显示倒计时
- [ ] 到达发布时间后自动触发发布
- [ ] 定时任务可在发布前取消
- [ ] 文章导出为 JSON 文件，包含完整内容和图片
- [ ] 导入 JSON 后正确创建文章草稿

---

# 五、素材管理增强

## 5.1 现状

- 18 个 API 端点覆盖完整的文件/文件夹 CRUD
- `MaterialMeta` 已支持：`tags[]`、`source_platform`、`used_count`、`score`、`score_reason`
- AI 评分已实现（Vision API + 启发式兜底）
- 标签聚合端点 `GET /api/materials/tags` 已存在

## 5.2 智能标签

基于现有 Vision API 扩展，自动分析图片内容并打标签。

### 5.2.1 实现方案

复用「二、AI 能力增强」中的多模态分析功能：

```
用户选择图片 → POST /api/materials/analyze → Vision API 分析 → 写入 MaterialMeta.tags
```

### 5.2.2 前端交互

- 素材页新增「智能标签」批量操作按钮
- 选中图片后点击「AI 标注」，展示分析进度
- 分析完成后在标签编辑器中预填 AI 建议的标签
- 用户可修改后确认保存

### 5.2.3 标签体系

预定义标签分类，帮助 AI 输出结构化标签：

| 维度 | 示例标签 |
|------|----------|
| 场景 | 日常、活动、机场、街拍、杂志、综艺 |
| 风格 | 清新、性感、可爱、优雅、帅气、复古 |
| 服装 | 礼服、休闲、运动、正装、民族风 |
| 情绪 | 微笑、严肃、俏皮、沉思、惊喜 |
| 构图 | 特写、半身、全身、合影、侧脸 |

## 5.3 去重检测

### 5.3.1 实现方案

**感知哈希（pHash）** — 对图片做降采样 + DCT 变换生成 64-bit 指纹，汉明距离 ≤ 10 判定为重复。

**新增模块：** `services/dedup.py`

```python
def compute_phash(image_path: str) -> int:
    """计算图片的感知哈希值。"""

def hamming_distance(hash1: int, hash2: int) -> int:
    """计算两个哈希的汉明距离。"""

def find_duplicates(paths: list[str], threshold: int = 10) -> list[list[str]]:
    """返回重复图片分组。"""
```

**依赖：** 仅需 Pillow（已有），无需额外依赖。

### 5.3.2 API 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/api/materials/detect-duplicates` | 检测指定路径下的重复图片 |
| `POST` | `/api/materials/remove-duplicates` | 自动保留最高分图片，删除其余 |

### 5.3.3 前端交互

- 素材页工具栏新增「检测重复」按钮
- 检测结果以分组形式展示：每组显示缩略图 + 文件大小 + 评分
- 用户可逐组选择保留哪张，或一键保留最高分
- 支持「自动清理」模式：自动保留每组评分最高的图片

### 5.3.4 验收标准

- [ ] 相同图片（不同分辨率/压缩质量）能被正确识别为重复
- [ ] 检测结果分组展示，每组高亮推荐保留的图片
- [ ] 一键清理后磁盘空间有明显释放
- [ ] 检测过程不影响其他操作（异步执行）

## 5.4 图片水印添加

### 5.4.1 实现方案

与现有 `services/watermark.py`（水印检测）互补，新增水印添加功能。

**新增模块：** `services/watermark_add.py`

```python
def add_text_watermark(
    image_path: str,
    text: str,
    position: str = "bottom-right",  # bottom-left/top-left/top-right/center
    opacity: float = 0.5,
    font_size: int = 24,
    color: str = "#FFFFFF",
    output_path: str = None,
) -> str:
    """添加文字水印。"""

def add_image_watermark(
    image_path: str,
    watermark_path: str,     # 水印图片路径
    position: str = "bottom-right",
    opacity: float = 0.5,
    scale: float = 0.15,     # 水印相对于主图的缩放比例
    output_path: str = None,
) -> str:
    """添加图片水印。"""
```

### 5.4.2 API 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/api/materials/watermark` | 批量添加水印 |
| `GET` | `/api/settings/watermark-preset` | 获取水印预设配置 |
| `PUT` | `/api/settings/watermark-preset` | 保存水印预设配置 |

### 5.4.3 水印预设配置

```typescript
interface WatermarkPreset {
  type: 'text' | 'image';
  text?: string;              // 文字水印内容
  image_path?: string;        // 图片水印路径
  position: 'bottom-right' | 'bottom-left' | 'top-left' | 'top-right' | 'center';
  opacity: number;            // 0-1
  font_size?: number;
  color?: string;
  enabled: boolean;           // 是否在发布时自动添加
}
```

### 5.4.4 前端交互

- 素材页工具栏新增「添加水印」按钮
- 弹出水印配置面板：实时预览 + 位置选择 + 透明度滑块
- 支持批量处理：选中多张图片一次性添加
- Settings 页面新增水印预设配置区
- 可选：发布队列时自动添加水印（开关控制）

### 5.4.5 验收标准

- [ ] 文字水印正确渲染，支持中文
- [ ] 水印位置和透明度可调
- [ ] 批量处理 50 张图片耗时 < 10 秒
- [ ] 水印添加不影响原图质量（保存为新文件，不覆盖原图）
- [ ] 预设配置持久化，重启后恢复

---

# 实现优先级

| 优先级 | 模块 | 工作量 | 理由 |
|--------|------|--------|------|
| P0 | 数据分析与效果追踪 | 3-4 天 | 现有数据基础已就绪，投入产出比最高 |
| P1 | 素材管理增强 - 智能标签 | 1-2 天 | 复用现有 Vision API，增量开发量小 |
| P1 | 素材管理增强 - 去重检测 | 1-2 天 | 纯本地算法，无外部依赖 |
| P2 | AI 能力增强 - 自动配图 | 2-3 天 | 需要打通文章和素材两个模块 |
| P2 | 定时发布 | 2 天 | 后端调度器 + 前端时间选择器 |
| P3 | 内容源扩展 - RSS | 1-2 天 | 依赖少，可快速落地 |
| P3 | 素材管理增强 - 水印添加 | 1-2 天 | Pillow 实现，功能独立 |
| P3 | 草稿导入/导出 | 1 天 | JSON 序列化/反序列化 |
| P4 | 内容源扩展 - 抖音 | 3-5 天 | 反爬对抗复杂，不确定性高 |
| P4 | 内容源扩展 - 自定义爬虫 | 2-3 天 | 需要设计通用选择器 DSL |
| P4 | AI 能力增强 - A/B 测试 | 2 天 | 需要效果追踪配合 |
| P4 | AI 能力增强 - 风格迁移 | 1-2 天 | Prompt 工程为主 |

---

*本文档随项目迭代更新。最后更新：2026-05-28。*
