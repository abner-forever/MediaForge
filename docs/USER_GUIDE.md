# 使用说明

## 配置

- 项目根目录编辑 `.env`，所有配置项参见 `.env.example`
- 核心配置：微博 Cookie、AI API Key、Base URL

## CLI 模式

```bash
# 试运行（不发布）
python3 main.py --dry-run --ignore-post-cache

# 正式运行
python3 main.py --limit 3 --pages 2
```

参数说明：
- `--limit` — 最多处理条数（1~3）
- `--pages` — 微博抓取页数
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

1. **设置** — 先到设置页面配置 AI 模型和微博参数
2. **图片发现** — 配置搜索参数 → 开始搜索 → 勾选帖子 → 下载图片 → AI 评分
3. **发布队列** — 选中图片加入队列 → AI 生成文案 → 编辑标题/描述/封面 → 保存草稿或发布

## 故障排查

| 问题 | 排查方向 |
|------|----------|
| 微博抓取失败 | 检查 `WEIBO_COOKIE` 是否过期，重新登录微博后更新 |
| AI 生成失败 | 检查 `AI_API_KEY`/`AI_BASE_URL`/`AI_MODEL` 配置 |
| 公众号发布失败 | 检查 Playwright 浏览器是否能打开 mp.weixin.qq.com |
| 水印误判 | 调整 `WATERMARK_CORNER_RATIO` 和 `WATERMARK_BOTTOM_RATIO` 阈值 |
| 登录态失效 | 删除 `data/state/wechat.json` 重新扫码登录 |
