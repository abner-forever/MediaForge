# MediaForge 前端开发规范

本规范适用于 `desktop/web/src/` 下的 React/TypeScript 前端项目。所有 AI 辅助开发必须遵循以下约束。

## 技术栈

- React 18 + TypeScript（严格模式）
- Zustand v4（单 store + slice 模式）
- Tailwind CSS + CSS 变量设计令牌
- react-router-dom v6（BrowserRouter + lazy 路由）
- Vite 构建，pnpm 包管理

## 目录结构约束

```
src/
  api/          # API 层（按模块拆分，一个域一个文件）
  types/        # TypeScript 类型（按域拆分，一个域一个文件）
  stores/       # Zustand store（slice 模式，一个域一个 slice）
  hooks/        # 自定义 Hooks
  utils/        # 工具函数
  components/   # 组件（ui/ layout/ feature/ 三个子目录）
  pages/        # 页面（每个页面一个目录）
  routes.tsx    # 路由配置
```

## API 层规范

### 新增 API 端点
1. 在 `types/` 对应域文件中定义请求/响应类型
2. 在 `api/` 对应模块文件中添加方法，从 `./base` 导入 `get/post/put/del`
3. 如果需要新模块，创建 `api/xxx.ts` 并在 `api/client.ts` 中添加 re-export
4. 禁止在组件或 store 中直接调用 `fetch()`

### SSE 流式请求
使用 `api/sse.ts` 提供的通用工具：
- `sseGet<T>(url, onEvent, options?)` — GET 请求 SSE
- `ssePost<T, R>(url, body, onEvent, options?)` — POST 请求 SSE，支持提取最终结果
- `readSSEStream<T>(stream, onEvent, options?)` — 底层 ReadableStream 读取

禁止手动实现 ReadableStream + TextDecoder + newline 解析逻辑。

### 类型定义
- 所有 API 相关类型定义在 `types/` 目录，按域拆分
- 禁止在 API 模块文件中定义 `interface`
- `types/index.ts` 是 barrel re-export，新增类型必须在此导出
- 组件内部类型（Props 等）可定义在组件文件内

## 状态管理规范

### Store 结构
使用 Zustand v4 的 `StateCreator` slice 模式：
```typescript
// stores/xxxSlice.ts
import type { StateCreator } from 'zustand';
import type { AppState } from './types';

export interface XxxSlice {
  // 状态 + actions
}

export const createXxxSlice: StateCreator<AppState, [], [], XxxSlice> = (set, get) => ({
  // 实现
});
```

### 新增状态域
1. 在 `stores/types.ts` 的 `AppState` 中添加新域的类型
2. 创建 `stores/xxxSlice.ts` 定义 slice
3. 在 `stores/index.ts` 中组合 slice
4. 禁止创建多个独立 store，所有状态通过 `useStore` 统一访问

### 持久化
- localStorage 持久化使用 `hooks/usePersistedState.ts`
- Store 中的 localStorage 逻辑集中在对应的 slice 中
- 后端同步的设置通过 `settingsApi.save()` 实现

## 组件规范

### 组件分类
- `components/ui/` — UI 原语（Checkbox, Select, Modal, Toast 等），无业务逻辑
- `components/layout/` — 布局组件（Layout, Sidebar, ErrorBoundary, Lightbox, ProgressOverlay）
- `components/feature/` — 业务功能组件（RichTextEditor, EffectEntry, modalApi 等）

### 新增组件
1. 根据职责放入对应子目录
2. 如果是全局可复用的 UI 原语，放 `ui/`
3. 如果是页面特有的子组件，放 `pages/XxxPage/` 下
4. 在 `components/index.ts` 中导出（如果是共享组件）

### 向后兼容
旧路径（`components/Xxx.tsx`）保留 forwarding stub，消费端无需立即修改路径。

## 路由规范

路由配置在 `routes.tsx`，格式：
```typescript
export const appRoutes: AppRoute[] = [
  { path: '/', element: Dashboard },
  { path: '/queue', element: Queue, errorBoundary: true },
  // ...
];
```

新增页面：
1. 在 `pages/` 下创建页面目录
2. 在 `routes.tsx` 中添加 lazy import 和路由配置
3. 在 `components/layout/Sidebar.tsx` 中添加导航链接（如需要）

## Hooks 规范

可用的自定义 Hooks：
- `useLoading` — 防并发 async 加载状态
- `useApi<T>` — 通用异步 API 调用（loading/error/data）
- `useSSE<T>` — SSE 流消费 + AbortController 生命周期
- `usePersistedState<T>` — localStorage 持久化状态

新增 Hook 放在 `hooks/` 目录，以 `use` 前缀命名。

## 代码风格

- 语言：中文注释和文档，英文代码标识符
- 组件文件：PascalCase（`MyComponent.tsx`）
- 工具/Hook 文件：camelCase（`useMyHook.ts`）
- 类型文件：camelCase（`myDomain.ts`）
- 导入顺序：React → 第三方库 → 本地模块（api/stores/hooks/utils/components）
- 禁止使用 `any` 类型（除非有充分理由并注释说明）
- 禁止使用 `// @ts-ignore`（应修复类型问题）

## 命名约定

- API 模块：`xxxApi`（如 `dashboardApi`, `settingsApi`）
- Store slice：`createXxxSlice`（如 `createThemeSlice`）
- 组件 Props：`XxxProps`（如 `LoadingProps`）
- 页面组件：默认导出，文件名即组件名

## 禁止事项

1. 禁止在组件/store 中直接 `fetch()`，必须通过 `api/` 模块
2. 禁止手动实现 SSE 读取逻辑，必须使用 `api/sse.ts`
3. 禁止在 API 模块文件中定义 `interface`，类型必须在 `types/` 中
4. 禁止创建多个 Zustand store，所有状态通过 `useStore` 访问
5. 禁止将业务逻辑放在 `components/ui/` 中
6. 禁止跨页面直接导入其他页面的组件（应提取到共享组件）
7. 禁止在路由配置之外的地方使用 `React.lazy()`
