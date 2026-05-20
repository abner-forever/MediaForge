# 发布检查清单

## 运行前
- [ ] 微博 Cookie / 模型配置 / 平台选择 已就绪
- [ ] `python3 -m compileall .` 通过
- [ ] `python3 -m pytest` 通过（当前 `pytest --collect-only -q` 可收集 205 个测试；不要用 collect-only 判断覆盖率）
- [ ] `cd desktop/web && npm run build` 通过（包含 TypeScript 构建）
- [ ] `python3 main.py --dry-run` 通过（微博默认模式）
- [ ] `python3 main.py --platform toutiao --mode keyword --dry-run` 通过（头条模式）

## 桌面端
- [ ] `cd desktop/web && npm ci && npm run build` 成功
- [ ] `cd desktop && python3 main.py` 可启动
- [ ] 浏览器访问 `http://127.0.0.1:8765` 页面正常
- [ ] 图片发现 → 搜索 → 下载 → 评分 流程正常
- [ ] 文章发布 → 灵感搜索 → AI 生成/润色 → 保存草稿 流程正常
- [ ] 文章发布 → 封面搜索/下载 → 加入发布队列 流程正常
- [ ] 发布队列 → 生成文案 → 保存公众号草稿 流程正常
- [ ] 本地素材 → 浏览/移动/删除 流程正常
- [ ] 设置 → AI 连通性测试、微博登录校验、微信公众号多账号登录状态 正常

## 风控与安全
- [ ] `REQUIRE_CONFIRM=true`（生产环境）
- [ ] 发布频率控制（`PUBLISH_INTERVAL_SECONDS`）已设置
- [ ] 水印策略配置复核
- [ ] 默认公众号账号已确认；多账号场景下逐项确认 `account_id`
- [ ] API Key、Cookie、`data/state/*` 不进入提交或发布说明

## 发布产物
- [ ] 版本号更新（`pyproject.toml`；前端侧边栏通过构建注入 `__APP_VERSION__`）
- [ ] GitHub Actions 可构建 macOS DMG 和 Windows 安装包
- [ ] semantic-release 生成 `v{version}` tag 并上传安装包到 Release
- [ ] 输出更新说明与已知问题
