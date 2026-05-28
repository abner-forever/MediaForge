# Linter 配置迭代计划

## 目标

为项目配置 Python 和 TypeScript/前端 linter，统一代码风格，自动捕获常见错误，提升代码质量。

---

## 第一阶段：Python — Ruff

### 为什么选 Ruff

- 速度极快（比 flake8 快 10-100 倍），零配置即可运行
- 一个工具替代 flake8 + isort + pyupgrade + autoflake
- 原生支持 `pyproject.toml` 配置
- 可自动修复大部分问题

### 配置方案

在 `pyproject.toml` 中添加：

```toml
[tool.ruff]
target-version = "py310"
line-length = 120

[tool.ruff.lint]
select = [
    "E",    # pycodestyle errors
    "W",    # pycodestyle warnings
    "F",    # pyflakes
    "I",    # isort (import sorting)
    "UP",   # pyupgrade
    "B",    # flake8-bugbear
    "SIM",  # flake8-simplify
]
ignore = [
    "E501",   # 行长度限制（交给 formatter 处理）
    "SIM108", # 三元表达式（保持可读性）
]

[tool.ruff.lint.isort]
known-first-party = ["config", "services", "utils", "desktop"]
```

### 执行步骤

1. 添加配置到 `pyproject.toml`
2. `pip install ruff && ruff check . --fix` 自动修复
3. 手动处理剩余无法自动修复的问题
4. 在 CI 中添加 `ruff check .` 步骤（已在 `test` job 中加 pytest，可并行添加）

---

## 第二阶段：TypeScript/前端 — ESLint + Prettier

### ESLint 配置

使用 ESLint 9 flat config（`eslint.config.js`）：

```js
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: { react, 'react-hooks': reactHooks },
    rules: {
      'react/react-in-jsx-scope': 'off',       // React 17+ 不需要 import React
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
    },
    settings: { react: { version: 'detect' } },
  },
  {
    ignores: ['dist/**', 'node_modules/**', '*.config.*'],
  },
);
```

### Prettier 配置

```json
{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2
}
```

### 执行步骤

1. `pnpm add -D eslint @eslint/js typescript-eslint eslint-plugin-react eslint-plugin-react-hooks prettier eslint-config-prettier`
2. 创建 `eslint.config.js` 和 `.prettierrc`
3. `npx eslint src/ --fix` 自动修复
4. `npx prettier --write src/` 格式化
5. 在 `package.json` 中添加 script：
   - `"lint": "eslint src/"`
   - `"format": "prettier --write src/"`
6. 更新 tsconfig：开启 `noUnusedLocals: true` 和 `noUnusedParameters: true`
7. CI 中添加 `pnpm run lint` 步骤

---

## 第三阶段：Pre-commit Hook（可选）

使用 `husky` + `lint-staged` 在提交前自动检查：

```json
// package.json
{
  "lint-staged": {
    "*.{ts,tsx}": ["eslint --fix", "prettier --write"],
    "*.py": ["ruff check --fix"]
  }
}
```

安装：`pnpm add -D husky lint-staged && npx husky init`

---

## 预期收益

| 阶段 | 工具 | 耗时 | 收益 |
|------|------|------|------|
| 第一阶段 | Ruff | 0.5 天 | 统一 Python 代码风格，自动发现潜在 bug |
| 第二阶段 | ESLint + Prettier | 1 天 | 统一前端代码风格，React Hooks 规则检查 |
| 第三阶段 | Husky | 0.5 天 | 提交时自动拦截问题代码 |

## 优先级建议

**第一阶段优先**——Ruff 零配置起步，收益最大、成本最低。第二阶段可以后续迭代。

---

*本文档随项目迭代更新。*
