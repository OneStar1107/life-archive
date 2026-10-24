// ESLint 扁平配置（ESLint 9 + typescript-eslint 8）
//
// ★ 只依赖 `@typescript-eslint/*` 两个包，不引入 `typescript-eslint` 伞包。
//   伞包是 monorepo 聚合产物，函数式配置在 CI 上多一层安装风险；
//   直接展开 parser + plugin + 推荐配置，行为等价且依赖更少。
import eslint from '@eslint/js'
import tsParser from '@typescript-eslint/parser'
import tsPlugin from '@typescript-eslint/eslint-plugin'
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended'

/** 类型感知的推荐规则集（等价于 tseslint.configs.recommendedTypeChecked） */
const recommendedTypeChecked = [
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    rules: {
      ...tsPlugin.configs['eslint-recommended'].overrides[0].rules,
      ...tsPlugin.configs.recommended.rules,
    },
  },
]

export default [
  {
    ignores: ['eslint.config.mjs', 'dist/**', 'node_modules/**', 'coverage/**'],
  },
  eslint.configs.recommended,
  ...recommendedTypeChecked,
  eslintPluginPrettierRecommended,
  {
    languageOptions: {
      globals: {
        node: 'readonly',
        jest: 'readonly',
      },
      sourceType: 'commonjs',
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // ── 禁止抛字面量（throw '字符串' 这类）──
      // 裸 `throw new Error()` 由 redlines.spec.ts 单测兜住，
      // 这里的 no-throw-literal 只管非 Error 对象的字面量抛出。
      'no-throw-literal': 'error',

      // ── 禁止 any ──
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unsafe-assignment': 'warn',
      '@typescript-eslint/no-unsafe-member-access': 'warn',
      '@typescript-eslint/no-unsafe-return': 'warn',

      // ── 禁止未处理 Promise ──
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',

      // ── 命名与风格 ──
      '@typescript-eslint/naming-convention': [
        'warn',
        {
          selector: 'typeLike',
          format: ['PascalCase'],
        },
      ],
      '@typescript-eslint/explicit-function-return-type': [
        'warn',
        { allowExpressions: true },
      ],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'prefer-const': 'error',
      'object-shorthand': 'warn',
    },
  },
  {
    // 测试文件放宽
    files: ['**/*.spec.ts', '**/*.e2e-spec.ts', 'test/**/*.ts', 'prisma/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      'no-console': 'off',
    },
  },
]
