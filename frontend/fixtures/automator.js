/**
 * frontend/fixtures/automator.js
 * ══════════════════════════════════════════════════════════════
 * uni-automator 用例的公共前置（07 号 T1）
 * ══════════════════════════════════════════════════════════════
 *
 * ★★ 当前验证状态：尚未在真机验证过 ★★
 *   三端都还没出包（阶段 06 未完成），本文件所有 helper 都**没有在真机上跑过**。
 *   状态与 docs/release/test-matrix.md 的「未覆盖」一致。
 *
 * ★★ 平台限制（不知道会白忙一天）★★
 *   · App 端 iOS 仅支持模拟器，不支持真机跑 automator
 *   · Windows 根本跑不了 iOS 端用例 → 需 macOS
 *   · 鸿蒙无云打包，只能本机 DevEco 出包后跑
 *
 * ★★ 为什么需要这个文件 ★★
 *   07 号硬约束：「每条用例必须独立可重复执行（无顺序依赖）」。
 *   uni-automator 的用例之间共享一个真机 App 实例，
 *   上一条用例留下的登录态、缓存、已建数据会污染下一条。
 *   所以每条用例必须自己准备前置、自己清理后置。
 *
 *   把这些准备逻辑收敛到这里，而不是在 8 个测试文件里各写一遍 ——
 *   复制 8 遍的代价是：改一处要改 8 处，漏一处就有一条用例顺序依赖。
 */

const account = require('./account')

/** ★ 统一的用例超时。冷启动 + 网络请求，10s 是底线 */
const CASE_TIMEOUT = 30000

/**
 * 等待条件成立。
 *
 * ★ 为什么要轮询而不是固定 sleep：
 *   固定 sleep(3000) 在快机器上白等 3 秒，在慢机器上又不够 ——
 *   用例结果会随机飘。轮询是唯一稳定做法。
 *
 * @param {Function} condition 返回 true 即视为就绪
 * @param {number} timeout 超时毫秒
 */
async function waitFor(condition, timeout = 10000) {
  const start = Date.now()
  for (;;) {
    let ok = false
    try {
      ok = await condition()
    } catch {
      ok = false // 元素还没出现时 $ 会抛异常，属于正常中间态
    }
    if (ok) return true
    if (Date.now() - start > timeout) {
      throw new Error('waitFor 超时：条件在 ' + timeout + 'ms 内未成立')
    }
    await sleep(200)
  }
}

/** 固定等待。★ 只用于「明确知道要等这么久」的场景（如动画结束） */
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

/**
 * 元素是否存在。
 * @returns {Promise<boolean>}
 */
async function exists(page, selector) {
  const el = await page.$(selector)
  return el != null
}

/**
 * 取元素的文本内容。
 * ★ 返回空串而不是抛异常：调用方通常只想断言「文案不为空」，
 *   元素不存在与内容为空在断言上等价。
 */
async function textOf(page, selector) {
  const el = await page.$(selector)
  if (el == null) return ''
  const t = await el.text()
  return t == null ? '' : String(t)
}

/**
 * 断言元素存在。
 * @param {string} desc 失败时的可读描述
 */
async function expectExists(page, selector, desc) {
  const el = await page.$(selector)
  if (el == null) {
    throw new Error('预期存在但未找到：' + selector + '（' + (desc || '') + '）')
  }
  return el
}

/**
 * 断言元素不存在。
 * @param {string} desc 失败时的可读描述
 */
async function expectNotExists(page, selector, desc) {
  const el = await page.$(selector)
  if (el != null) {
    throw new Error('预期不存在但找到了：' + selector + '（' + (desc || '') + '）')
  }
}

/**
 * 断言元素文本包含子串。
 *
 * ★ 为什么用「包含」而不是「相等」：
 *   文案会随产品迭代调整，完全相等会让每改一次文案就红一条用例。
 *   关键片段（错误码文案里的动词、按钮上的关键词）才是稳定契约。
 */
async function expectTextContains(page, selector, needle, desc) {
  const actual = await textOf(page, selector)
  if (!actual.includes(needle)) {
    throw new Error(
      '元素 ' + selector + ' 的文案不含「' + needle + '」，实际为「' + actual + '」' +
        '（' + (desc || '') + '）',
    )
  }
}

/**
 * 等待元素出现。
 * 比 waitFor 更常用：直接表达「等这个按钮出来」。
 */
async function waitForSelector(page, selector, timeout = 10000) {
  await waitFor(async () => await exists(page, selector), timeout)
}

/**
 * ★ 清空登录态，回到游客状态。
 *
 * 每条需要游客前置的用例都必须先调它 —— 否则上一条用例登录了没退出，
 * 游客路径就测不到了。这是「无顺序依赖」最容易被忽略的一环。
 */
async function resetToGuest(page) {
  await page.callUniMethod('uni.clearStorageSync')
  await sleep(200)
}

/**
 * ★ 注入登录态，跳过真实登录接口。
 *
 * ★ 为什么可以跳过：
 *   登录流程本身由 pages/login/login.test.js 单独覆盖。
 *   而其它页面（感受/记忆/健康/设置）的用例真正想验的是**页面行为**，
 *   没必要每条都先登录一遍 —— 那会让 30 条用例多花几分钟，
 *   而且登录接口一抖动，几十条页面用例全红，噪音淹没真问题。
 *
 * ★ 前置条件：
 *   令牌必须**真实有效**，否则页面第一屏就 401 跳登录，用例假装通过。
 *   所以这个 helper 只在本地 mock 环境用；
 *   真机跑之前需确认后端已种好这批测试账号（见 account.js 顶部说明）。
 */
async function seedLogin(page, who) {
  const acct = who || account.primary
  await page.callUniMethod('uni.setStorageSync', account.storageKeys.accessToken, account.forgedTokens.access)
  await page.callUniMethod('uni.setStorageSync', account.storageKeys.refreshToken, account.forgedTokens.refresh)
  await page.callUniMethod('uni.setStorageSync', account.storageKeys.privacyConsent, true)
  void acct
}

/**
 * 注入「已同意隐私政策」。
 *
 * ★ 为什么单独抽出来：路由守卫在未同意时会把所有受保护页
 *   重定向到隐私页（core/router/guard.ts 的第一条规则）。
 *   不种这个前置，用例会全部卡在第一屏，
 *   而且失败现象是「找不到按钮」，很容易被误判成选择器写错。
 */
async function seedConsent(page, accepted = true) {
  await page.callUniMethod('uni.setStorageSync', account.storageKeys.privacyConsent, accepted)
}

module.exports = {
  CASE_TIMEOUT,
  waitFor,
  sleep,
  exists,
  textOf,
  expectExists,
  expectNotExists,
  expectTextContains,
  waitForSelector,
  resetToGuest,
  seedLogin,
  seedConsent,
}
