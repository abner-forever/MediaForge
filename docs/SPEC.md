# 项目名称
MediaForge 自动化内容发布系统
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

# 二、技术栈

- Python 3.10+
- requests（HTTP请求）
- playwright（浏览器自动化）
- openai（或 DeepSeek API）
- pillow（图片处理）
- python-dotenv（环境变量）

---

# 三、项目结构

```

MediaForge/
├── main.py                # 主入口（调度流程）
├── config.py             # 配置文件
├── .env                  # 环境变量
├── services/
│   ├── weibo.py          # 微博数据采集
│   ├── downloader.py     # 图片下载
│   ├── ai.py             # AI文案生成
│   ├── wechat.py         # 公众号发布
├── utils/
│   ├── logger.py
│   ├── file.py
├── data/
│   ├── images/           # 图片存储
│   ├── posts.json        # 原始数据缓存
├── requirements.txt

```

---

# 四、核心流程

```

fetch_weibo_posts()
↓
download_images()
↓
generate_content()
↓
publish_article()

````

---

# 五、模块设计

## 1. 微博采集模块（weibo.py）

### 功能
- 获取微博帖子列表
- 提取文本 + 图片 URL

### 输入
无

### 输出
```python
[
  {
    "text": "帖子内容",
    "images": ["url1", "url2"]
  }
]
````

### 要求

* 使用 cookie 登录
* 过滤无图内容
* 支持分页（可扩展）

---

## 2. 图片下载模块（downloader.py）

### 功能

* 下载图片到本地

### 输入

```python
images: List[str]
prefix: str
```

### 输出

```python
["./data/images/xxx.jpg"]
```

### 要求

* 文件命名唯一
* 支持覆盖策略
* （可选）并发下载（ThreadPoolExecutor）

---

## 3. AI 模块（ai.py）

### 功能

生成：

* 标题（20字以内）
* 文案（30字以内）

### 输入

```python
text: str
```

### 输出

```python
(title, desc)
```

### Prompt 规范

```
你是公众号运营专家，请生成：
1. 吸引点击的标题（20字以内）
2. 简短文案（30字以内）

风格：
- 轻松
- 有吸引力
- 不违规
```

### 要求

* 支持模型切换（OpenAI / DeepSeek）
* 失败重试机制

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
```

### 流程

1. 打开 [https://mp.weixin.qq.com/](https://mp.weixin.qq.com/)
2. 使用 storage_state 登录（首次扫码）
3. 点击「新建图文」
4. 填写标题
5. 填写正文
6. 上传图片
7. 点击发布

### 要求

* 登录态持久化（wechat.json）
* iframe 操作支持
* 上传图片循环处理

---

## 5. 主流程（main.py）

### 功能

串联所有模块

### 流程

```python
posts = fetch_weibo_posts()

for post in posts:
    images = download_images(...)
    title, desc = generate_content(...)
    publish_article(...)
```

### 要求

* 支持限制处理数量（用于测试）
* 支持日志输出
* 异常不中断整体流程

---

# 六、配置设计（config.py / .env）

```env
WEIBO_COOKIE=xxx
OPENAI_API_KEY=xxx
```

```python
DOWNLOAD_DIR = "./data/images"
POST_LIMIT = 3
```

---

# 七、CLI 设计（必须实现）

支持命令：

```bash
python main.py
```

扩展参数：

```bash
python main.py --limit 5
python main.py --dry-run
```

说明：

* --limit：限制处理条数
* --dry-run：不发布，仅打印

---

# 八、异常处理

必须处理：

* 网络失败（重试3次）
* AI接口失败
* 图片下载失败（跳过）
* 发布失败（记录日志）

---

# 九、日志系统

要求：

```bash
[INFO] 开始抓取微博
[INFO] 下载图片成功
[ERROR] AI生成失败
```

---

# 十、扩展点（必须预留接口）

## 1. 图片筛选（AI Vision）

```python
def score_image(path) -> float
```

## 2. 自动封面选择

```python
def select_cover(images)
```

## 3. HTML排版

```python
def build_html(desc, images)
```

## 4. 定时任务

* cron / APScheduler

---

# 十一、风控策略（必须遵守）

* 每次最多发布 1~3 篇
* 发布间隔 ≥ 10 秒
* 添加随机 sleep
* 不要完全无人值守（建议人工确认）

---

# 十二、MVP标准（必须完成）

Claude Code 实现完成后，必须满足：

* ✅ 能抓微博数据
* ✅ 能下载图片
* ✅ 能生成标题和文案
* ✅ 能自动打开公众号并发布
* ✅ CLI 一键执行成功

---

# 十三、加分项（可选）

* 并发下载
* 本地缓存（避免重复）
* 去重机制（hash）
* UI界面（streamlit）

---

# 十四、最终目标

实现：

```bash
python main.py
```

即可完成：

👉 自动抓取 → 自动生成 → 自动发布

```

---

# 最后给你一句实话（很关键）

你这个项目：

👉 **本质是一个 AI Agent + 自动化运营系统（Automation + Agent）**

如果你把这个做完整：

- 已经不是“脚本”了
- 是可以复用 / 商业化的小工具

---

如果你下一步想升级：

👉 我可以帮你做一版：
- 多账号矩阵
- 自动选题（热点分析）
- AI生成图片（彻底原创，规避版权）

这就从“搬运工具”变成“内容工厂”了