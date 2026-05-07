# 发布检查清单

## 运行前
- [ ] `.env` 已配置微博 Cookie/UID 与模型配置
- [ ] `python3 -m compileall .` 通过
- [ ] `python3 main.py --dry-run` 通过

## 桌面端
- [ ] `cd desktop && npm install`
- [ ] `npm run tauri dev` 可启动
- [ ] 工作台能执行任务、打开微博/公众号页面
- [ ] 模型配置写入 `.env` 正常

## 风控与安全
- [ ] `REQUIRE_CONFIRM=true`
- [ ] 发布频率控制（`PUBLISH_INTERVAL_SECONDS`）已设置
- [ ] 严格水印策略配置复核

## 发布产物
- [ ] 版本号更新（`desktop/src-tauri/tauri.conf.json` / `Cargo.toml`）
- [ ] 构建安装包：`cd desktop && npm run tauri build`
- [ ] 输出更新说明与已知问题
