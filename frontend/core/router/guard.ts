// core/router/guard.ts
// ══════════════════════════════════════════════════════════════
// 路由守卫
// ══════════════════════════════════════════════════════════════
//
// 规则（03 号 T6）：
//   1. 白名单（登录页、注册页、隐私政策页）无需登录
//   2. 未登录访问受保护页 → 跳登录
//   3. 已登录访问登录/注册页 → 跳首页
//   4. 未同意隐私政策 → 强制先同意，不同意前**不得发起任何网络请求**
//
// ★ 白名单用「前缀匹配」而非全等，避免带 query 的路径漏判。

/** 免登录页面 */
const PUBLIC_PAGES: string[] = [
  'pages/login/login',
  'pages/register/register',
  'pages/privacy/privacy',
]

/** 首页 */
export const HOME_PAGE: string = 'pages/index/index'

/** 登录页 */
export const LOGIN_PAGE: string = 'pages/login/login'

/**
 * ★ tabBar 页面清单（与 pages.json 的 tabBar.list 严格对齐）。
 *   `redirectTo` 不允许跳 tabBar 页（会静默失败），所以守卫/兜底跳转
 *   遇到这些页必须改用 `reLaunch`。
 */
const TABBAR_PAGES: string[] = [
  'pages/index/index',
  'pages/feeling/index',
  'pages/memory/index',
  'pages/health/index',
  'pages/mine/index',
]

/** 目标路径是否为 tabBar 页（去掉 query/hash 后判定） */
function isTabBarPage(url: string): boolean {
  const p = normalizePath(url)
  for (const t of TABBAR_PAGES) {
    if (p === t) return true
  }
  return false
}

/**
 * 去掉 query 与 hash，只留路径。
 * uni 的 url 可能形如 `pages/index/index?tab=1`
 */
export function normalizePath(url: string): string {
  const q = url.indexOf('?')
  const h = url.indexOf('#')
  let end = url.length
  if (q >= 0) end = q
  if (h >= 0 && h < end) end = h
  return url.slice(0, end)
}

/** 是否为白名单页面 */
export function isPublicPage(url: string): boolean {
  const p = normalizePath(url)
  for (const pub of PUBLIC_PAGES) {
    if (p === pub || p.startsWith(`${pub}/`)) return true
  }
  return false
}

/** 守卫结果 */
export type GuardResult =
  | { action: 'allow' }
  | { action: 'redirect'; url: string; reason: string }

/**
 * 路由守卫判定。
 *
 * @param url       目标路由
 * @param loggedIn  是否已登录
 * @param accepted  是否已同意隐私政策
 */
export function checkRoute(url: string, loggedIn: boolean, accepted: boolean): GuardResult {
  // 隐私政策未同意：任何页面都先去隐私页
  // （登录页本身也会弹同意弹窗，所以放行它）
  if (!accepted && !isPublicPage(url)) {
    return { action: 'redirect', url: 'pages/privacy/privacy', reason: '未同意隐私政策' }
  }

  const pub = isPublicPage(url)

  // 未登录访问受保护页
  if (!loggedIn && !pub) {
    return { action: 'redirect', url: LOGIN_PAGE, reason: '未登录' }
  }

  // 已登录还去登录/注册页 → 回首页
  if (loggedIn && pub) {
    const p = normalizePath(url)
    if (p === LOGIN_PAGE || p === 'pages/register/register') {
      return { action: 'redirect', url: HOME_PAGE, reason: '已登录' }
    }
  }

  return { action: 'allow' }
}

/**
 * 执行跳转。
 * ★ 三条已踩坑，这里统一兜住：
 *   1. url 必须带前导 `/`：uni 对不带 `/` 的路径按相对路径解析，静默失败；
 *   2. 冷启动早期（onLaunch / onPageNotFound 期间）uni-h5 的 getApp().$router
 *      可能尚未就绪，redirectTo 会被拒甚至抛错（控制台出现指向调用点的错误帧）；
 *   3. 失败绝不能静默：重试梯子 0ms → 400ms → 1200ms，全部失败必须留痕。
 */
export function applyRedirect(url: string): void {
  const target = url.startsWith('/') ? url : `/${url}`
  // ★ tabBar 页不能走 redirectTo（静默失败），必须用 reLaunch。
  //   这里按目标页是否 tabBar 选 API，避免「已登录却回不了首页」这类死局。
  const useReLaunch = isTabBarPage(target)
  const attempt = (delays: number[]): void => {
    const delay = delays[0] ?? -1
    if (delay < 0) {
      console.error(`[guard] 跳转彻底失败（重试已用尽）：${target}`)
      return
    }
    setTimeout(() => {
      const fail = (err: unknown): void => {
        console.warn(
          `[guard] 跳转失败（${delay}ms 后重试）：${target}`,
          (err as { errMsg?: string })?.errMsg ?? err,
        )
        attempt(delays.slice(1))
      }
      try {
        if (useReLaunch) {
          uni.reLaunch({ url: target, fail })
        } else {
          uni.redirectTo({ url: target, fail })
        }
      } catch (e) {
        console.warn(`[guard] 跳转异常（${delay}ms 后重试）：${target}`, e)
        attempt(delays.slice(1))
      }
    }, delay)
  }
  attempt([0, 400, 1200])
}
