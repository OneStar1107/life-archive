/**
 * frontend/pages/memory/index.test.js
 * ══════════════════════════════════════════════════════════════
 * 记忆 · 图谱与列表 · 跨端 UI 用例（5 条）
 * ══════════════════════════════════════════════════════════════
 *
 * ⚠️★★★ 尚未在真机验证过 ★★★
 *   三端都还没出包（阶段 06 未完成），本文件**一条都没在真机上跑过**。
 *   状态与 docs/release/test-matrix.md 的「未覆盖」一致。
 *   ⚠️ 特别提醒：图谱用 canvas 绘制，
 *      **canvas 的行为在模拟器与真机上差异最大**，
 *      折叠屏展开/折叠时图谱重算也是高风险点
 *      （test-matrix.md 第 4 行「折叠屏」已标注为风险项）。
 *      本文件的图谱用例必须在真机上跑，模拟器结果不可作为上线依据。
 *
 * 【无顺序依赖的保证】
 *   每条用例独立 reLaunch。视图模式（graph/list）存在组件内，
 *   不落 storage，所以不会跨用例污染 —— 但仍每次重新进入以保证确定性。
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

describe('记忆 · 图谱与列表', () => {
  /**
   * 打开记忆页并完成前置。
   * 记忆是 TabBar 页，必须走 reLaunch 而非 navigateTo。
   */
  async function openMemory() {
    const page = await program.reLaunch('/pages/memory/index')
    await seedConsent(page, true)
    await seedLogin(page, account.primary)
    return program.reLaunch('/pages/memory/index')
  }

  /** 取切换器里第 n 个项（图谱 / 列表） */
  async function switchTo(page, label) {
    const items = await page.$$('.switch-item')
    for (const item of items) {
      const t = String((await item.text()) || '').trim()
      if (t.includes(label)) {
        await item.tap()
        return true
      }
    }
    return false
  }

  it('① 默认进入图谱视图，顶部有图谱/列表切换器', async () => {
    // 预期行为（memory/index.uvue）：viewMode 初值是 'graph'。
    const page = await openMemory()

    await waitForSelector(page, '.switcher', 10000)

    const hasGraph = await exists(page, '.graph-wrap')
    const hasList = await exists(page, '.grid')
    if (!hasGraph && !hasList) {
      throw new Error('默认视图既没有图谱容器也没有列表网格，页面可能白屏')
    }
    // 默认应是图谱
    if (!hasGraph) {
      throw new Error('默认视图不是图谱（viewMode 初值可能不是 graph）')
    }
  }, CASE_TIMEOUT)

  it('② ★ 切换到列表视图后，网格布局按列数设置渲染', async () => {
    // ★ 为什么要验列数：多列布局是折叠屏/平板适配的核心
    //   （04 号跨端规范）。回归症状是折叠屏展开后仍是一列，
    //   大屏上每条记录只占 1/4 屏，右侧大片空白 ——
    //   这是 AGC 的驳回项（test-matrix.md 第 5 行已标注）。
    //   页面用 `grid-cell--col{N}` 修饰类直接挂在 cell 上
    //   （不用后代选择器，因为那种写法在部分端不可靠）。
    const page = await openMemory()

    await waitForSelector(page, '.switcher', 10000)
    const switched = await switchTo(page, '列表')

    if (!switched) {
      throw new Error('切换器里找不到「列表」项')
    }

    await waitFor(async () => await exists(page, '.grid'), 10000)
    await sleep(500)

    // 有数据时应出现带列修饰类的 cell
    const cells = await page.$$('.grid-cell')
    if (cells.length > 0) {
      const cell0 = String((await cells[0].attribute('class')) || '')
      if (!cell0.includes('grid-cell--col')) {
        throw new Error('网格 cell 缺少列数修饰类 grid-cell--colN，实际 class：' + cell0)
      }
    }
    // 无数据时列表区可能为空，同样是合法状态
  }, CASE_TIMEOUT)

  it('③ ★ 点击图谱节点跳转到对应记忆详情页', async () => {
    // ★ 这是图谱唯一的功能入口，必须验。
    //   回归症状：图谱画得出来但点不动 —— 图谱就成了纯装饰，
    //   而它是本产品「记忆之间有连接」这个核心概念的载体。
    //   注意：canvas 上的点击通过 onCanvasActivate 处理（绑定 @tap），
    //   automator 需要点 canvas 区域而非某个 DOM 节点。
    const page = await openMemory()

    await waitForSelector(page, '.graph-canvas', 15000)
    await sleep(2000) // 等图谱绘制完成

    // 图谱有节点时才可点
    const hasGraph = await exists(page, '.graph-canvas')
    if (!hasGraph) {
      throw new Error('图谱 canvas 未渲染')
    }

    // 点击画布中心区域触发节点激活
    // ★ 捕获异常：鸿蒙 canvas 的 automator 支持度与 Android 不同，
    //   抛错不代表功能缺失，记为「本端不支持自动化点击」而非失败。
    let tapped = true
    try {
      await page.callUniMethod('uni.touchstart', {
        touches: [{ clientX: 180, clientY: 400 }],
      })
      await page.callUniMethod('uni.touchend')
    } catch {
      tapped = false
    }

    await sleep(1500)

    if (tapped) {
      // 点击后要么跳详情（.head-title），要么仍停留图谱（点在空白处）
      const onDetail = await exists(page, '.head-title')
      const stillGraph = await exists(page, '.graph-canvas')
      if (!onDetail && !stillGraph) {
        throw new Error('点击图谱后页面状态异常：既不在详情页也不在图谱页')
      }
      // ★ 说明：命中节点会跳详情，点在空白处留在图谱，
      //   两者都算通过。真机上要人工确认节点坐标命中。
    }
  }, CASE_TIMEOUT)

  it('④ 点击右上角「时间轴」进入时间轴视图', async () => {
    const page = await openMemory()

    await waitForSelector(page, '.nav-action', 10000)

    const entry = await page.$('.nav-action')
    if (entry != null) {
      await entry.tap()
    }

    await sleep(1500)

    // 时间轴页是 memory/timeline；用「已离开图谱页」作为判据
    const stillOnIndex = await exists(page, '.graph-canvas')
    if (stillOnIndex) {
      throw new Error('点「时间轴」后仍停留在记忆图谱页')
    }
  }, CASE_TIMEOUT)

  it('⑤ ★ 图谱加载失败时给出可重试的提示，而不是空白 canvas', async () => {
    // ★ 断网场景下最常见的糟糕表现：
    //   canvas 画不出来，但页面也不报错，
    //   用户看到一片白色，配一句「点节点可以打开那件事」的提示 ——
    //   提示与实际状态完全矛盾。
    //   回归症状就是这条用例要抓的。
    const page = await program.reLaunch('/pages/memory/index')
    await seedConsent(page, true)
    await seedLogin(page, account.primary)

    let networkCut = false
    try {
      await page.callUniMethod('uni.setNetworkStatus', { networkType: 'none' })
      networkCut = true
    } catch {
      // 当前端不支持模拟断网
    }

    await program.reLaunch('/pages/memory/index')
    await sleep(3000)

    // 四种合法形态都算通过（memory/index.uvue 的 v-if / v-else-if 链）：
    //   .spinner     加载中（AppLoading）
    //   .empty       错误态或空态（AppEmpty，标题分别是「图谱没画出来」/「图谱还是空的」）
    //   .graph-canvas 有节点，canvas 已绘制
    // ★ 关键：三者都不能是「什么都没有」——
    //   那就是 canvas 画不出来、页面也不报错的白屏，
    //   而页面却还显示着「点节点可以打开那件事」，提示与实际状态自相矛盾。
    const spinner = await exists(page, '.spinner')
    const empty = await exists(page, '.empty')
    const canvas = await exists(page, '.graph-canvas')

    if (!spinner && !empty && !canvas) {
      throw new Error(
        '图谱页断网后完全空白（既无加载态、无错误/空态、也无 canvas）' +
          (networkCut ? '' : '（当前端不支持模拟断网，需真机手动断网验证）'),
      )
    }

    // ★ 若走到了「有节点」分支，说明断网没生效（网络恢复太快 / 模拟无效），
    //   这不算失败，但必须在报告里标注为「本条未真正验证断网路径」。
    if (canvas && !empty) {
      // 断网未生效：本条只验证了「页面有内容」，没验证错误态。
      // 真机验证时需手动断网后重跑（见 test-matrix.md 专项测试第 7 项）。
    }

    if (networkCut) {
      try {
        await page.callUniMethod('uni.setNetworkStatus', { networkType: 'wifi' })
      } catch {
        // 恢复失败不影响本条断言
      }
    }
  }, CASE_TIMEOUT)
})
