# MediaForge 设计规范

本文件定义项目的视觉设计令牌（Design Tokens）。所有样式必须使用 CSS 变量，禁止硬编码颜色、间距、圆角值。

## 设计令牌来源

| 文件 | 作用 |
|------|------|
| `src/index.css` | CSS 变量定义（`:root`、`[data-theme]`、`[data-accent]`） |
| `src/stores/themeSlice.ts` | 主题预设、accent 运行时切换 |
| `tailwind.config.ts` | Tailwind 主题扩展映射到 CSS 变量 |
| `src/styles/form.less` | 表单组件尺寸/间距 Less 变量 |

---

## 主题系统

项目支持 **亮色/暗色/跟随系统** 三种模式，通过 `data-theme` 属性切换：

```css
[data-theme="light"]   /* 亮色 */
[data-theme="dark"]    /* 暗色 */
[data-theme="auto"]    /* 跟随系统 */
```

## 强调色（Accent）预设

5 套强调色方案，通过 `data-accent` 属性切换：

| ID | 名称 | 亮色 | 暗色 | Hover |
|----|------|------|------|-------|
| `purple` | 创作紫（默认） | `#7868d0` | `#a599e0` | `#6354b8` |
| `blue` | 科技蓝 | `#4e6fc2` | `#7b9ad6` | `#3d5da8` |
| `green` | 清新绿 | `#2e9e7a` | `#5cbe9e` | `#238464` |
| `orange` | 暖阳橙 | `#d4893a` | `#e0aa6a` | `#b87228` |
| `notion` | Notion | `#2eaadc` | `#5cc3e4` | `#2496c4` |

---

## 色彩系统

### 强调色变量

```css
--accent:           /* 主强调色 */
--accent-hover:     /* 悬停态 */
--accent-soft:      /* 10% 透明度背景 */
--accent-softer:    /* 5% 透明度背景 */
--accent-glow:      /* 12% 透明度发光 */
--accent-gradient:  /* 渐变背景 */
```

### 表面 / 背景色

| 变量 | 用途 | 亮色 | 暗色 |
|------|------|------|------|
| `--bg` | 页面背景 | `#f8f9fc` | `#0c0d14` |
| `--bg-card` | 卡片背景 | `#ffffff` | `#151620` |
| `--bg-secondary` | 次级背景 | `#f1f3f8` | `#1a1b28` |
| `--bg-elevated` | 悬浮层背景 | `#ffffff` | `#1e1f2e` |
| `--bg-sidebar` | 侧边栏背景 | `#f0f1f6` | `#12131c` |
| `--bg-sidebar-hover` | 侧边栏悬停 | `#e4e6ee` | `#1e2030` |
| `--bg-inset` | 内嵌背景 | `#eef0f5` | `#0a0b12` |

### 文本色

| 变量 | 用途 | 亮色 | 暗色 |
|------|------|------|------|
| `--text` | 主文本 | `#0f172a` | `#f1f5f9` |
| `--text-secondary` | 次级文本 | `#334155` | `#cbd5e1` |
| `--text-muted` | 弱化文本 | `#94a3b8` | `#64748b` |
| `--text-inverse` | 反色文本 | `#f8fafc` | `#ffffff` |

### 边框色

| 变量 | 用途 | 亮色 | 暗色 |
|------|------|------|------|
| `--border` | 默认边框 | `#e2e5ed` | `#252736` |
| `--border-subtle` | 弱边框 | `#eef0f5` | `#1e2030` |
| `--border-accent` | 强调边框 | `var(--accent)` | `var(--accent)` |

### 语义色

| 变量 | 用途 | 值 |
|------|------|-----|
| `--success` | 成功/在线 | `#10b981` |
| `--warning` | 警告 | `#f59e0b` |
| `--danger` | 危险/错误 | `#ef4444` |
| `--info` | 信息 | `#6366f1` |

---

## 圆角系统

```css
--radius-xs:  6px    /* 小元素 */
--radius-sm:  8px    /* 按钮、输入框 */
--radius:     10px   /* 默认 */
--radius-lg:  14px   /* 卡片 */
--radius-xl:  18px   /* 大容器 */
```

> Notion 主题使用更小的圆角值（xs:4px, sm:6px, :8px, lg:12px, xl:16px）

---

## 间距系统

项目使用 Tailwind 默认 spacing scale，表单组件使用 Less 变量：

| 变量 | sm | md | lg |
|------|----|----|-----|
| 高度 | `28px` | `36px` | `44px` |
| 垂直内边距 | `5px` | `9px` | `13px` |
| 水平内边距 | `8px` | `12px` | `16px` |
| 字号 | `12px` | `14px` | `16px` |

---

## 阴影系统

| 变量 | 用途 |
|------|------|
| `--shadow-xs` | 微弱阴影 |
| `--shadow-sm` | 下拉菜单 |
| `--shadow-md` | 弹窗 |
| `--shadow-lg` | 模态框 |
| `--card-shadow` | 卡片悬浮 |

---

## 玻璃态（Glassmorphism）

```css
--glass-bg:      /* 半透明背景 */
--glass-border:  /* 半透明边框 */
--glass-blur:    /* 模糊半径 16px */
```

---

## 字体系统

```css
font-family: 'SF Pro Display', -apple-system, BlinkMacSystemFont, system-ui,
             'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif;
font-size: 14px;
line-height: 1.5;
```

---

## 缓动函数

```css
--ease-out:    cubic-bezier(0.16, 1, 0.3, 1)    /* 出场动画 */
--ease-in-out: cubic-bezier(0.65, 0, 0.35, 1)   /* 过渡动画 */
```

---

## 使用规范

### ✅ 正确

```tsx
<div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-[var(--radius)]">
  <span className="text-[var(--text)]">内容</span>
</div>
```

### ❌ 错误

```tsx
<div className="bg-white border border-gray-200 rounded-lg">  {/* 硬编码 */}
  <span style={{ color: '#333' }}>内容</span>                   {/* 内联样式 */}
</div>
```

### 禁止事项

1. **禁止硬编码颜色值** — 必须使用 `var(--xxx)` 或 Tailwind 语义色
2. **禁止内联样式** — 除动态计算外，必须使用 Tailwind 类名
3. **禁止绕过主题系统** — 新增颜色必须定义 CSS 变量并支持亮暗主题
