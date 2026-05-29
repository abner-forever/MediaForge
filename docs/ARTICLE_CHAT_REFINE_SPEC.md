# 文章发布页 AI 对话式优化重构 SPEC

> 版本：v1.0 | 日期：2026-05-29 | 状态：Draft

## Problem Statement

当前文章发布页的"修正指令"功能存在两个核心问题：

1. **上下文断裂**：每次对话请求都是无状态的（`services/ai/content.py:chat_article` 仅发送 `content[:2000]` + 当前指令），AI 无法理解用户多轮迭代的意图，导致每次修改都是"盲改"，用户需要反复输入相同背景信息。
2. **交互单一**：侧边栏仅有一个单行输入框（`index.tsx:652-668`），没有对话历史、没有流式响应、没有 AI 操作撤销机制。用户无法回顾修改过程，也无法在多个 AI 生成版本间对比选择。

这导致用户在优化文章时体验割裂——每轮对话 AI 都"失忆"，修改效果不可预期，且一旦覆盖无法回退。

## Goals

| # | 目标 | 衡量指标 |
|---|------|----------|
| G1 | 用户可通过多轮对话迭代优化文章，AI 保持完整上下文 | 对话轮次 ≥5 轮时 AI 仍能准确引用前文指令 |
| G2 | 每次 AI 操作可撤销、可对比，用户不怕"改坏" | 100% 的 AI 操作可通过版本快照回退 |
| G3 | AI 工具栏操作（校对/去AI味/优化排版）可作用于选中文本 | 选中文本后 AI 仅处理选中部分 |
| G4 | 页面布局更合理，AI 对话区与编辑区互不干扰 | 编辑器可视面积不低于当前水平 |
| G5 | 流式输出，AI 响应过程中用户可实时看到生成进度 | 首 token 延迟 < 2s，用户可见逐字输出 |

## Non-Goals

| # | 不做什么 | 原因 |
|---|----------|------|
| NG1 | 内联 Ghost Text 预测补全 | 与当前"生成-优化"流程不匹配，复杂度高，P2 再考虑 |
| NG2 | 多人协作编辑 | 单用户桌面应用场景，无协作需求 |
| NG3 | AI 学习用户写作风格（类似 Jasper Brand Voice） | 需要大量数据积累，本期聚焦基础体验 |
| NG4 | 跨文章对话历史持久化 | 对话与文章绑定即可，跨文章复用场景不明确 |
| NG5 | 实时内联建议（类似 Grammarly） | 与 CodeMirror 编辑器架构冲突，且当前内容类型为生成式非实时写作 |

## User Stories

### 核心用户：公众号运营者

**US-1 多轮对话优化正文**
> 作为公众号运营者，我希望通过多轮对话逐步优化文章——比如先说"把语气改轻松一些"，再说"第二段加个例子"——让 AI 能记住之前的修改上下文，而不是每次都从头理解。

**US-2 撤销 AI 修改**
> 作为公众号运营者，当我对 AI 的修改不满意时，我希望一键回退到修改前的版本，而不是手动 Ctrl+Z 多次。

**US-3 对比 AI 修改差异**
> 作为公众号运营者，我想看到 AI 修改了哪些内容（diff 对比），这样我能快速判断修改是否符合预期。

**US-4 选中文本局部优化**
> 作为公众号运营者，我希望选中一段文字后，可以让 AI 只针对这段进行改写，而不是每次修改都影响整篇文章。

**US-5 快速插入常用指令**
> 作为公众号运营者，我希望能从预设的快捷指令中选择（如"更口语化"、"缩短到300字"），减少重复输入。

**US-6 查看 AI 操作历史**
> 作为公众号运营者，我希望能查看本次编辑过程中的所有 AI 操作记录，了解每一步做了什么修改。

## Requirements

### Must-Have (P0)

**R1 对话式聊天面板**
- 将侧边栏"AI 助手"区域从单行输入框扩展为完整对话面板
- 对话面板包含：消息列表（用户消息 + AI 回复）+ 底部输入框
- 支持滚动查看历史消息，最新消息自动滚动到底部
- AI 回复支持 Markdown 渲染（与编辑器保持一致）
- 输入框支持 Shift+Enter 换行，Enter 发送

**R2 对话上下文管理**
- 前端维护 `ChatMessage[]` 数组，包含 role（user/assistant）和 content
- 后端 `POST /api/articles/{id}/chat` 接收 `messages` 数组（含历史）而非单条 `instruction`
- 后端 Prompt 模板重构：系统提示词 + 文章全文 + 对话历史 + 最新指令
- 上下文窗口管理：当对话历史超过 token 限制时，自动摘要早期对话（保留最近 N 轮完整消息）
- 对话历史与文章绑定存储，切换文章时切换对话

