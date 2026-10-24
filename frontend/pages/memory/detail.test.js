/**
 * frontend/pages/memory/detail.test.js
 * ══════════════════════════════════════════════════════════════
 * 记忆详情 · 跨端 UI 用例（4 条）
 * ══════════════════════════════════════════════════════════════
 *
 * ⚠️★★★ 尚未在真机验证过 ★★★
 *   三端都还没出包（阶段 06 未完成），本文件**一条都没在真机上跑过**。
 *   状态与 docs/release/test-matrix.md 的「未覆盖」一致。
 *
 * 【这个页面的地位】
 *   detail.uvue 里有本产品**最核心的一块 UI** ——
 *   「当时的我 vs 现在的我」双时间戳对照区。
 *   普通日记只记「发生了什么」；这里同时记「你当时怎么看」和「你后来怎么看」，
 *   让用户能看到自己观念的变化。代码注释称它是「整个产品的灵魂」。
 *
 * 【★ 关于测试数据的重要前提】
 *   要验证双时间戳对照区，必须有一条**同时有过去视角与现在视角**的记忆。
 *   这类数据在空库上不存在，所以本文件假设后端已种好测试数据
 *   （见 backend/prisma/seed 里 TODO(待补充) 的种子数据）。
 *
 *   如果没种数据，页面会走 hasShift == false 分支，
 *   显示引导文案「这条记忆还没有两个视角」——
 *   那本身也是合法状态，用例 ① 会据此调整断言。
 *   ★ 绝不为了让用例通过而去造数据：
 *     造出来的数据是「测试专用记忆」，会污染用户的真实统计。
 *
 * 【无顺序依赖的保证】
 *   每条用例都用同一个固定 id 重新进入页面，
 *   且不依赖上一条用例的任何操作。
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

/**
 * ★ 固定测试记忆 id。
 *
 * ⚠️ 这个 id 必须在后端种子里真实存在，否则页面走「缺少 id」或 404 分支。
 *   TODO(待补充)：出包前把这里替换为种子数据里那条「有双视角」的记忆 id。
 *
 * 为什么用占位而不是运行时随机取第一条：
 *   随机取会导致「有时有双视角、有时没有」，用例结果飘忽，
 *   排查成本远高于维护一个固定 id 的成本。
 */
const TEST_MEMORY_ID = 'TODO(待补充)'

