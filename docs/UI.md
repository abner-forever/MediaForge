你是一个资深前端架构师 + UI设计师，请为一个AI产品生成高质量前端代码。

【项目背景】
产品名称：MediaForge（图文工坊）
定位：AI驱动的内容自动化工具
核心流程：内容抓取 → AI评分 → 文案生成 → 发布队列 → 自动发布
技术栈：React 18 + TypeScript + Vite + Tailwind CSS + Zustand

【设计目标】
请生成一个“去AI味”的科技感UI页面，要求达到真实商业产品水平，而不是AI生成的普通UI。

【视觉风格要求】
- 深色主题（dark mode）
- 科技感（futuristic / AI / cyberpunk）
- 使用渐变（gradient）、发光（glow）、毛玻璃（glassmorphism）
- 强视觉层级（typography hierarchy）
- 高级感（类似 Linear / Vercel / Stripe / Notion）
- 不允许出现普通 Tailwind 默认风格

【动效要求】
- 使用 framer-motion 实现动画
- 页面有进入动画（fade + slide）
- 卡片 hover 有位移 + 阴影变化
- 按钮 hover 有缩放或光效
- 可选：滚动驱动动画（scroll-based animation）

【页面结构（必须包含）】
1. Hero（产品介绍 + slogan + CTA）
2. Features（核心能力卡片）
3. Workflow（流程可视化：抓取→评分→生成→发布）
4. Preview（产品界面展示）
5. CTA（行动引导）

【代码要求】
- 使用函数组件（Function Component）
- 使用 TypeScript（类型完整）
- 组件拆分清晰（Hero / FeatureCard / Workflow 等）
- 使用 Tailwind，但必须做设计强化（不要默认样式）
- 样式要有设计感（spacing / radius / shadow / gradient）
- 代码必须可运行，不要伪代码

【严格限制（非常重要）】
禁止：
- 普通白底UI
- 默认蓝色按钮
- 没有层级的排版
- 没有 hover 动效
- 没有动画的静态页面
- 看起来像“AI生成模板”

【参考风格（必须模拟）】
Awwwards / Godly / Vercel / Linear / Stripe