**R3 AI 操作版本快照**
- 每次 AI 操作（polish/de-ai/optimize-layout/chat）执行前，自动保存当前 content 快照
- 快照数据结构：`{ id, type, content, created_at, instruction? }`
- 在 AI 助手面板中展示"操作历史"时间线，可点击任意快照恢复
- 保留最近 20 个快照（含用户手动保存的版本）

**R4 流式输出（SSE）**
- 所有 AI 生成端点改为 SSE 流式返回
- 前端实时渲染流式内容，编辑器中显示 AI 正在生成的文本（带光标动画）
- 流式过程中禁用发送按钮，显示"生成中..."状态和停止按钮
- 用户可随时点击"停止"中断生成，保留已生成部分

**R5 选中文本上下文传递**
- 检测编辑器中的选中文本范围和内容
- 选中文本后，AI 工具栏的按钮行为变为"对选中内容执行"
- 选中文本自动作为对话输入的上下文，在输入框上方显示"选中：xxx..."提示
- 对话指令中自动注入 `{{selected_text}}` 占位符

### Nice-to-Have (P1)

**R6 快捷指令预设**
- 在输入框上方展示常用指令标签（"更口语化"、"缩短"、"加例子"、"改正式"、"加小标题"）
- 点击标签直接发送对应指令，无需手动输入
- 支持用户自定义快捷指令（在设置页配置）

**R7 AI 修改 Diff 预览**
- AI 生成结果不直接替换原文，而是先以 diff 视图展示
- diff 视图：红色删除线标记删除部分，绿色标记新增部分
- 用户确认后点击"应用"才替换原文
- 提供"应用全部"和"逐条应用"两种模式

**R8 浮动 AI 工具栏**
- 选中文本后，在选区附近弹出浮动工具栏
- 浮动工具栏包含：改写、加长、缩短、翻译、解释
- 点击后直接对选中文本执行操作，结果插入/替换选区

**R9 对话引用文章段落**
- 用户在对话中可以 @引用 文章中的特定段落
- AI 响应中可以标注"已修改第 X 段"
- 点击引用可跳转到编辑器对应位置并高亮

### Future Considerations (P2)

**R10 多候选版本对比**
- AI 同时生成 2-3 个候选版本，用户可并排对比选择
- 标签页切换不同候选

**R11 AI 操作回放**
- 以时间线形式回放整个编辑过程
- 类似 git log 的可视化

**R12 语气/长度滑块**
- 类似 Wordtune，通过滑块控制输出的语气强度和长度

## 页面布局设计

### 整体结构

```
┌──────────────────────────────────────────────────────────────┐
│ Header: [文章发布] [帮助] [新建文章]              [侧边栏开关] │
├──────────────────────────────────┬───────────────────────────┤
│                                  │                           │
│  ┌──────────────────────────┐    │  ┌─────────────────────┐  │
│  │ 文章标题输入              │    │  │ [文章列表] [设置]    │  │
│  ├──────────────────────────┤    │  │  ← Tab 切换         │  │
│  │ AI 工具栏                 │    │  ├─────────────────────┤  │
│  │ [生成][校对][去AI][标题]   │    │  │                     │  │
│  │ [优化排版] [选中: xxx]    │    │  │  文章列表 / 设置    │  │
│  ├──────────────────────────┤    │  │  (折叠区域)          │  │
│  │                          │    │  │                     │  │
│  │     编辑器 (CodeMirror)   │    │  ├─────────────────────┤  │
│  │                          │    │  │ AI 对话面板          │  │
│  │     split / edit / preview│    │  │                     │  │
│  │                          │    │  │ ┌─────────────────┐ │  │
│  │                          │    │  │ │ 消息列表        │ │  │
│  │                          │    │  │ │ (可滚动)        │ │  │
│  │                          │    │  │ │                 │ │  │
│  │                          │    │  │ ├─────────────────┤ │  │
│  │                          │    │  │ │ 快捷指令标签    │ │  │
│  │                          │    │  │ ├─────────────────┤ │  │
│  │                          │    │  │ │ [输入指令...]   │ │  │
│  └──────────────────────────┘    │  │ └─────────────────┘ │  │
│                                  │  │                     │  │
│                                  │  ├─────────────────────┤  │
│                                  │  │ 操作历史 (可折叠)    │  │
│                                  │  │ • AI校对 10:32      │  │
│                                  │  │ • 对话优化 10:28    │  │
│                                  │  │ • 生成正文 10:15    │  │
│                                  │  └─────────────────────┘  │
├──────────────────────────────────┴───────────────────────────┤
│ Footer: [微信账号选择] [保存草稿] [加入队列] [发布]            │
└──────────────────────────────────────────────────────────────┘
```

### 布局变更说明

