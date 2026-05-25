# Changelog

## [v1.10.0](https://github.com/aburnlee/MediaForge/releases/tag/v1.10.0) (2026-05-25)

### ✨ Features
- 迁移 npm 到 pnpm，调整构建产物结构，vConsole 改为 CDN 加载

### 🐛 Bug Fixes
- 锁定 CI 中 pnpm 版本为 v9，兼容 Node.js 20
- 同步 pnpm-lock.yaml，移除已删除的 vconsole 依赖
- 增强浏览器启动错误处理，提示用户安装缺失的 Playwright 浏览器

## [v1.9.1](https://github.com/aburnlee/MediaForge/releases/tag/v1.9.1) (2026-05-25)

### 🐛 Bug Fixes
- 增强 FastAPI 启动错误处理和依赖声明

## [v1.9.0](https://github.com/aburnlee/MediaForge/releases/tag/v1.9.0) (2026-05-25)

### ✨ Features
- 更新队列 API 以支持通过 ID 进行操作

### 🔧 Other
- refactor: 移除 CI 测试步骤并更新图片组件

## [v1.8.0](https://github.com/aburnlee/MediaForge/releases/tag/v1.8.0) (2026-05-24)

### ✨ Features
- 增强发布日志管理和图片加载性能

## [v1.7.0](https://github.com/aburnlee/MediaForge/releases/tag/v1.7.0) (2026-05-23)

### ✨ Features
- 增强发布日志管理和标题处理功能

### 🐛 Bug Fixes
- 修复 CI 中 Release 版本号与安装包版本号不一致问题

## [v1.6.1](https://github.com/aburnlee/MediaForge/releases/tag/v1.6.1) (2026-05-23)

### 🐛 Bug Fixes
- 修复 Windows 安装包运行崩溃和版本号不一致问题

## [v1.6.0](https://github.com/aburnlee/MediaForge/releases/tag/v1.6.0) (2026-05-23)

### ✨ Features
- 新增小红书平台支持和 AI 推荐热门女星功能

## [v1.5.0](https://github.com/aburnlee/MediaForge/releases/tag/v1.5.0) (2026-05-21)

### ✨ Features
- 增强构建流程，自动生成应用图标并更新版本管理

## [v1.4.0](https://github.com/aburnlee/MediaForge/releases/tag/v1.4.0) (2026-05-21)

### ✨ Features
- 增强文章生成和标题候选功能 - 新增了一个用于生成文章标题候选内容的模板，其中包括“稳妥版”和“点击率版”等类型。 - 更新了文章生成功能，使其能够接受关于文章类型、语气、字数和模板提示的额外参数。 - 实现了一个从内容生成文章标题候选内容的功能，并设置了从原始文本生成标题的备用机制。 - 优化了微信封面选择逻辑，以处理有或没有预先上传的封面图片的情况。 - 引入了一个基于 Cookie 过期时间来验证微信账号登录状态的验证函数。 - 改进了微博登录流程，使用 Playwright 进行更好的 Cookie 处理和用户体验。 - 添加了针对新文章生成和标题候选功能的测试。
- 更新文档以反映最新功能和实现进展，包括多账号支持、AI 内容生成和桌面 GUI 细节
- 增强微信账号管理和文章发布功能

### 🐛 Bug Fixes
- 修复 CI test job 因缺少 desktop/static 目录导致收集报错

## [v1.3.0](https://github.com/aburnlee/MediaForge/releases/tag/v1.3.0) (2026-05-19)

### ✨ Features
- 增强文章发布和微信账号管理功能
- 增强文章发布和封面处理功能

## [v1.2.0](https://github.com/aburnlee/MediaForge/releases/tag/v1.2.0) (2026-05-17)

### ✨ Features
- 添加文章管理功能，优化文章发布流程
- 添加 Loading 组件并在多个页面中使用，优化用户加载体验

## [v1.1.1](https://github.com/aburnlee/MediaForge/releases/tag/v1.1.1) (2026-05-14)

