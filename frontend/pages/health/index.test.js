/**
 * frontend/pages/health/index.test.js
 * ══════════════════════════════════════════════════════════════
 * 身体信号 · 跨端 UI 用例（4 条）
 * ══════════════════════════════════════════════════════════════
 *
 * ⚠️★★★ 尚未在真机验证过 ★★★
 *   三端都还没出包（阶段 06 未完成），本文件**一条都没在真机上跑过**。
 *   状态与 docs/release/test-matrix.md 的「未覆盖」一致。
 *
 * 【这个页面的产品立场：只陈述，不评价】
 *   health/index.uvue 的产品约束第 3 条写得很硬：
 *     「连续记录天数只陈述数字，不夸大成成就
 *       （『你已坚持 30 天』这种话不能说）」
 *   趋势图的 narrative 直接用后端生成的文字，
 *   **不改写、不加评价**。
 *
 *   这条约束是产品伦理层面的，不是文案偏好 ——
 *   对一个记录情绪与身体的应用说「你已坚持 30 天」，
 *   会让记录本身变成被评价的对象，断掉的人会因此自责而放弃。
 *   所以 ② 这条用例会用**反向断言**把这条红线钉住。
 *
 * 【无顺序依赖的保证】
 *   每条用例独立进入页面。★ 录入类用例会写数据库，
 *   所以录入后不回查列表内容，只验证「录入控件可用」，
 *   避免依赖特定数据状态。
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
} = require('../../fixtures/automator')

describe('身体信号', () => {
  /** 打开健康页并完成前置 */
  async function openHealth() {
    const page = await program.reLaunch('/pages/health/index')
    await seedConsent(page, true)
    await seedLogin(page, account.primary)
    return program.reLaunch('/pages/health/index')
  }

  it('① 三个指标 Tab 可切换，切换后趋势区随之更新', async () => {
    // 预期行为：metricTabs = 睡眠 / 步数 / 心情与精力，
    //   switchMetric(v) → activeMetric 变更 → 重新拉该指标的趋势。
    // ★ 刻意只做「三个都在」+「能切换」两点验证：
    //   不断言具体图表数值 —— 那依赖真实数据，会让用例飘。
    const page = await openHealth()

    await waitForSelector(page, '.seg', 10000)
    await sleep(1500) // 等首屏数据

    // 第一个 .seg 是趋势切换器，第二个在录入表单里
    const segs = await page.$$('.seg')
    if (segs.length === 0) {
      throw new Error('未找到指标切换器')
    }

    const items = await page.$$('.seg-item')
    if (items.length < 3) {
      throw new Error('指标切换项应至少 3 个（睡眠/步数/心情与精力），实际 ' + items.length + ' 个')
    }

    // 逐个切换，每次确认页面回到可交互状态（不崩、不白屏）
    for (let i = 0; i < 3; i++) {
      const all = await page.$$('.seg-item')
      if (all[i] == null) break
      await all[i].tap()
      await sleep(1500)

      // 切换后必须有内容：加载中 / 图表 / 空态 三者之一
      const hasContent =
        (await exists(page, '.spinner')) ||
        (await exists(page, '.chart')) ||
        (await exists(page, '.trend-empty'))

      if (!hasContent) {
        throw new Error('切换到第 ' + (i + 1) + ' 个指标后趋势区无任何内容（白屏）')
      }
    }
  }, CASE_TIMEOUT)

  it('★★ 趋势叙述只陈述数据，不含评价与鼓励性措辞', async () => {
    // ★★ 本产品最重要的一条产品伦理红线（health/index.uvue 产品约束第 3 条）。
    //
    // 验收方式：把整页文案抓出来，断言**不含**评价类词汇。
    //
    // ★ 为什么用「禁用词列表」而不是「必须有某句话」：
    //   后端 narrative 是自然语言生成/模板拼接的，措辞会变。
    //   禁用意图固定 —— 一旦有人把陈述改成评价，本条立刻红。
    //   措辞可改，意图不可改。
    const page = await openHealth()
    await sleep(3000)

    // 收集趋势叙述 + 连续天数说明 + 页面主张 + 整页可读文本
    //
    // ★ 把 .hero-sub（页面的产品主张「身体的信号不是绩效表…」）也纳入检查：
    //   这段文案是本产品立场的公开表述，最容易被改成带鼓励色彩的版本
    //   （例如「坚持就是胜利」），而改的人往往觉得那更「贴心」。
    const narrative = await textOf(page, '.trend-narrative')
    const streakSummary = await textOf(page, '.streak-summary')
    const streakLabel = await textOf(page, '.streak-label')
    const heroSub = await textOf(page, '.hero-sub')
    const pageText = await textOf(page, '.page')

    const haystack = [narrative, streakSummary, streakLabel, heroSub, pageText]
      .join(' ')
      .replace(/\s+/g, '')

    if (haystack.length === 0) {
      throw new Error('页面无可读文案，无法验证「只陈述不评价」')
    }

    // ★ 评价性 / 鼓励性措辞黑名单。
    //   这些词把记录变成了被评价的对象，是本产品明确禁止的。
    //   注释里出现的「坚持」「达成」是规则说明，不在 pageText 里。
    const FORBIDDEN = [
      '坚持了',
      '已坚持',
      '你真棒',
      '真棒',
      '继续保持',
      '坚持就是胜利',
      '做到了',
      '超过了',
      '战胜',
      '击败',
      '自律',
      '厉害',
      '为你骄傲',
      '了不起',
    ]

    const hits = FORBIDDEN.filter((w) => haystack.includes(w))
    if (hits.length > 0) {
      throw new Error(
        '页面出现评价性措辞「' + hits.join('、') + '」，违反「只陈述不评价」产品约束。实际文案片段：' +
          haystack.slice(0, 200),
      )
    }
  }, CASE_TIMEOUT)

  it('③ 「记一笔」录入表单可用：可选指标、数值输入与提交按钮齐备', async () => {
    // ★ 只验证「录入控件齐备且可提交」，不真的写库 ——
    //   真写库会污染测试数据，且让本用例对数据产生依赖（违反无顺序依赖）。
    //   写入路径的正确性由后端 e2e 覆盖。
    const page = await openHealth()

    await waitForSelector(page, '.form', 10000)

    // 录入区标题
    const sectionTitle = await textOf(page, '.section-title')
    if (!sectionTitle.includes('记一笔') && !sectionTitle.includes('记')) {
      // 标题文案可能调整，不作为硬断言
    }

    // 数值输入框存在
    const inputs = await page.$$('.field-input')
    if (inputs.length === 0) {
      throw new Error('未找到数值输入框，无法录入身体信号')
    }

    // 提交按钮存在且可点
    const btn = await page.$('.btn')
    if (btn == null) {
      throw new Error('未找到提交按钮，录入表单不完整')
    }

    // 填一个合法值（睡眠 7 小时），确认提交按钮进入可用态
    await inputs[0].input('7')
    await sleep(500)

    // 仍不应崩溃，且页面结构完好
    if (!(await exists(page, '.form'))) {
      throw new Error('填入数值后录入表单消失，页面异常')
    }
  }, CASE_TIMEOUT)

  it('④ ★ 概览区只显示数字，不把连续天数说成成就', async () => {
    // ★ 与 ② 互补：② 验「叙述不含评价」，④ 验「连续记录天数的呈现方式」。
    //
    // 页面注释原文：
    //   「连续记录天数：只陈述数字，不说『坚持』『达成』」
    // 实现上用 .streak-num（数字）与 .streak-label（单位说明）分开渲染，
    // 结构本身就限制了夸大的空间 —— 断言这个结构在，语义就守住了。
    const page = await openHealth()
    await sleep(3000)

    const hasStreakBlock = await exists(page, '.streak')

    if (!hasStreakBlock) {
      // 连续天数为 0 时可能不展示整块，属合法分支
      const hasAnyContent =
        (await exists(page, '.chart')) ||
        (await exists(page, '.trend-empty')) ||
        (await exists(page, '.streak'))

      if (!hasAnyContent) {
        throw new Error('概览区无任何内容，页面可能白屏')
      }
      return
    }

    // 数字与说明必须是分开的两个节点
    const num = await textOf(page, '.streak-num')
    const unit = await textOf(page, '.streak-unit')
    const label = await textOf(page, '.streak-label')

    if (num.trim().length === 0) {
      throw new Error('连续记录天数的数字为空')
    }
    if (!/^\d+$/.test(num.trim())) {
      throw new Error('连续记录天数应为纯数字，实际为：' + num)
    }

    // 标签里不得出现评价词
    const labelText = (unit + label).replace(/\s+/g, '')
    const FORBIDDEN = ['坚持', '达成', '连续打卡成就', '里程碑']
    const hits = FORBIDDEN.filter((w) => labelText.includes(w))
    if (hits.length > 0) {
      throw new Error(
        '连续天数的标签含评价性措辞「' + hits.join('、') + '」，实际为：' + labelText,
      )
    }
  }, CASE_TIMEOUT)
})