| 区域 | 当前 | 重构后 |
|------|------|--------|
| 侧边栏 - AI 助手 | 单行输入框 + 标题候选 | 完整对话面板（消息列表 + 快捷指令 + 输入框） |
| 侧边栏 - 新增 | 无 | AI 操作历史时间线（可折叠） |
| 编辑器 - AI 工具栏 | 固定 5 个按钮 | 增加"选中文本"上下文提示区域 |
| 侧边栏宽度 | 340px 固定 | 380px（对话面板需要更多空间），支持拖拽调整 |
| AI 对话面板高度 | ~60px | flex: 1 填充侧边栏剩余空间，最小 300px |

## 数据模型变更

### ChatMessage（新增）

```typescript
interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
  // AI 回复时关联的操作
  operation_type?: 'chat' | 'polish' | 'de-ai' | 'optimize-layout';
  // 如果是 AI 回复，记录应用到文章后的快照 ID
  snapshot_id?: string;
}
```

### ContentSnapshot（新增）

```typescript
interface ContentSnapshot {
  id: string;
  article_id: string;
  type: 'ai-operation' | 'manual-save' | 'auto-save';
  operation?: string;        // 'chat' | 'polish' | 'de-ai' | 'optimize-layout'
  content: string;           // 快照时的文章内容
  instruction?: string;      // 用户指令（如果有）
  created_at: string;
}
```

### ArticleItem（扩展）

```typescript
interface ArticleItem {
  // ... 现有字段不变 ...
  chat_messages?: ChatMessage[];     // 对话历史
  content_snapshots?: ContentSnapshot[];  // 内容快照
}
```

## API 变更

### 修改：`POST /api/articles/{id}/chat`

**Request Body 变更：**

```typescript
// 旧
{ instruction: string }

// 新
{
  instruction: string;
  messages?: Array<{          // 对话历史（可选，向后兼容）
    role: 'user' | 'assistant';
    content: string;
  }>;
  selected_text?: string;     // 选中的文本（可选）
  stream?: boolean;           // 是否启用流式返回（可选，默认 false）
}
```

**Response 变更：**

```typescript
// 非流式（stream=false 或未指定）
{ content: string; snapshot_id: string }

// 流式（stream=true）
// SSE: data: { "chunk": "...", "done": false }
// 最后: data: { "chunk": "", "done": true, "snapshot_id": "..." }
```

### 新增：`GET /api/articles/{id}/snapshots`

返回文章的内容快照列表。

```typescript
// Response
{ snapshots: ContentSnapshot[] }
```

### 新增：`POST /api/articles/{id}/snapshots/{snapshot_id}/restore`

恢复到指定快照版本。

```typescript
// Response
{ content: string; message: string }
```

### 修改：其他 AI 端点（polish/de-ai/optimize-layout）

统一增加 `stream` 可选参数，支持 SSE 流式返回。返回前自动创建快照。

## 后端 Prompt 重构

### 新的 ARTICLE_CHAT_TEMPLATE

```
你是一名公众号文章写作助手。用户正在通过多轮对话优化文章。

## 文章信息
- 标题：{title}
- 类型：{article_type}
- 使用模板：{template_name}

## 当前文章内容
{content}

## 对话历史
{chat_history}

## 用户最新要求
{instruction}

## 约束
1. 直接输出优化后的文章全文，不要额外说明
2. 如果用户只要求修改某个段落，保持其他部分不变
3. 保持文章的整体风格和结构一致性
4. 如果用户的要求不明确，输出原文并在末尾用 <!-- AI_NOTE: xxx --> 标注疑问
```

### 上下文窗口管理策略

```
token 预算分配：
├── 系统提示词（固定）：~500 tokens
├── 文章全文：~3000 tokens（从当前 2000 提升）
├── 对话历史：~2000 tokens（最近 5 轮完整 + 更早轮次摘要）
└── 预留给输出：~2000 tokens
总计：~7500 tokens（适配大多数模型上下文窗口）

截断策略：
1. 保留最近 5 轮完整对话（user + assistant 各一条为 1 轮）
2. 第 6 轮及更早的对话：用 AI 生成摘要（"用户要求将语气改轻松，AI 已执行"）
3. 如果文章内容超长（>3000 tokens），截断中间部分，保留开头和结尾
```

## 前端状态管理变更

### Zustand Store 扩展

```typescript
// articlesSlice.ts 新增状态
interface ArticlesSlice {
  // ... 现有状态 ...

  // 新增
  chatMessages: Record<string, ChatMessage[]>;  // key = article_id
  contentSnapshots: Record<string, ContentSnapshot[]>;
  isStreaming: boolean;                          // 是否正在流式生成
  selectedText: string | null;                   // 编辑器中选中的文本
  selectedTextRange: { from: number; to: number } | null;

  // 新增 actions
  addChatMessage: (articleId: string, message: ChatMessage) => void;
  clearChatMessages: (articleId: string) => void;
  addSnapshot: (articleId: string, snapshot: ContentSnapshot) => void;
  restoreSnapshot: (articleId: string, snapshotId: string) => void;
  setIsStreaming: (streaming: boolean) => void;
  setSelectedText: (text: string | null, range?: { from: number; to: number }) => void;
}
```

