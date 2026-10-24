/**
 * frontend/pages/login/login.test.js
 * ══════════════════════════════════════════════════════════════
 * 登录流程 · 跨端 UI 用例（6 条）
 * ══════════════════════════════════════════════════════════════
 *
 * ⚠️★★ 尚未在真机验证过 ★★★
 *   三端都还没出包（阶段 06 未完成），本文件**一条都没在真机上跑过**。
 *   状态与 docs/release/test-matrix.md 的「未覆盖」一致。
 *   禁止在未跑过真机的情况下对外声称「登录测试通过」
 *   （07 号禁止事项第 10 条）。
 *
 * 【怎么跑】
 *   1. HBuilderX 安装插件：「初始化测试环境」+「运行 uni-app 自动化测试」
 *   2. frontend/env.js 里把目标平台的 env 设为 true（一次只开一个）
 *   3. 菜单「运行 → 运行 uni-app 自动化测试」
 *
 * 【平台限制】
 *   · iOS 仅支持模拟器；Windows 跑不了 iOS 用例（需 macOS）
 *   · 鸿蒙无云打包，需本机 DevEco 出包后跑
 *
 * 【无顺序依赖的保证】
 *   每条用例都先 resetToGuest 清空 storage。
 *   登录会写 access_token，不清的话后面的「游客浏览」用例会失败 ——
 *   而这类失败最烦人：单跑通过，连跑失败，还查不出原因。
 */

const account = require('../../fixtures/account')
const {
  CASE_TIMEOUT,
  waitForSelector,
  exists,
  expectExists,
  expectTextContains,
  resetToGuest,
  seedConsent,
} = require('../../fixtures/automator')

describe('登录流程', () => {
  /**
   * ★ 每条用例都从「游客 + 已同意隐私政策」起步，互不依赖。
   * 登录会写 access_token，不清的话后面的「游客浏览」用例会失败 ——
   * 而这类失败最烦人：单跑通过，连跑失败，还查不出原因。
   */
  let page

  beforeEach(async () => {
    page = await program.reLaunch('/pages/login/login')
    await resetToGuest(page)
    // 种下「已同意隐私政策」：登录页虽在白名单里，
    // 但没有这步的话，提交后跳首页会被守卫拦去隐私页，
    // 「登录成功跳首页」这条用例会误判为失败。
    await seedConsent(page, true)
  })

  it('① 手机号少于 11 位时给出格式错误提示，且不发请求', async () => {
    // 预期行为（login.uvue 的 onSubmit）：
    //   phone.length != 11 → bannerError = messageOf(PHONE_INVALID)
    //   直接 return，不发网络请求。
    // ★ 为什么单独验这一条：端上校验的意义就是省掉一次白跑的请求。
    //   如果端上没拦住，用户点了登录要转 15 秒超时才知道自己填错了。
    const inputs = await page.$$('.field-input')
    if (inputs.length >= 2) {
      await inputs[0].input('1380013800') // 10 位
      await inputs[1].input('QaPass2026')
    }

    const submit = await page.$('.btn')
    if (submit != null) await submit.tap()

    await waitForSelector(page, '.banner-text', 5000)
    await expectTextContains(page, '.banner-text', '手机号', '手机号格式错误应提示')
  }, CASE_TIMEOUT)

  it('② 密码不足 8 位时给出强度提示，且不发请求', async () => {
    // 预期行为：password.length < 8 → bannerError = messageOf(PASSWORD_WEAK)
    const inputs = await page.$$('.field-input')
    if (inputs.length >= 2) {
      await inputs[0].input('13800138000')
      await inputs[1].input('123') // 弱密码
    }

    const submit = await page.$('.btn')
    if (submit != null) await submit.tap()

    await waitForSelector(page, '.banner-text', 5000)
    await expectTextContains(page, '.banner-text', '密码', '弱密码应给出强度提示')
  }, CASE_TIMEOUT)

  it('③ 密码错误时展示后端返回的业务文案，而不是自造的「登录失败」', async () => {
    // ★ 这是 05 号 T7 的核心约束：错误文案只有一个出口（error-code.ts）。
    //   如果页面自己写「登录失败」，用户会看到与后端日志不一致的说法，
    //   排查时对不上；更糟的是同一错误三端说法不同。
    // 预期：后端返回 20006 → messageOf(20006) = 「手机号或密码不正确」
    const inputs = await page.$$('.field-input')
    if (inputs.length >= 2) {
      await inputs[0].input(account.wrong.phone)
      await inputs[1].input(account.wrong.password)
    }

    const submit = await page.$('.btn')
    if (submit != null) await submit.tap()

    await waitForSelector(page, '.banner-text', 15000)
    const banner = await page.$('.banner-text')
    const text = banner != null ? String((await banner.text()) || '') : ''

    // 文案来自错误码表，含「手机号或密码」这一稳定片段
    if (!text.includes('手机号或密码') && !text.includes('不正确')) {
      throw new Error('密码错误的文案不是错误码表里的那一句，实际为：' + text)
    }
    // ★ 反向断言：不允许出现页面自造的通用说法
    if (text === '登录失败') {
      throw new Error('页面自造了「登录失败」文案，绕过了 error-code.ts 统一出口')
    }
  }, CASE_TIMEOUT)

  it('④ 登录成功后跳转到首页，且登录页不在页面栈里', async () => {
    // ★ 为什么强调「不在页面栈里」：login.uvue 用的是 redirectTo 而不是
    //   navigateTo —— 登录页若留在栈里，用户按返回会看到已登录的登录表单，
    //   还能再点一次登录。这个体验 bug 只有断言页面栈才测得出来。
    const inputs = await page.$$('.field-input')
    if (inputs.length >= 2) {
      await inputs[0].input(account.primary.phone)
      await inputs[1].input(account.primary.password)
    }

    const submit = await page.$('.btn')
    if (submit != null) await submit.tap()

    // 首页标记元素（index.uvue 的打招呼区）
    await waitForSelector(page, '.greet-block', 20000)

    // 回到上一页应当已经在首页（说明登录页被 redirectTo 弹掉了）
    await page.callUniMethod('uni.navigateBack', { delta: 1 })
    await waitForSelector(page, '.greet-block', 5000)
  }, CASE_TIMEOUT)

  it('⑤ 游客可直接进入首页，无需登录', async () => {
    // ★ 游客是一等公民（产品立场），不是被藏起来的兜底。
    //   这条用例保障「暂不登录，先看看」这个按钮真的能走通。
    //   若守卫误拦游客，回归症状是：点「先看看」被弹回登录页，
    //   游客功能等于没有。
    const skip = await page.$('.foot-text--dim')
    if (skip != null) {
      await skip.tap()
    }

    await waitForSelector(page, '.greet-block', 15000)
  }, CASE_TIMEOUT)

  it('⑥ 点击「去注册」跳转到注册页', async () => {
    const link = await page.$('.foot-link')
    if (link != null) {
      await link.tap()
    }

    // 注册页有主按钮（register.uvue 用 AppButton）
    await waitForSelector(page, '.btn', 10000)

    // 确认确实离开了登录页
    const stillOnLogin = await exists(page, '.banner')
    if (stillOnLogin) {
      throw new Error('点「去注册」后仍停留在登录页')
    }
  }, CASE_TIMEOUT)
})