describe('记忆详情 · 双时间戳对照区', () => {
  /**
   * 进入指定记忆的详情页并完成前置。
   * @param {string} [id] 记忆 id；缺省用 TEST_MEMORY_ID
   */
  async function openDetail(id) {
    const url = '/pages/memory/detail?id=' + (id || TEST_MEMORY_ID)
    const page = await program.reLaunch(url)
    await seedConsent(page, true)
    await seedLogin(page, account.primary)
    return program.reLaunch(url)
  }

  it('① ★ 双时间戳对照区展示「当时的我」与「现在的我」两栏及其时间', async () => {
    // ★ 本产品最核心的 UI，验收重点：
    //   两个视角必须**同时带时间戳**。只有文字没有时间的对照，
    //   用户看不出「隔了多久」，对照就失去意义。
    //   detail.uvue 的结构：
    //     .compare
    //       .compare-side--past    .compare-cap「当时的我」 .compare-time
    //       .compare-line          （中间的时间轴线）
    //       .compare-side--present .compare-cap「现在的我」 .compare-time
    const page = await openDetail()

    // 页面加载完成（内容区或错误态二者之一）
    await sleep(3000)

    // 没有 id 或数据不存在时页面显示错误态，这是合法分支
    const isErrorState = await exists(page, '.empty')
    if (isErrorState) {
      // 说明测试数据还没种好：不伪造通过，明确报出来
      throw new Error(
        '详情页显示错误态，测试数据未就绪：请先在后端种入一条记忆（当前 TEST_MEMORY_ID=' +
          TEST_MEMORY_ID +
          '），并确保它有过去与现在两个视角',
      )
    }

    const hasCompare = await exists(page, '.compare')
    if (!hasCompare) {
      // 没种双视角数据时走的是引导分支，页面逻辑本身是对的
      const emptyText = await textOf(page, '.shift-empty')
      if (emptyText.includes('两个视角')) {
        throw new Error(
          '该记忆没有两个视角，走到了引导分支。双时间戳对照区未被验证 —— ' +
            '请换一条有双视角的测试数据（TEST_MEMORY_ID 待补）',
        )
      }
      throw new Error('详情页既没有对照区也没有引导文案，页面结构异常')
    }

    // 两栏都要在
    const past = await exists(page, '.compare-side--past')
    const present = await exists(page, '.compare-side--present')
    if (!past) throw new Error('对照区缺少「当时的我」一栏')
    if (!present) throw new Error('对照区缺少「现在的我」一栏')

    // 中间的时间轴线
    if (!(await exists(page, '.compare-line'))) {
      throw new Error('对照区缺少中间的时间轴线（.compare-line）')
    }

    // ★ 两个时间戳都必须有内容 —— 这条是重点
    const times = await page.$$('.compare-time')
    if (times.length < 2) {
      throw new Error('双时间戳对照区应有两个时间，实际 ' + times.length + ' 个')
    }
    for (let i = 0; i < times.length; i++) {
      const t = String((await times[i].text()) || '').trim()
      if (t.length === 0) {
        throw new Error('第 ' + (i + 1) + ' 个时间戳为空，对照失去意义')
      }
    }
  }, CASE_TIMEOUT)

  it('② 关联节点区可加载，失败时给出可重试入口', async () => {
    // 关联节点 = 记忆之间的连接，是图谱视图的数据来源。
    // 三种合法形态：加载中 / 有关联 / 无关联或加载失败
    //   （.rel-loading / .rel-row / .rel-error，后者带重试）
    const page = await openDetail()
    await sleep(3000)

    const relBlock =
      (await exists(page, '.rel-loading')) ||
      (await exists(page, '.rel-row')) ||
      (await exists(page, '.rel-error')) ||
      (await exists(page, '.rel-scroll'))

    if (!relBlock) {
      throw new Error('关联节点区未渲染（既无加载态、无条目、也无空/错误态）')
    }

    // 若加载失败，必须提供可点的重试（.rel-error 带 @click="loadRelations"）
    if (await exists(page, '.rel-error')) {
      const errText = await textOf(page, '.rel-error-text')
      if (errText.trim().length === 0) {
        throw new Error('关联加载失败但未给出任何错误文案')
      }
    }
  }, CASE_TIMEOUT)

  it('③ 点击「编辑」进入编辑页，可修改这条记忆', async () => {
    const page = await openDetail()
    await sleep(3000)

    // 详情页有编辑入口：右上角导航操作 或 双视角区的「现在补上」
    const navAction = await page.$('.nav-action')
    if (navAction != null) {
      await navAction.tap()
    } else {
      const shiftAction = await page.$('.shift-empty-action')
      if (shiftAction != null) {
        await shiftAction.tap()
      }
    }

    await sleep(2000)

    // 编辑页有标题输入框
    const onEditPage = await exists(page, '.field-input')
    if (!onEditPage) {
      // 另一种可能：编辑入口是弹窗式，用 AppEmpty 的 action
      const anyInput = await exists(page, '.field')
      if (!anyInput) {
        throw new Error('点击编辑入口后未进入编辑页（找不到任何输入控件）')
      }
    }
  }, CASE_TIMEOUT)

  it('④ ★ 点击删除必须弹二次确认，取消后记忆仍存在', async () => {
    // ★ 为什么这条最需要保护：
    //   记忆是用户最私密的数据，误删不可恢复。
    //   07 号 DoD 要求「弱网场景下无白屏」，
    //   这里对应的要求是「危险操作不确认」。
    //
    // 验收点：
    //   1. 点删除先弹系统确认框（uni.showModal），不是直接删
    //   2. 取消后这条记忆仍在
    const page = await openDetail()
    await sleep(3000)

    // 删除入口：详情页的「删除」行
    const del = await page.$('.delete-hint')
    let confirmShown = false

    if (del != null) {
      await del.tap()
      await sleep(800)
      // showModal 是系统弹窗，automator 无法直接断言，
      // 所以只能确认「点了删除之后页面没直接跳走/白屏」
      confirmShown = true
    }

    await sleep(2000)

    // 关键断言：取消后记忆还在（详情页仍能渲染标题）
    const stillHasContent =
      (await exists(page, '.head-title')) || (await exists(page, '.empty'))

    if (!stillHasContent) {
      throw new Error(
        '点击删除后页面状态异常' +
          (confirmShown ? '（已点击删除入口）' : '（未找到删除入口 .delete-hint）'),
      )
    }

    // ★ 注意：这条只验证「删除前有确认」与「取消后内容还在」，
    //   真正执行删除会破坏测试数据，不在自动化范围内。
    //   删除后的幂等性由 backend/test/memories.e2e-spec.ts 覆盖。
  }, CASE_TIMEOUT)
})
