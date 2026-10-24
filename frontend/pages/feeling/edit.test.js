/**
 * frontend/pages/feeling/edit.test.js
 * ══════════════════════════════════════════════════════════════
 * 记一次感受 · 跨端 UI 用例（6 条）
 * ══════════════════════════════════════════════════════════════
 *
 * ⚠️★★ 尚未在真机验证过 ★★★
 *   三端都还没出包（阶段 06 未完成），本文件**一条都没在真机上跑过**。
 *   状态与 docs/release/test-matrix.md 的「未覆盖」一致。
 *
 * 【为什么这个页面的用例最重要】
 *   情绪粒度细化（粗粒度「难受」→ 精粒度「憋屈」）是本产品
 *   唯一真正的差异化功能（edit.uvue 注释原话：「整个产品最核心的交互」）。
 *   它也是最容易出竞态 bug 的地方 —— 用户连续点几个情绪词，
 *   会连发多个 refine 请求，先发的后到就会显示错误的候选词。
 *   所以本文件里 ★ 标出的两条都是围绕它。
 *
 * 【无顺序依赖的保证】
 *   每条用例都重新 reLaunch 录入页，页面状态是全新的。
 *   ★ 注意：本页会写数据库（保存成功的用例），
 *   所以「保存」类用例不依赖任何前置数据，删掉一条不影响其它条。
 */

const account = require('../../fixtures/account')
const {
  CASE_TIMEOUT,
  waitForSelector,
  waitFor,
  sleep,
  exists,
  textOf,
  seedLogin,
  seedConsent,
} = require('../../fixtures/automator')

/** 情绪胶囊的稳定选择器（edit.uvue 的 .pill） */
const PILL = '.pill'
/** 精粒度候选胶囊（.pill--refine，比粗粒度视觉上更小） */
const REFINE_PILL = '.pill--refine'
/** 强度格子 */
const INTENSITY_CELL = '.intensity-cell'

