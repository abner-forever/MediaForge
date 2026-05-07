# 使用说明（MVP）

## 1) 配置
- 在项目根目录编辑 `.env`
- 配置抓取参数（明星、关键词、分页）
- 配置模型（OpenAI / Mimo / GLM）

## 2) CLI 模式
- 试跑：`python3 main.py --dry-run --ignore-post-cache`
- 正式：`python3 main.py`

## 3) 桌面模式
- `cd desktop`
- `npm install`
- `npm run tauri dev`
- 在工作台设置参数并点击“执行工作流”

## 4) 失败排查
- 结构化日志：`data/logs/runs/*.jsonl`
- 公众号登录态：`data/state/wechat_chromium_profile`
- 模型 4xx：检查 `AI_PROVIDER/AI_MODEL/AI_BASE_URL/API_KEY`