## 实现计划

### Phase 1：对话上下文与聊天面板（核心）

**改动文件：**
- `desktop/web/src/pages/ArticlePublish/index.tsx` — 重构 AI 助手区域为对话面板
- `desktop/web/src/api/articles.ts` — 修改 chat 接口，新增 snapshots 接口
- `desktop/web/src/stores/articlesSlice.ts` — 新增 chatMessages / snapshots 状态
- `desktop/routers/articles.py` — 修改 chat 端点，新增 snapshots 端点
- `services/ai/content.py` — 重构 `chat_article()` 支持多轮对话
- `services/ai/prompts.py` — 重写 ARTICLE_CHAT_TEMPLATE

**预估工期：** 3-4 天

### Phase 2：版本快照与操作历史

**改动文件：**
- `desktop/app_state.py` — 新增 snapshots 存储
- `desktop/routers/articles.py` — 新增快照 CRUD 端点
- `desktop/web/src/pages/ArticlePublish/index.tsx` — 操作历史时间线 UI
- `desktop/web/src/types/articles.ts` — 新增 ContentSnapshot 类型

**预估工期：** 2 天

### Phase 3：流式输出

**改动文件：**
- `desktop/routers/articles.py` — AI 端点改为 SSE 流式
- `desktop/web/src/api/sse.ts` — 复用现有 SSE 工具
- `desktop/web/src/pages/ArticlePublish/index.tsx` — 流式渲染逻辑
- `services/ai/client.py` — `_call_ai()` 支持 streaming 参数

**预估工期：** 2-3 天

### Phase 4：选中文本上下文传递

**改动文件：**
- `desktop/web/src/components/feature/RichTextEditor.tsx` — 暴露选区变化事件
- `desktop/web/src/pages/ArticlePublish/index.tsx` — 选中文本状态管理与 UI 提示
- `desktop/routers/articles.py` — chat 端点接收 selected_text 参数
- `services/ai/prompts.py` — 模板支持 selected_text 注入

**预估工期：** 1-2 天

### Phase 5：快捷指令与 Diff 预览（P1）

**改动文件：**
- `desktop/web/src/pages/ArticlePublish/index.tsx` — 快捷指令标签 + diff 预览组件
- 新增 `desktop/web/src/components/feature/DiffPreview.tsx`
- `desktop/routers/articles.py` — 返回 diff 信息

**预估工期：** 2-3 天

## Open Questions

| # | 问题 | 需要谁回答 |
|---|------|-----------|
| Q1 | 对话历史存储在 `articles.json` 中会显著增加文件体积，是否需要单独存储为 `chat_history/{article_id}.json`？ | 工程 |
| Q2 | SSE 流式输出需要前端支持，当前 `api/sse.ts` 是否已覆盖所有场景（连接中断重连、超时处理）？ | 工程 |
| Q3 | 侧边栏宽度从 340px 增加到 380px 会压缩编辑器空间，是否需要支持拖拽调整宽度？ | 设计 |
| Q4 | 快捷指令的预设列表是否需要用户可配置？还是先用固定的 5-6 个？ | 产品 |
| Q5 | Diff 预览需要引入 diff 库（如 `diff-match-patch`），包体积影响是否可接受？ | 工程 |
| Q6 | AI 操作快照保留 20 个，对于长文章（>5000 字）的存储开销是否可接受？ | 工程 |

## Success Metrics

| 指标 | 类型 | 目标 |
|------|------|------|
| 对话功能使用率 | Leading | 使用 AI 对话的编辑会话占比 ≥ 40% |
| 平均对话轮次 | Leading | 每次使用对话功能的平均轮次 ≥ 3 |
| AI 操作回退率 | Leading | 使用快照回退功能的 AI 操作占比 ≤ 15%（越低说明 AI 结果越满意） |
| 文章编辑完成时间 | Lagging | 从创建到发布队列的平均时间下降 20% |
| 用户满意度 | Lagging | 对 AI 辅助功能的好评率 ≥ 80% |

## 附录：技术依赖

| 依赖 | 用途 | 是否新增 |
|------|------|----------|
| CodeMirror 6 | 编辑器（已有） | 否 |
| zustand v4 | 状态管理（已有） | 否 |
| marked | Markdown 渲染（已有） | 否 |
| diff-match-patch 或 jsdiff | Diff 计算 | 是（Phase 5） |
| EventSource / fetch + ReadableStream | SSE 客户端 | 否（已有 sse.ts） |
| OpenAI-compatible streaming API | 后端 AI 流式调用 | 否（已有基础） |
