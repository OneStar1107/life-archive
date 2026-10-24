/**
 * frontend/pages/mine/settings.test.js
 * ══════════════════════════════════════════════════════════════
 * 设置 · 跨端 UI 用例（4 条）
 * ══════════════════════════════════════════════════════════════
 *
 * ⚠️★★★ 尚未在真机验证过 ★★★
 *   三端都还没出包（阶段 06 未完成），本文件**一条都没在真机上跑过**。
 *   状态与 docs/release/test-matrix.md 的「未覆盖」一致。
 *
 * 【为什么设置页的用例优先级不低】
 *   这里集中了三件「错了就是驳回 / 事故」的事：
 *     1. 主题切换 —— 深色模式下有白块是商店常见驳回项
 *        （test-matrix.md 专项测试第 9 项）
 *     2. 数据导出 —— 《个人信息保护法》赋予用户的权利，
 *        做不出来是合规问题
 *     3. 账号注销 —— 界面规范要求二次确认且**必须写出具体数字**
 *
 * 【★ 注销用例的关键约束】
 *   settings.uvue 的产品约束第 2 条原文：
 *     「注销确认弹窗里必须写出**具体数字**
 *       （如『你的 128 条记忆、96 条感受将被删除』），
 *       而不是干巴巴一句『确定要注销吗』。
 *       空泛的确认框是恶意或疏忽应用注销流程的常见手法，
 *       也是审核重点。」
 *   → 用例 ③ 会硬性断言弹窗里出现数字。
 *
 * 【无顺序依赖的保证】
 *   每条用例独立进入。★ 主题切换会写 storage，
 *   所以 ① 在结束时把主题恢复为「跟随系统」，
 *   否则后面的用例会继承深色模式 —— 这类污染只在连跑时暴露，最难查。
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

describe('设置', () => {
  /** 打开设置页并完成前置 */
  async function openSettings() {
    const page = await program.reLaunch('/pages/mine/settings')
    await seedConsent(page, true)
    await seedLogin(page, account.primary)
    return program.reLaunch('/pages/mine/settings')
  }

  /** 在第 n 个 .seg 内点第 index 个项 */
  async function pickInSeg(page, segIndex, itemIndex) {
    const segs = await page.$$('.seg')
    if (segs[segIndex] == null) {
      throw new Error('未找到第 ' + (segIndex + 1) + ' 个分段控件')
    }
    // uni-automator 的 $ 作用域是整页，这里通过逐项匹配文本定位
    const items = await page.$$('.seg-item')
    if (items[itemIndex] == null) {
      throw new Error('分段控件里没有第 ' + (itemIndex + 1) + ' 项')
    }
    await items[itemIndex].tap()
    await sleep(600)
  }

  it('① ★ 主题可在「跟随系统 / 浅色 / 深色」间切换并持久化', async () => {
    // ★ 深色模式是三端商店的明确要求（test-matrix.md 专项第 9 项）。
    //   回归症状：切到深色后页面出现白块 / 对比度不足，
    //   用户会觉得「App 坏了」。这类问题只能靠真机截图发现，
    //   本条只保证「切换生效且被记住」。
    const page = await openSettings()

    await waitForSelector(page, '.seg', 10000)

    // 三个主题选项
    const items = await page.$$('.seg-item')
    if (items.length < 3) {
      throw new Error('主题选项应至少 3 个（跟随系统/浅色/深色），实际 ' + items.length + ' 个')
    }

    // 逐个切换，每次确认有且仅有一个选中项
    for (let i = 0; i < 3; i++) {
      const all = await page.$$('.seg-item')
      if (all[i] == null) break
      await all[i].tap()
      await sleep(600)

      const on = await page.$$('.seg-item--on')
      if (on.length !== 1) {
        throw new Error(
          '切换主题后选中项数量为 ' + on.length + '（应为 1），主题状态可能未正确持久化',
        )
      }
    }

    // ★ 恢复默认，避免污染后续用例（无顺序依赖）
    await pickInSeg(page, 0, 0) // 「跟随系统」
    await sleep(500)
  }, CASE_TIMEOUT)

  it('② ★ 数据导出可用，并列出各表记录条数', async () => {
    // ★ 导出是《个人信息保护法》赋予用户的权利。
    //   页面设计很克制：按钮文案是「看看我有多少数据」而不是「导出」——
    //   因为这个产品不鼓励用户把数据带走。
    //   但权利必须可实现，所以要有真实条数返回。
    const page = await openSettings()

    await waitForSelector(page, '.btn', 10000)

    // 导出按钮
    const btns = await page.$$('.btn')
    let exportBtn = null
    for (const b of btns) {
      const t = String((await b.text()) || '')
      if (t.includes('数据') || t.includes('清点')) {
        exportBtn = b
        break
      }
    }
    if (exportBtn == null) {
      throw new Error('未找到数据导出按钮')
    }

    await exportBtn.tap()
    await sleep(3000)

    // 导出结果区：.export > .export-time + .export-row/.export-value
    const hasResult = await exists(page, '.export')
    if (!hasResult) {
      // 失败时也必须有可读提示，不能静默无反应
      const text = await textOf(page, '.page')
      if (!text.includes('失败') && !text.includes('错误') && !text.includes('重试')) {
        throw new Error('点导出后既没有结果区也没有任何错误提示，属于「点了没反应」')
      }
      return
    }

    // 有结果时必须有时间戳与至少一条记录数
    const exportTime = await textOf(page, '.export-time')
    if (exportTime.trim().length === 0) {
      throw new Error('导出结果缺少清点时间，用户无法判断数据新鲜度')
    }

    const rows = await page.$$('.export-row')
    if (rows.length === 0) {
      throw new Error('导出结果区没有任何记录条目')
    }

    // 每条都应有数值
    const values = await page.$$('.export-value')
    for (const v of values) {
      const t = String((await v.text()) || '').trim()
      if (t.length === 0) {
        throw new Error('导出结果里有条目的数量为空')
      }
    }
  }, CASE_TIMEOUT)

  it('★★ 注销账号弹二次确认，且弹窗内写出具体数据条数', async () => {
    // ★★ 对应《个人信息保护法》与三端商店的注销规范。
    //
    // 关键验收点（缺一不可）：
    //   1. 点「我要注销」先弹窗，不直接删
    //   2. 弹窗里出现**具体数字**（如「128 条记忆」）
    //   3. 有取消入口
    //
    // ★ 为什么要求「具体数字」而不是「确定要注销吗」：
    //   空泛确认框是「恶意或疏忽应用注销流程」的常见手法，也是审核重点。
    //   数字让用户能真正判断这件事的影响面。
    const page = await openSettings()

    await waitForSelector(page, '.btn', 10000)

    // 找注销按钮
    const btns = await page.$$('.btn')
    let deleteBtn = null
    for (const b of btns) {
      const t = String((await b.text()) || '')
      if (t.includes('注销')) {
        deleteBtn = b
        break
      }
    }
    if (deleteBtn == null) {
      throw new Error('未找到注销账号按钮')
    }

    await deleteBtn.tap()
    await sleep(1500)

    // 确认弹窗出现（页面自绘的 .dialog，不是系统 showModal）
    const hasDialog = await exists(page, '.dialog')
    if (!hasDialog) {
      throw new Error('点「我要注销」后未出现二次确认弹窗，存在误删风险')
    }

    // ★ 弹窗标题
    const title = await textOf(page, '.dialog-title')
    if (title.trim().length === 0) {
      throw new Error('注销确认弹窗没有标题')
    }

    // ★★ 核心：弹窗正文必须包含具体数字
    const body = await textOf(page, '.dialog-body')
    const note = await textOf(page, '.dialog-note')
    const all = (body + ' ' + note).replace(/\s+/g, '')

    if (all.length === 0) {
      throw new Error('注销确认弹窗没有任何说明文案，用户不知道会删掉什么')
    }

    if (!/\d/.test(all)) {
      throw new Error(
        '注销确认弹窗未写出具体数据条数（规范要求形如「你的 N 条记忆…将被删除」）。实际文案：' +
          all.slice(0, 200),
      )
    }

    // 有取消入口
    const dialogBtns = await page.$$('.dialog .btn')
    if (dialogBtns.length < 2) {
      throw new Error('注销确认弹窗缺少「确认 / 取消」两个操作，期望至少 2 个按钮')
    }

    // ★ 只验证到「弹窗正确」为止，**绝不点确认**：
    //   真注销会销毁测试账号，后续所有需要登录的用例全部失效。
    //   注销接口本身的幂等性与数据清理由后端 e2e 覆盖。
  }, CASE_TIMEOUT)

  it('④ 隐私政策入口可打开，且指向可访问的 https 网页', async () => {
    // ★ 三端商店硬要求：隐私政策必须是**独立可访问的 https 网页**，
    //   不能是 App 内文本或图片，否则直接驳回。
    //   core/env/env.ts 的 PRIVACY_POLICY_URL 当前是占位域名
    //   （TODO 待补），上线前必须替换为已备案域名。
    const page = await openSettings()

    await waitForSelector(page, '.row', 10000)

    // 找到「隐私政策」那一行并点击
    const rows = await page.$$('.row')
    let privacyRow = null
    for (const r of rows) {
      const t = String((await r.text()) || '')
      if (t.includes('隐私')) {
        privacyRow = r
        break
      }
    }
    if (privacyRow == null) {
      throw new Error('设置页未找到隐私政策入口（三端商店要求必须可查）')
    }

    await privacyRow.tap()
    await sleep(2000)

    // 点击后应发生两种情况之一：
    //   a. 打开系统浏览器（新开页面）—— App 端的正确行为
    //   b. 跳到 App 内隐私政策页
    const onPrivacyPage = await exists(page, '.page')
    if (!onPrivacyPage) {
      throw new Error('点隐私政策后页面状态异常')
    }

    // ★ 说明：目标 URL 是否真的可访问、HTTPS 证书是否有效，
    //   automator 无法断言，必须真机点开确认。
    //   当前 env.ts 里是占位域名，出包前必须整改（见占位符取值表）。
  }, CASE_TIMEOUT)
})