### 🐛 Bug Fixes
- 移除 actions/checkout 中无效的 GITHUB_TOKEN/GH_TOKEN 输入

## [v1.1.0](https://github.com/aburnlee/MediaForge/releases/tag/v1.1.0) (2026-05-14)

### ✨ Features
- 移除 python-dotenv 依赖，配置改为全量写入 settings.json
- 增强应用设置与主题管理功能
- 重构配置管理与环境变量处理
- 实现微博扫码登录功能
- 添加 Apache 许可证和更新前端样式
- 添加本地构建脚本和 DMG 生成支持

### 🐛 Bug Fixes
- macOS 构建适配 ARM64 CI runner
- macOS CI pip 命令找不到改用 python3 -m pip
- 移除 build.yml 中重复的 build-macos 键
- 修复 macOS CI 构建因 Python 3.11.15 无安装包而失败的问题
- 修复 setup.iss 中 [Files] 路径相对于 .iss 文件位置的错误
- 修复单语言模式下 Inno Setup BeveledLabel 语言前缀错误
- 移除 Inno Setup 中文语言包依赖以修复 Windows CI 构建
- 修复 Windows 安装包构建时 app.ico 路径不匹配问题
- 更新 DMG 文件大小和日志输出信息

### 🔧 Other
- test: 建立完整测试体系，覆盖 203 个用例并修复 downloader 空列表返回值 bug
- ci: 统一 macOS 构建为 universal2 通用二进制，避免 macos-13 runner 排队问题

## [v1.0.1](https://github.com/aburnlee/MediaForge/releases/tag/v1.0.1) (2026-05-11)

### 🐛 Bug Fixes
- update GitHub Actions workflow to include GH_TOKEN for improved authentication

## [v1.0.0](https://github.com/aburnlee/MediaForge/releases/tag/v1.0.0) (2026-05-09)

### ✨ Features
- 打包优化
- 添加自动版本管理和发布功能，更新文档以说明版本号管理，优化 GitHub Actions 工作流以支持语义化版本控制和自动发布
- 更新文档以添加桌面应用打包和 CI/CD 流程说明，增强用户对构建和发布流程的理解，更新 PyInstaller 配置以支持跨平台打包
- 添加 GitHub Actions 工作流以自动构建 macOS 和 Windows 应用，更新 .gitignore 文件以排除构建产物，新增 PyInstaller 配置文件以支持跨平台打包
- 添加今日头条支持，更新配置和平台选择逻辑，优化前端组件以适应新平台，增强用户体验和功能灵活性
- 更新项目文档和命名，重构代码结构，增强桌面应用功能，支持微博和今日头条的内容抓取，优化用户界面和交互体验，添加流式搜索功能，改进发布队列管理，提升整体性能和可维护性。
- 增强应用状态管理，添加操作记录功能，更新配置加载逻辑，优化 API 端点以支持操作记录的获取，改进发布日志的增量拉取，调整前端组件以显示最近操作记录。
- 使用核心文件和配置初始化“微博转微信”项目。添加了 .env.example 以用于环境变量，.gitignore 以排除不必要的文件，并创建了 CLAUDE.md 用于项目文档。在 main.py 中实现了主要的应用逻辑，包括微博数据获取、图片下载、人工智能内容生成以及发布到微信。为桌面应用程序设置了 FastAPI 并配置了 API 路由和状态管理。包含了 requirements.txt 以列出依赖项，并对项目进行了结构化处理，以便于未来的开发。

### 🐛 Bug Fixes
- 修复windows打包失败

### 🔧 Other
- refactor: 更新 macOS 和 Windows 构建配置，优化 .app 和单目录可执行程序的生成逻辑，增强跨平台打包支持
- refactor: 更新项目结构和配置，调整 .gitignore 文件以排除不必要的静态文件，添加新的缓存路径和配置项，优化 API 逻辑以支持超话和关键词搜索，增强发布日志功能，移除旧的前端代码并整合新的组件。
