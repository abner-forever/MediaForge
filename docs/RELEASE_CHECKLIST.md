# 发布检查清单

## 运行前
- [ ] `.env` 已配置微博 Cookie 与模型配置
- [ ] `python3 -m compileall .` 通过
- [ ] `cd desktop/web && npx tsc --noEmit` 通过
- [ ] `python3 main.py --dry-run` 通过

## 桌面端
- [ ] `cd desktop/web && npm ci && npm run build` 成功
- [ ] `cd desktop && python3 main.py` 可启动
- [ ] 浏览器访问 `http://127.0.0.1:8765` 页面正常
- [ ] 图片发现 → 搜索 → 下载 → 评分 流程正常
- [ ] 发布队列 → 生成文案 → 保存草稿 流程正常

## 风控与安全
- [ ] `REQUIRE_CONFIRM=true`（生产环境）
- [ ] 发布频率控制（`PUBLISH_INTERVAL_SECONDS`）已设置
- [ ] 水印策略配置复核

## 发布产物
- [ ] 版本号更新（`README.md` 及页面中的版本号）
- [ ] 输出更新说明与已知问题
