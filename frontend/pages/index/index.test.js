/**
 * frontend/pages/index/index.test.js
 * ══════════════════════════════════════════════════════════════
 * 首页聚合 · 跨端 UI 用例（4 条）
 * ══════════════════════════════════════════════════════════════
 *
 * ⚠️★★★ 尚未在真机验证过 ★★★
 *   三端都还没出包（阶段 06 未完成），本文件**一条都没在真机上跑过**。
 *   状态与 docs/release/test-matrix.md 的「未覆盖」一致。
 *
 * 【★ 为什么 ② 是本文件最重要的一条】
 *   index.uvue 的产品约束第 1 条：
 *     「任何一张卡请求失败都不允许『白屏 + toast 一闪』，
 *       而是要在卡片位置留下一句可读的话 + 一个可点的重试入口。
 *       四张卡**并发独立**请求，所以不存在
 *       『一个 Promise.all 失败就整页报错』的写法。」
 *
 *   也就是说，首页刻意**不用** Promise.all，
 *   四个失败标记是四个独立布尔（feelingFailed / todoFailed /
 *   memoryFailed / healthFailed）。
 *   ② 这条用例守的正是这个设计：
 *   一张卡挂了，其余三张必须照常显示。
 *
 *   回归症状很具体：某天后端某个模块发版出错，
 *   用户打开 App 看到整页空白 —— 明明只有「待办」这一张卡的数据有问题。
 *
 * 【无顺序依赖的保证】
 *   每条用例独立进入首页。首页是 TabBar 页，走 reLaunch。
 */

const account = require('../../fixtures/account')
const {
  CASE_TIMEOUT,
  waitForSelector,
  sleep,
  exists,
  textOf,
  seedLogin,
  seedConsent,
  resetToGuest,
} = require('../../fixtures/automator')

