/**
 * babel.config.js
 * ══════════════════════════════════════════════════════════════
 * 只服务于 Node 层单元测试（jest.config.js）
 * ══════════════════════════════════════════════════════════════
 *
 * ★ 为什么需要它：
 *   被测源码是 `.ts`（core/http/*.ts、core/router/guard.ts），
 *   而 Jest 默认只会原样加载 .ts，导致 import 语法直接报错。
 *   babel-jest + preset-typescript 负责把类型标注剥掉，保留运行语义。
 *
 * ★ 为什么不用 ts-jest：
 *   ts-jest 会做**完整类型检查**，一旦 core/ 下引入了只在 HBuilderX
 *   编译期存在的类型（比如 uts 的 UniPickerDateChangeEvent），
 *   类型检查就会失败 —— 但那不是代码错误，只是 IDE 里没有 uts 类型定义。
 *   babel 只做语法转换，把「类型环境缺失」与「代码错误」两件事分开，
 *   后者仍由 tsc/eslint 在 CI 的 lint 阶段负责。
 *
 * ★ 为什么不用 preset-typescript 的 allExtensions / isTSX：
 *   本工程没有 .tsx，且 .uvue 根本不进 Node 测试路径（见 package.json 注释）。
 */

module.exports = {
  presets: [
    [
      '@babel/preset-env',
      {
        // 目标就是当前 Node，不做向下兼容 —— CI 固定 Node 20，本地也用它
        targets: { node: 'current' },
      },
    ],
    '@babel/preset-typescript',
  ],
}
