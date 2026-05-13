# 使用说明

## 配置

- 在桌面 GUI 的设置页面配置各项参数
- 或通过环境变量设置：`WEIBO_COOKIE`、`AI_API_KEY` 等
- 核心配置：微博 Cookie（或扫码登录）、AI API Key、Base URL

## CLI 模式

```bash
# 试运行（不发布）
python3 main.py --dry-run --ignore-post-cache

# 正式运行（微博默认模式）
python3 main.py --limit 3 --pages 2

# 指定平台和模式
python3 main.py --platform toutiao --mode feed
python3 main.py --platform weibo --mode keyword
```

参数说明：
- `--limit` — 最多处理条数（1~3）
- `--pages` — 抓取页数
- `--platform` — 平台选择（weibo / toutiao）
- `--mode` — 抓取模式（取决于平台）
- `--dry-run` — 不发布，仅打印流程
- `--ignore-post-cache` — 忽略去重缓存，重新下载

## 桌面 GUI 模式

### 启动

```bash
cd desktop/web && npm install && npm run build
cd desktop && python3 main.py
```

浏览器访问 `http://127.0.0.1:8765`，macOS 会自动打开原生窗口。

### 工作流程

1. **设置** — 先到设置页面配置 AI 模型、微博参数、水印参数
2. **图片发现** — 选择平台和模式 → 配置搜索参数 → 开始搜索 → 勾选帖子 → 下载图片 → AI 评分
3. **发布队列** — 选中的图片加入队列 → AI 润色生成标题 → 编辑标题/描述/封面 → 保存草稿或直接发布

### 页面说明

#### 仪表盘（Dashboard）

显示系统健康状态、统计数据（处理帖子数、图片数）、快捷操作入口、最近操作记录。

#### 图片发现（Discovery）

- **平台选择**：切换微博/头条数据源
- **搜索模式**：根据平台选择不同的抓取模式
  - 微博：celebrities（明星聚合）、own（本人时间线）、mixed（混合）、super_topic（超话）、keyword（关键词）
  - 头条：feed（推荐流）、user（用户主页）、keyword（关键词搜索）
- **搜索参数**：艺人列表、搜索标签、超话、页数等
- **帖子列表**：展示搜索结果，可勾选感兴趣的帖子
- **操作**：下载图片、AI 评分、将选中的帖子加入发布队列

#### 发布队列（Queue）

管理待发布的图文内容：

- **信息编辑**：修改标题（64字以内）、正文（可选）、封面图选择
- **AI 润色**：点击「AI 润色」按钮，自动根据原文生成吸引人的标题
- **发布操作**：
  - **保存草稿** — 将文章保存为微信公众号草稿（不正式发布）
  - **直接发布** — 直接发布到微信公众号
  - **删除** — 从队列中移除
- **发布日志**：发布过程中实时显示日志输出

#### 素材管理（Materials）

- 按艺人 + 场景分组的本地图片浏览
- 图片画廊查看
- 右键菜单快捷操作

#### 设置（Settings）

- **主题设置**：浅色/深色/跟随系统三种模式，4 套配色（蓝/红/绿/紫）
- **AI 模型**：供应商选择（Mimo/DeepSeek/GLM/OpenAI）、模型名、API Key、Base URL
- **微博配置**：Cookie、UID、抓取模式、明星列表、搜索标签、超话
- **今日头条配置**：Cookie、用户 ID、抓取模式、搜索标签
- **水印参数**：过滤开关、阈值调节、严格模式、最少干净图数

### 微博扫码登录

在设置页面的微博配置区域，点击「微博扫码登录」按钮，会打开一个内置 WebView 窗口加载微博登录页。扫码登录成功后会自动获取并保存 Cookie，无需手动复制粘贴。

## 故障排查

| 问题 | 排查方向 |
|------|----------|
| 微博抓取失败 | 检查 `WEIBO_COOKIE` 是否过期，使用扫码登录重新获取 |
| 微博扫码登录失败 | 检查网络连接，确保能访问 passport.weibo.cn；如使用安装包，macOS 系统 WebView 应直接可用 |
| AI 生成失败 | 检查 `AI_API_KEY`/`AI_BASE_URL`/`AI_MODEL` 配置 |
| 公众号发布失败 | 检查是否已运行 `playwright install chromium`，确保浏览器引擎可用 |
| 水印误判 | 调整 `WATERMARK_CORNER_RATIO` 和 `WATERMARK_BOTTOM_RATIO` 阈值 |
| 登录态失效 | 删除 `data/state/wechat.json` 重新扫码登录 |