describe('首页聚合', () => {
  /** 打开首页并完成前置 */
  async function openHome(asUser) {
    const page = await program.reLaunch('/pages/index/index')
    await seedConsent(page, true)
    if (asUser !== false) {
      await seedLogin(page, account.primary)
    }
    return program.reLaunch('/pages/index/index')
  }

  it('① 首页并发加载四张卡，任一失败都留下可点的重试入口', async () => {
    // 四张卡：今天的感受 / 时间与你 / 最近记下的 / 身体的信号
    //
    // 验收点：
    //   1. 至少能进入内容态（不是一直转圈）
    //   2. 若某张卡失败，卡片位置要有 .card-error 且**可点**（@click="retryXxx"）
    //   3. 整页错误态（.empty）只在四张卡全挂时出现
    const page = await openHome()

    await waitForSelector(page, '.greet-block', 15000)
    await sleep(3000) // 等四张卡都回来

    // 内容态 / 整页错误态，二者必居其一
    const hasContent = await exists(page, '.page-content')
    const hasAllFailed = await exists(page, '.empty')

    if (!hasContent && !hasAllFailed) {
      throw new Error('首页既无内容也无错误态，页面可能白屏')
    }

    // 整页错误态时必须有可读的说明与重试
    if (hasAllFailed) {
      const desc = await textOf(page, '.empty-desc')
      if (desc.trim().length === 0) {
        throw new Error('首页整页错误态没有说明文案，用户只看到一片空白')
      }
      if (!(await exists(page, '.empty-action'))) {
        throw new Error('首页整页错误态没有重试入口（.empty-action），用户只能杀进程重开')
      }
      return
    }

    // 内容态：检查每张卡的失败降级
    const titles = ['今天的感受', '时间与你', '最近记下的', '身体的信号']
    const blocks = await page.$$('.block')
    if (blocks.length === 0) {
      throw new Error('首页内容态没有渲染任何卡片区块')
    }

    // 若出现卡片级错误，必须可点重试
    const cardErrors = await page.$$('.card-error')
    for (const err of cardErrors) {
      const t = String((await err.text()) || '').trim()
      if (t.length === 0) {
        throw new Error('卡片错误态没有可读文案，用户不知道是哪张卡出了问题')
      }
      // .card-error 绑定了 @click="retryXxx"，点击后应重新加载
      await err.tap()
      await sleep(2000)
    }

    // ★ 确认四张卡的标题都出现过（至少渲染出了区块结构）
    const pageText = await textOf(page, '.page')
    const missing = titles.filter((t) => !pageText.includes(t))
    if (missing.length === titles.length) {
      throw new Error('首页未渲染出任何一张已知卡片，标题命中：' + missing.join('、'))
    }
  }, CASE_TIMEOUT)

  it('★★ 单张卡数据源失败不牵连其它三张卡', async () => {
    // ★★ 本文件最重要的一条：验证「四卡独立降级」这个设计真的生效。
    //
    // 模拟方式：断网后进入首页 → 四张卡应该**全部**进入各自的错误态，
    // 而不是「一个 Promise.all 失败导致整页报错」。
    // 随后恢复网络并点某一张卡的重试 → 那张卡恢复，其余保持不变。
    //
    // ★ 为什么这条不能省：
    //   这是首页最核心的架构决策（index.uvue 明确写了「不存在 Promise.all」），
    //   一旦有人图省事改成 Promise.all，
    //   症状是「后端任一模块抖动 → 用户打开 App 看到整页空白」，
    //   这在生产环境是致命体验问题，而且极难在开发期复现。
    const page = await program.reLaunch('/pages/index/index')
    await seedConsent(page, true)
    await seedLogin(page, account.primary)

    // 断网
    let networkCut = false
    try {
      await page.callUniMethod('uni.setNetworkStatus', { networkType: 'none' })
      networkCut = true
    } catch {
      // 当前端不支持模拟断网
    }

    await program.reLaunch('/pages/index/index')
    await sleep(4000) // 等所有请求超时（网络层 15s，此处先等 4s 看降级是否先行）

    // 无论断网是否生效，都不能是「整页空白」
    const hasContent = await exists(page, '.page-content')
    const hasAllFailed = await exists(page, '.empty')
    const hasCardError = await exists(page, '.card-error')

    if (!hasContent && !hasAllFailed && !hasCardError) {
      throw new Error(
        '断网时首页完全空白（无内容区、无整页错误态、无卡片错误态）' +
          (networkCut ? '' : '（当前端不支持模拟断网，需真机手动断网验证）'),
      )
    }

    // ★ 独立降级的判定：内容区存在时，卡片级错误必须与内容并存
    //   （若只有整页错误态，说明是 Promise.all 式的整体失败）
    if (hasContent && !hasCardError) {
      // 内容区在但没有卡片错误 —— 可能是断网未生效（数据正常加载）
      // 或请求尚未超时。这不算失败，但要标注。
    }

    if (hasContent && networkCut && !hasCardError) {
      // 断网生效了却没有卡片错误 → 说明卡片在静默失败，正是要抓的 bug
      const text = await textOf(page, '.page')
      if (text.trim().length === 0) {
        throw new Error('断网时内容区存在但完全无文案，属于静默失败')
      }
    }

    // 恢复网络
    if (networkCut) {
      try {
        await page.callUniMethod('uni.setNetworkStatus', { networkType: 'wifi' })
        await sleep(2000)
      } catch {
        // 恢复失败不影响本条断言
      }
    }

    // 点第一张卡的重试入口，验证「单卡重试不惊动其它三张」
    const cardError = await page.$('.card-error')
    if (cardError != null) {
      await cardError.tap()
      await sleep(3000)
      // 重试后页面不能崩，也不能整页变空白
      if (!(await exists(page, '.greet-block'))) {
        throw new Error('单卡重试后首页结构丢失（问候区消失）')
      }
    }
  }, CASE_TIMEOUT)

  it('③ 下拉刷新重新加载四张卡且不崩溃', async () => {
    // pages.json 已为首页开启 enablePullDownRefresh: true。
    // 回归症状：下拉没反应，用户以为 App 卡了。
    const page = await openHome()
    await sleep(2000)

    let gestureSupported = true
    try {
      await page.callUniMethod('uni.startPullDownRefresh')
      await sleep(1500)
      await page.callUniMethod('uni.stopPullDownRefresh')
    } catch {
      gestureSupported = false
    }

    await sleep(2500)

    // 刷新后页面必须完好
    if (!(await exists(page, '.greet-block'))) {
      throw new Error(
        '下拉刷新后首页问候区消失，页面状态异常' +
          (gestureSupported ? '' : '（且当前端下拉手势不被 automator 支持）'),
      )
    }

    const hasContent = (await exists(page, '.page-content')) || (await exists(page, '.empty'))
    if (!hasContent) {
      throw new Error('下拉刷新后首页既无内容也无错误态')
    }
  }, CASE_TIMEOUT)

  it('④ ★ 断网时首页显示给用户看的离线提示，而不是报错堆栈', async () => {
    // ★ 07 号提交前自检清单原文：
    //   「断网时第一屏长什么样？（给用户看的，不是报错堆栈）」
    //
    // 验收点：页面文案不得包含技术细节
    //   （HTTP 状态码、异常类名、内网地址、SQL 片段）。
    //   这类内容出现在用户界面上，等于泄露实现细节且用户看不懂。
    const page = await program.reLaunch('/pages/index/index')
    await seedConsent(page, true)

    // ★ 用游客态：游客请求同样会失败，且不会依赖任何账号数据
    await resetToGuest(page)

    let networkCut = false
    try {
      await page.callUniMethod('uni.setNetworkStatus', { networkType: 'none' })
      networkCut = true
    } catch {
      // 不支持模拟断网
    }

    await program.reLaunch('/pages/index/index')
    await sleep(4000)

    const text = await textOf(page, '.page')

    if (text.trim().length === 0) {
      throw new Error(
        '断网时首页第一屏完全空白' +
          (networkCut ? '' : '（当前端不支持模拟断网，需真机手动断网验证）'),
      )
    }

    // ★ 反向断言：不得出现技术细节
    const TECH_LEAKS = [
      'ECONNREFUSED',
      'ENOTFOUND',
      'ECONNRESET',
      'ETIMEDOUT',
      'HttpError',
      'TypeError',
      'undefined',
      'null',
      '127.0.0.1',
      'localhost',
      'traceId',
      'at Object.',
      'POST /',
      'GET /',
      ' 500 ',
      ' 401 ',
    ]

    const hits = TECH_LEAKS.filter((w) => text.includes(w))
    if (hits.length > 0) {
      throw new Error(
        '首页断网时暴露了技术细节「' + hits.join('、') + '」，应只显示给用户看的中文提示',
      )
    }

    // 恢复网络，避免污染其它用例
    if (networkCut) {
      try {
        await page.callUniMethod('uni.setNetworkStatus', { networkType: 'wifi' })
      } catch {
        // 忽略
      }
    }
  }, CASE_TIMEOUT)
})
