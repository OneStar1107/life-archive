/**
 * frontend/jest.config.js
 * ══════════════════════════════════════════════════════════════
 * Node 层单元测试配置（07 号 T1）
 * ══════════════════════════════════════════════════════════════
 *
 * ★★ 这个配置**只跑第 1 层：Node 层纯逻辑单测** ★★
 *
 *   跑的是：frontend/tests/unit/*.test.js
 *   特点：被测模块（core/http/error-code、retry、cancel、core/router/guard）
 *         是无 uni 依赖的纯逻辑，Node 可直接执行 → **CI 门禁就跑这一层**。
 *
 *   不跑：pages 目录下的跨端 UI 用例（{页面名}.test.js）
 *         那些是 uni-automator 用例，需要 HBuilderX 注入 program 对象
 *         并驱动真机/模拟器/基座。放进 CI 只会得到一片红色，
 *         让人误以为「测试坏了」，实际是「环境不对」。
 *         它们的运行方式见 env.js 的注释与 docs/release/ci-pipeline.md。
 *
 * ★★ 为什么 .uvue 页面不能在 Node 里 mount ★★
 *
 *   uni-app x 的页面是 .uvue + <script lang="uts">，编译目标是 uts/ArkTS，
 *   不是 JS。vue-jest / @vue/test-utils 面向的是 .vue（SFC → JS），
 *   解析 .uvue 会直接失败。
 *
 *   更关键的是：即使能解析，页面渲染依赖 uni 的原生渲染管线
 *   （<view> / <text> / <scroll-view> 都不是 DOM 元素）。
 *   在 jsdom 里挂载后 querySelector('.page') 永远返回 null，
 *   测试会「假通过」—— 比没有测试更危险，因为它掩盖问题。
 *
 *   所以本工程的组件/页面测试只有一条正路：uni-automator 真机自动化。
 */

module.exports = {
  // ── 测试环境 ───────────────────────────────────────────
  // ★ 必须是 node：被测模块是纯逻辑，不需要 DOM。
  //   刻意不用 jsdom —— 一旦哪天有人误加页面测试进来，
  //   jsdom 会让它「通过」但什么都没测到。node 环境会立刻暴露 import 错误。
  testEnvironment: 'node',

  // ── 匹配规则（07 号 T1）────────────────────────────────
  // ★ 只匹配 .test.js。刻意**不**匹配 .spec.js / .test.ts：
  //   命名统一为 {页面名}.test.js / {服务}.spec.ts（07 号 ⑦），
  //   混用两种后缀会让「哪些用例在跑」变得不可查。
  testMatch: ['<rootDir>/tests/unit/**/*.test.js'],

  // ★ 双保险：即使有人把 pages/*.test.js 改了名字混进来，也在这里挡住
  testPathIgnorePatterns: [
    '<rootDir>/node_modules/',
    // ↓↓↓ 关键：跨端 UI 用例必须由 HBuilderX 驱动，不进 Node 门禁
    '<rootDir>/pages/',
    '<rootDir>/harmony-configs/',
    '<rootDir>/unpackage/',
  ],

  moduleFileExtensions: ['js', 'json', 'ts'],

  // ── 转译 ──────────────────────────────────────────────
  // 被测源码是 .ts（core/**/*.ts），需要 babel-jest 剥掉类型标注。
  // 配置见 babel.config.js 的注释（为什么不用 ts-jest）。
  transform: {
    '^.+\\.(t|j)s$': 'babel-jest',
  },

  // ── 模块解析 ──────────────────────────────────────────
  moduleNameMapper: {
    // ★ 对齐页面里的 `@/` 导入写法。
    //   页面写 `from '@/core/http/error-code'`，
    //   单测也写同样路径 —— 改一处不会只改一半。
    '^@/(.*)$': '<rootDir>/$1',
  },

  // ── 覆盖率 ────────────────────────────────────────────
  // ★ 只统计 core/ 下的纯逻辑。pages/ 覆盖率在 Node 里恒为 0，
  //   报上去只会污染指标（07 号禁止事项第 10 条：禁止拿不出报告的数字）。
  collectCoverageFrom: [
    'core/http/error-code.ts',
    'core/http/retry.ts',
    'core/http/cancel.ts',
    'core/router/guard.ts',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text-summary', 'lcov'],

  // ── 其他 ──────────────────────────────────────────────
  // 单测是纯内存逻辑，给 10s 足够；慢的是 e2e（在后端跑）
  testTimeout: 10000,
  // 失败时立刻暴露是哪一行断言，不用再手动 --verbose
  verbose: true,
}