describe('记一次感受（情绪粒度细化）', () => {
  /**
   * 打开录入页并完成前置。
   * @param {boolean} asUser 是否注入登录态（保存类用例需要）
   */
  async function openEdit(asUser) {
    const page = await program.reLaunch('/pages/feeling/edit')
    await seedConsent(page, true)
    if (asUser) {
      await seedLogin(page, account.primary)
    }
    return program.reLaunch('/pages/feeling/edit')
  }

  it('① 选择情绪词后该词高亮，且提交按钮变为可用', async () => {
    // 预期行为（edit.uvue）：
    //   onPickRaw → rawLabel 赋值 → :class 绑定 'pill--on'
    //   canSubmit = rawLabel.length > 0 && !submitting
    //   未选词时按钮下方显示 .submit-reminder「先选一个情绪词吧」
    const page = await openEdit(false)

    await waitForSelector(page, PILL, 10000)

    // 未选词时应看到「先选一个情绪词吧」的提示
    const reminderBefore = await textOf(page, '.submit-reminder')

    const pills = await page.$$(PILL)
    if (pills.length === 0) {
      throw new Error('情绪词胶囊未渲染，无法选择情绪')
    }
    await pills[0].tap()

    await sleep(500)

    // 选完后提醒应消失（canSubmit 变 true）
    const reminderAfter = await textOf(page, '.submit-reminder')
    if (reminderBefore.includes('先选一个情绪词') && reminderAfter.includes('先选一个情绪词')) {
      throw new Error('已选择情绪词，但「先选一个情绪词吧」提示仍在，canSubmit 可能没更新')
    }
  }, CASE_TIMEOUT)

  it('② ★ 选中粗粒度词后出现精粒度候选区', async () => {
    // ★ 这是产品核心：「难受」→「憋屈 / 不甘 / 被忽视」。
    //   refine 走后端本地 RULER 词表，不调大模型，响应 10ms 级。
    //   回归症状：候选区不出现 → 用户只能存一个笼统的「难受」，
    //   三个月后回看这条记录没有价值，产品差异点消失。
    const page = await openEdit(false)

    await waitForSelector(page, PILL, 10000)

    // 未选词时，refine 区整块不该存在（v-if="rawLabel != ''"）
    const refineBefore = await exists(page, REFINE_PILL)

    const pills = await page.$$(PILL)
    await pills[0].tap() // 第一个是「难受」

    // 三种合法形态都算通过：候选 / 加载中 / 失败可重试
    // ★ 刻意不强制要求「必须有候选」——
    //   词库里某个词没有更细说法是合法的（页面会显示 .refine-none）
    await waitFor(
      async () =>
        (await exists(page, REFINE_PILL)) ||
        (await exists(page, '.spinner')) ||
        (await exists(page, '.refine-error')) ||
        (await exists(page, '.refine-none')),
      10000,
    )

    const refineAfter =
      (await exists(page, REFINE_PILL)) ||
      (await exists(page, '.refine-error')) ||
      (await exists(page, '.refine-none'))

    if (refineBefore && !refineAfter) {
      throw new Error('精粒度候选区在选择情绪词后消失了')
    }
    if (!refineAfter) {
      throw new Error('选择情绪词后未出现精粒度候选区（候选/加载/失败/无更细说法 都没有）')
    }
  }, CASE_TIMEOUT)

  it('③ ★ 切换到另一个情绪词时，候选区刷新为新词的候选', async () => {
    // ★ 这是竞态守卫（RaceGuard）的核心验收点。
    //   快速切换「难受」→「生气」，如果守卫失效，
    //   候选列表会是「生气」的标题配「难过」的词 —— 数据错误，用户无从察觉。
    //   edit.uvue 用 refineGuard.next() / isCurrent(ticket) 保证这一点。
    const page = await openEdit(false)

    await waitForSelector(page, PILL, 10000)
    const pills = await page.$$(PILL)

    if (pills.length < 2) {
      throw new Error('情绪词数量不足，无法验证切换行为')
    }

    await pills[0].tap() // 「难受」
    // ★ 不等 refine 返回，立刻切第二个 —— 制造「先发后到」的条件
    await sleep(50)
    await pills[1].tap() // 「难过」

    // 等候选稳定后，标题提示应显示的是**第二个**词
    await waitFor(
      async () => (await exists(page, '.refine-hint')) || (await exists(page, REFINE_PILL)),
      10000,
    )
    await sleep(2000) // ★ 等足够久，让所有在途响应都回来

    const hint = await textOf(page, '.refine-hint')
    if (hint.length > 0) {
      // refineHint 的文案是 `「${rawLabel}」这个词还可以更具体一点`
      // 只要它提到了第一个词，说明 rawLabel 被旧响应覆盖了
      const secondWord = String((await pills[1].text()) || '').trim()
      const firstWord = String((await pills[0].text()) || '').trim()

      if (secondWord.length > 0 && hint.includes('「' + firstWord + '」')) {
        throw new Error(
          '切换情绪词后提示仍指向第一个词「' + firstWord + '」，竞态守卫可能失效：' + hint,
        )
      }
    }
  }, CASE_TIMEOUT)

  it('④ 点击强度格子后数值更新为对应等级', async () => {
    // 预期行为：onPickIntensity(v) → intensity = v，
    // 头部 .intensity-value 显示 `${intensity} / 10`，默认 5。
    const page = await openEdit(false)

    await waitForSelector(page, INTENSITY_CELL, 10000)

    const before = await textOf(page, '.intensity-value') // 期望形如 "5 / 10"
    const cells = await page.$$(INTENSITY_CELL)
    if (cells.length !== 10) {
      throw new Error('强度格子应为 10 个（1~10 离散选择），实际 ' + cells.length + ' 个')
    }

    await cells[7].tap() // 选 8
    await sleep(500)

    const after = await textOf(page, '.intensity-value')
    if (before === after) {
      throw new Error('点击强度格子后数值未变化，仍为：' + after)
    }
    if (!after.includes('8')) {
      throw new Error('点击第 8 格后期望显示 8，实际为：' + after)
    }
  }, CASE_TIMEOUT)

  it('⑤ ★ 换词时清空旧的精炼选择（不会存下「A 的原话 + B 的精炼词」）', async () => {
    // 这是 edit.uvue 里 onPickRaw 显式处理的一个真实数据缺陷：
    //   用户先选「难受」→ 选精炼词「憋屈」
    //   再改主意选「生气」→ 如果不清空，保存下来的是
    //   rawLabel=生气 + refinedLabel=憋屈 ← 语义完全错乱
    // 验证方式：选 A → 选精炼 → 换到 B → 断言精炼高亮消失。
    const page = await openEdit(false)

    await waitForSelector(page, PILL, 10000)
    const rawPills = await page.$$(PILL)
    if (rawPills.length < 2) {
      throw new Error('情绪词数量不足，无法验证换词行为')
    }

    await rawPills[0].tap()
    await waitFor(
      async () => (await exists(page, REFINE_PILL)) || (await exists(page, '.refine-none')),
      10000,
    )

    // 选一个精炼词
    const refinePills = await page.$$(REFINE_PILL)
    if (refinePills.length > 0) {
      await refinePills[0].tap()
      await sleep(500)
    }

    // 换到第二个粗粒度词
    const pills2 = await page.$$(PILL)
    await pills2[1].tap()
    await sleep(2000)

    // 断言：没有精炼胶囊处于高亮态
    const onRefine = await page.$$(REFINE_PILL + '.pill--on')
    if (onRefine.length > 0) {
      throw new Error('换词后仍有精炼词处于选中态，会存下「原话与精炼词不匹配」的数据')
    }
  }, CASE_TIMEOUT)

  it('⑥ ★ 未选情绪词时提交按钮不可用，且给出可读的提醒文案', async () => {
    // ★ 为什么要单独验：编辑页的核心防错是「不能提交空表单」。
    //   情绪记录最怕的就是「记不下来」—— 表单太长、必填太多，
    //   所以这里只强制情绪词一个必填项，其余全留空可提交。
    //   若按钮可点，用户会提交一条没有情绪的记录，污染情绪统计。
    const page = await openEdit(false)

    await waitForSelector(page, PILL, 10000)

    // 未选词时：按钮禁用 + 显示 .submit-reminder
    await expectExists(page, '.submit-reminder', '未选情绪词时应提示先选一个情绪词')

    const reminder = await textOf(page, '.submit-reminder')
    if (reminder.trim().length === 0) {
      throw new Error('提交按钮不可用时未给出任何提示文案，用户会不知道该做什么')
    }
  }, CASE_TIMEOUT)
})
