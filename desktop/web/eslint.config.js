import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import globals from 'globals'

export default tseslint.config(
  { ignores: ['dist'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...Object.fromEntries(
        Object.entries(reactHooks.configs?.recommended?.rules ?? {}).filter(
          // set-state-in-effect 规则对现有代码过度严格，禁用
          ([key]) => key !== 'react-hooks/set-state-in-effect',
        ),
      ),
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
      // 项目 tsconfig 中 noUnusedLocals: false，保持一致
      '@typescript-eslint/no-unused-vars': 'off',
      // 代码库中原有大量 any 类型，逐步清理
      '@typescript-eslint/no-explicit-any': 'warn',
      // 允许空的 catch 块（用于忽略已知可忽略的错误）
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
)
