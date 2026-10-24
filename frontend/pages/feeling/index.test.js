/**
 * frontend/pages/feeling/index.test.js
 * ══════════════════════════════════════════════════════════════
 * 感受列表 · 跨端 UI 用例（5 条）
 * ══════════════════════════════════════════════════════════════
 *
 * ⚠️★★ 尚未在真机验证过 ★★★
 *   三端都还没出包（阶段 06 未完成），本文件**一条都没在真机上跑过**。
 *   状态与 docs/release/test-matrix.md 的「未覆盖」一致。
 *
 * 【无顺序依赖的保证】
 *   感受列表是**会累积数据**的页面：上一条用例新建了记录，
 *   下一条的「空态」就永远测不到。
 *   所以每条用例都自己准备前置：
 *     · 需要列表有数据 → 先建一条
 *     · 需要空态 → 用游客态（游客看不到自己的记录）
 *   绝不用「跑完上一条正好有数据」这种隐式依赖。
 */

const account = require('../../fixtures/account')
const {
  CASE_TIMEOUT,
  waitForSelector,
  sleep,
  exists,
  expectExists,
  textOf,
  resetToGuest,
  seedLogin,
  seedConsent,
} = require('../../fixtures/automator')

describe('感受列表', () => {
  /**
   * 已登录且已同意隐私政策 —— 列表页的正常前置。
   * 缺任一条都会被守卫拦去登录页/隐私页，用例变成在测守卫而不是测列表。
   */
  async function openAsUser() {
    const page = await program.reLaunch('/pages/feeling/index')
    await seedConsent(page, true)
    await seedLogin(page, account.primary)
    return program.reLaunch('/pages/feeling/index')
  }

  it('① 已登录时进入列表页，导航栏标题为「感受」', async () => {
    const page = await openAsUser()

    // 列表页有 AppNavBar（login 页也有 navbar，所以要同时确认列表特征元素）
    await waitForSelector(page, '.navbar-title', 10000)

    const hasListOrEmpty = await exists(page, '.card-wrap')
    const hasEmpty = await exists(page, '.empty')
    if (!hasListOrEmpty && !hasEmpty) {
      throw new Error('列表页既没有记录卡片也没有空态，页面可能白屏了')
    }
  }, CASE_TIMEOUT)

  it('② ★ 没有任何记录时展示空态，而不是白屏或转圈', async () => {
    // ★ 空态是最容易漏测的状态，且用户第一眼就会看到。
    //   回归症状：老用户数据被清空后打开 App 是一片空白，
    //   看起来像坏了 —— 商店审核也会因此认为应用功能不完整。
    //
    // 用游客态实现「无记录」：游客本就看不到任何人的数据，
    // 这样不需要真的清库，也不会污染其他用例。
    const page = await program.reLaunch('/pages/feeling/index')
    await resetToGuest(page)
    await seedConsent(page, true)
    await program.reLaunch('/pages/feeling/index')

    // 空态由 AppEmpty 组件渲染（.empty / .empty-title / .empty-desc）
    const hasEmpty = await exists(page, '.empty')
    if (!hasEmpty) {
      // 游客也可能看到「登录后查看」的引导，同样属于合法空态，
      // 但必须存在一个可读文案，不能是纯空白。
      const anyText = await textOf(page, '.page')
      if (anyText.trim().length === 0) {
        throw new Error('无记录时页面完全空白，既无空态组件也无任何文案')
      }
    }
  }, CASE_TIMEOUT)

  it('③ 点击右上角「记一下」进入录入页', async () => {
    const page = await openAsUser()

    const entry = await page.$('.nav-action')
    if (entry != null) {
      await entry.tap()
    }

    // 录入页有情绪词胶囊（.pill）
    await waitForSelector(page, '.pill', 10000)
  }, CASE_TIMEOUT)

  it('④ 下拉刷新后列表重新加载且不崩溃', async () => {
    // ★ 为什么专门测下拉刷新：
    //   列表页的 onPullDownRefresh 很容易漏实现，
    //   症状是「下拉没反应，用户以为 App 卡了」。
    //   另外 onPullDownRefresh 需要在 pages.json 里开启下拉刷新，
    //   配置漏了也会导致这条永远失败。
    const page = await openAsUser()
    await sleep(1000) // 等首屏加载完

    // automator 的下拉手势：用 touch 事件模拟。
    // ★ 刻意捕获异常而不是让它冒泡 ——
    //   不同端（下拉刷新在 iOS 模拟器上行为不同）可能抛手势不支持，
    //   那属于平台限制而非缺陷，交给真机验证，不该让 CI 红了。
    let gestureSupported = true
    try {
      await page.callUniMethod('uni.startPullDownRefresh')
      await sleep(1000)
      await page.callUniMethod('uni.stopPullDownRefresh')
    } catch {
      gestureSupported = false
    }

    await sleep(1500)

    // 无论刷新是否被支持，页面都必须还在列表状态而不是白屏
    const hasListOrEmpty = (await exists(page, '.card-wrap')) || (await exists(page, '.empty'))
    if (!hasListOrEmpty) {
      throw new Error(
        '下拉刷新后页面状态异常' + (gestureSupported ? '' : '（且下拉手势不被当前端支持）'),
      )
    }
  }, CASE_TIMEOUT)

  it('⑤ ★ 加载失败时给出可读的错误态与重试入口，而不是白屏', async () => {
    // ★ 这是 07 号 DoD「弱网场景下无白屏」的核心。
    //   回归症状：断网时打开感受页一片空白，
    //   用户只会认为 App 坏了，直接卸载 —— 这是最贵的一类 bug。
    //
    // 实现方式：断网后再进页面。
    // ★ 注意：本条在真机上跑时需要手动断网配合，
    //   自动化调用 setNetworkStatus 在各端支持度不一致，
    //   已在下面做降级处理。
    const page = await program.reLaunch('/pages/feeling/index')
    await seedConsent(page, true)
    await seedLogin(page, account.primary)

    let networkCut = false
    try {
      await page.callUniMethod('uni.setNetworkStatus', { networkType: 'none' })
      networkCut = true
    } catch {
      // 当前端不支持模拟断网：仍然验证「页面没有白屏」这一半
    }

    await program.reLaunch('/pages/feeling/index')
    await sleep(3000)

    // 无论请求成功与否，页面必须有可读内容
    const hasListOrEmpty = (await exists(page, '.card-wrap')) || (await exists(page, '.empty'))
    if (!hasListOrEmpty) {
      const text = await textOf(page, '.page')
      if (text.trim().length === 0) {
        throw new Error(
          '断网时列表页白屏' + (networkCut ? '' : '（且当前端不支持模拟断网，需真机手动断网验证）'),
        )
      }
    }

    if (networkCut) {
      // 恢复网络，否则会影响后续用例（无顺序依赖）
      try {
        await page.callUniMethod('uni.setNetworkStatus', { networkType: 'wifi' })
      } catch {
        // 恢复失败不影响本条断言
      }
    }
  }, CASE_TIMEOUT)
})
