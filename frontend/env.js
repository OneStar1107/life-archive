/**
 * frontend/env.js
 * ══════════════════════════════════════════════════════════════
 * uni-automator 环境配置（07 号 T1）
 * ══════════════════════════════════════════════════════════════
 *
 * 【本文件不是 Node 运行的构建配置】
 *   它由 HBuilderX 的「运行 uni-app 自动化测试」插件读取，
 *   用来决定「这次跑在哪个平台上」。不要用 node 去 require 它。
 *
 * 【怎么用】
 *   HBuilderX 安装插件：「初始化测试环境」+「运行 uni-app 自动化测试」，
 *   然后在 env.js 里把目标平台的 env 改成 true（一次只开一个），
 *   菜单「运行 → 运行 uni-app 自动化测试」。
 *   框架会向用例注入全局 program 对象：
 *     const page = await program.reLaunch('/pages/index/index')
 *     const el   = await page.$('.submit-btn')
 *     await el.tap()
 *     await page.callUniMethod('uni.showToast', { title: 'ok' })
 *
 * ────────────────────────────────────────────────────────────
 * ★★★ 平台限制：不知道这一点会白忙一天（07 号 T1 明确列出）★★★
 * ────────────────────────────────────────────────────────────
 *
 * 1. App 端 iOS **仅支持模拟器**，不支持真机跑 automator。
 *    → iOS 拿不到真机自动化数据。必须另走 **XCTest / XCUITest**
 *      并配合 **TestFlight** 外部测试收集真实用户反馈。
 *      07 号禁止事项第 2 条：**禁止只跑模拟器就提交上架**。
 *
 * 2. **Windows 不支持运行 iOS 端用例**。
 *    → 本工程开发机是 Windows，iOS 自动化必须切到 macOS
 *      或在 CI 上配 macOS runner（见 docs/release/ci-pipeline.md 的说明）。
 *      这也是「iOS 端不出包也能测一部分」的原因：ipa 走 HBuilderX 云打包。
 *
 * 3. **鸿蒙没有云打包**，必须本地 DevEco Studio 出包，
 *    因此鸿蒙的 automator 只能在本机跑，且**不在 CI 范围内**。
 *    鸿蒙的单元测试用 `@ohos/hypium` + `hamock`，与 Jest 是两套体系。
 *
 * 4. 自定义基座**严禁用于上架**（06 号 A7）。
 *    跑自动化用标准基座即可（包名 io.dcloud.uniappx）。
 *
 * ────────────────────────────────────────────────────────────
 * ★★ 当前验证状态：全部「未在真机验证过」★★
 * ────────────────────────────────────────────────────────────
 *
 *   pages/**/*.test.js 里的用例**代码已就绪，但一条都没有在真机上跑过**，
 *   因为三端都还没出包（阶段 06 未完成）。
 *   它们当前的状态与 docs/release/test-matrix.md 的「未覆盖」完全一致。
 *   **禁止在未跑过真机的情况下对外声称「三端测试通过」**
 *   （07 号禁止事项第 10 条：禁止声称"已测试"但拿不出报告）。
 *
 *   出包后请按 test-matrix.md 的流程逐台验证，并把状态从
 *   「未覆盖」改成「已通过」或「有缺陷」。
 */

module.exports = {
  // ── App（Android / iOS 通用基座）────────────────────────
  'APP-PLUS': {
    env: 'APP-PLUS',
    // ★ iOS 只能跑模拟器；真机必须转 XCTest/XCUITest + TestFlight
    iosSupport: 'simulator-only',
  },

  // ── HarmonyOS NEXT ─────────────────────────────────────
  'APP-HARMONY': {
    env: 'APP-HARMONY',
    // 鸿蒙无云打包，本地 DevEco Studio 出 .app
    cloudBuild: false,
    // 鸿蒙端单测走 hypium，不走本套 Jest
    nativeTestRunner: 'hypium',
  },

  // ── Android ────────────────────────────────────────────
  'APP-ANDROID': {
    env: 'APP-ANDROID',
    // 支持真机 automator（本工程的主战场）
    deviceSupport: 'real-device',
  },

  // ── iOS ────────────────────────────────────────────────
  'APP-IOS': {
    env: 'APP-IOS',
    // ★ 两个硬限制叠在一起：
    //   automator 只支持模拟器 + Windows 根本跑不了 iOS 用例。
    //   → 必须在 macOS 上跑模拟器自动化，真机验证转 TestFlight。
    deviceSupport: 'simulator-only',
    requiresHostOS: 'macos',
  },

  // ── H5 ─────────────────────────────────────────────────
  'H5': {
    env: 'H5',
    // H5 只能作为快速预览，不能作为上架依据
    releaseTarget: false,
  },
}
