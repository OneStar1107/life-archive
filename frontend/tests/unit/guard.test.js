/**
 * frontend/tests/unit/guard.test.js
 * ══════════════════════════════════════════════════════════════
 * 路由守卫（★ 本文件在 CI 中真实执行并必须全绿）
 * ══════════════════════════════════════════════════════════════
 *
 * ★ 为什么只测 checkRoute，不测 applyRedirect：
 *
 *   guard.ts 刻意把「判定」与「执行」拆成两个函数：
 *     checkRoute(url, loggedIn, accepted) → 纯判定，返回 { action, url, reason }
 *     applyRedirect(url)                  → 调 uni.redirectTo，有副作用
 *
 *   这个拆分不是为了好看，是因为**只有判定部分能测**：
 *     applyRedirect 依赖全局 uni 对象，Node 环境里不存在。
 *   如果两者写在一起，守卫逻辑就完全无法单测，
 *   只能靠真机点页面 —— 而「已登录访问登录页会不会被弹回首页」
 *   这类状态组合，手工点要构造十几种前置条件，必然漏。
 *
 *   所以本文件测 checkRoute，applyRedirect 由 UI 用例
 *   （pages/login/login.test.js 等）覆盖真实跳转行为。
 *
 * 被测模块无 uni 依赖（uni 只出现在 applyRedirect 内部）→ Node 可直接跑。
 */

import {
  checkRoute,
  isPublicPage,
  normalizePath,
  HOME_PAGE,
  LOGIN_PAGE,
} from '@/core/router/guard'

const PRIVACY_PAGE = 'pages/privacy/privacy'
const REGISTER_PAGE = 'pages/register/register'

/** 受保护页面（不在白名单里） */
const PROTECTED = [
  'pages/index/index',
  'pages/feeling/index',
  'pages/feeling/edit',
  'pages/memory/index',
  'pages/memory/detail',
  'pages/memory/timeline',
  'pages/health/index',
  'pages/journey/index',
  'pages/todo/index',
  'pages/insight/index',
  'pages/mine/index',
  'pages/mine/settings',
]

describe('路由守卫 (core/router/guard)', () => {
  describe('normalizePath —— 去掉 query 与 hash', () => {
    it('无 query 时原样返回', () => {
      expect(normalizePath('pages/index/index')).toBe('pages/index/index')
    })

    it('去掉 ? 之后的 query', () => {
      expect(normalizePath('pages/index/index?tab=1')).toBe('pages/index/index')
    })

    it('去掉 # 之后的 hash', () => {
      expect(normalizePath('pages/index/index#top')).toBe('pages/index/index')
    })

    it('★ query 与 hash 都有时，取最靠前的分隔符', () => {
      // 前缀匹配（isPublicPage 依赖它）如果算错，
      // 「pages/login/login?redirect=/pages/memory/index」
      // 就可能被判成受保护页 → 未登录用户被守卫踢走，回不来。
      expect(normalizePath('pages/login/login?a=1#b')).toBe('pages/login/login')
      expect(normalizePath('pages/login/login#b?a=1')).toBe('pages/login/login')
    })

    it('空字符串与前导斜杠不崩溃', () => {
      expect(normalizePath('')).toBe('')
      expect(normalizePath('/pages/index/index')).toBe('/pages/index/index')
    })
  })

  describe('isPublicPage —— 白名单前缀匹配', () => {
    it('三个白名单页及其带参形式都算公开页', () => {
      expect(isPublicPage(LOGIN_PAGE)).toBe(true)
      expect(isPublicPage(REGISTER_PAGE)).toBe(true)
      expect(isPublicPage(PRIVACY_PAGE)).toBe(true)
      expect(isPublicPage(`${LOGIN_PAGE}?from=todo`)).toBe(true)
    })

    it('★ 受保护页都不算公开页', () => {
      for (const p of PROTECTED) {
        expect(isPublicPage(p)).toBe(false)
      }
    })

    it('★ 前缀相似但不匹配的页不算公开（防止越权放行）', () => {
      // ★ 这条是安全边界：如果白名单只用 startsWith('/pages/login')，
      //   那么 pages/login/other 会被误放行。
      //   guard.ts 用的是 `p === pub || p.startsWith(pub + '/')`，
      //   语义正确 —— 这里把它钉死，防止有人日后「简化」掉。
      expect(isPublicPage('pages/loginx/login')).toBe(false)
      expect(isPublicPage('pages/login/login-helper')).toBe(false)
      expect(isPublicPage('pages/privacy')).toBe(false)
    })
  })

  describe('白名单放行：未登录 + 未同意 → 仍可访问公开页', () => {
    it('登录页放行', () => {
      // ★ 关键：登录页本身会弹隐私同意，
      //   若这里把它拦去隐私页，用户会陷入「点同意 → 又被要求同意」的死循环。
      const r = checkRoute(LOGIN_PAGE, false, false)
      expect(r.action).toBe('allow')
    })

    it('注册页放行', () => {
      expect(checkRoute(REGISTER_PAGE, false, false).action).toBe('allow')
    })

    it('隐私政策页放行', () => {
      expect(checkRoute(PRIVACY_PAGE, false, false).action).toBe('allow')
    })
  })

  describe('未登录访问受保护页 → 跳登录', () => {
    it('逐个验证全部受保护页都跳登录', () => {
      // 用循环而不是逐条 it：少写一条就会漏测一个页面，
      // 而漏掉的页面在真机上才会暴露「游客点 Tab 被弹回登录」。
      for (const p of PROTECTED) {
        const r = checkRoute(p, false, true)
        expect({ page: p, action: r.action }).toEqual({ page: p, action: 'redirect' })
        if (r.action === 'redirect') {
          expect(r.url).toBe(LOGIN_PAGE)
          expect(r.reason).toBe('未登录')
        }
      }
    })

    it('带 query 的受保护页同样跳登录', () => {
      const r = checkRoute('pages/memory/detail?id=abc', false, true)
      expect(r.action).toBe('redirect')
      if (r.action === 'redirect') expect(r.url).toBe(LOGIN_PAGE)
    })
  })

  describe('已登录访问登录/注册页 → 回首页', () => {
    it('已登录访问登录页被弹回首页', () => {
      // ★ 为什么必须弹：否则登录页留在页面栈里，
      //   用户按返回键会回到登录页，看到一个已登录的表单，
      //   还能再点一次登录 —— 体验上像坏了。
      const r = checkRoute(LOGIN_PAGE, true, true)
      expect(r.action).toBe('redirect')
      if (r.action === 'redirect') {
        expect(r.url).toBe(HOME_PAGE)
        expect(r.reason).toBe('已登录')
      }
    })

    it('已登录访问注册页被弹回首页', () => {
      const r = checkRoute(REGISTER_PAGE, true, true)
      expect(r.action).toBe('redirect')
      if (r.action === 'redirect') expect(r.url).toBe(HOME_PAGE)
    })

    it('★ 已登录访问隐私政策页仍然放行', () => {
      // 隐私政策是**法定必须随时可查**的（三端商店硬要求），
      // 不能因为「已登录」就不给看。
      const r = checkRoute(PRIVACY_PAGE, true, true)
      expect(r.action).toBe('allow')
    })

    it('已登录访问普通页面放行', () => {
      for (const p of PROTECTED) {
        expect({ page: p, action: checkRoute(p, true, true).action }).toEqual({
          page: p,
          action: 'allow',
        })
      }
    })
  })

  describe('★ 未同意隐私政策 → 强制先同意（优先级最高）', () => {
    it('未同意 + 未登录 → 先去隐私页（不是登录页）', () => {
      // ★ 顺序很重要：先同意隐私，再谈登录。
      //   反过来的话，用户会先看到登录表单、填完账号密码，
      //   才发现要先同意政策 —— 白填一次，是真实的体验投诉来源。
      const r = checkRoute('pages/index/index', false, false)
      expect(r.action).toBe('redirect')
      if (r.action === 'redirect') {
        expect(r.url).toBe(PRIVACY_PAGE)
        expect(r.reason).toBe('未同意隐私政策')
      }
    })

    it('★ 未同意 + 已登录 → 仍然先去隐私页', () => {
      // 已登录不代表已同意：可能清过缓存，或版本升级后政策有变更。
      // 商店审核明确要求「政策变更后需重新征得同意」。
      const r = checkRoute('pages/index/index', true, false)
      expect(r.action).toBe('redirect')
      if (r.action === 'redirect') expect(r.url).toBe(PRIVACY_PAGE)
    })

    it('未同意时全部受保护页都先去隐私页', () => {
      for (const p of PROTECTED) {
        const r = checkRoute(p, true, false)
        if (r.action !== 'redirect' || r.url !== PRIVACY_PAGE) {
          throw new Error(`隐私政策守卫失效于 ${p}`)
        }
      }
    })

    it('★ 未同意时登录页仍放行（否则会死循环）', () => {
      // 登录页自己会弹同意弹窗，若被守卫拦去隐私页，
      // 用户点「同意」后想回登录页又被打回隐私页 —— 死循环。
      expect(checkRoute(LOGIN_PAGE, false, false).action).toBe('allow')
      expect(checkRoute(REGISTER_PAGE, false, false).action).toBe('allow')
    })
  })

  describe('守卫结果结构', () => {
    it('放行时只返回 action，不带 url（避免调用方误用）', () => {
      const r = checkRoute('pages/index/index', true, true)
      expect(r.action).toBe('allow')
      expect(r.url).toBeUndefined()
    })

    it('跳转时必须带 reason（调试与埋点需要知道为什么跳）', () => {
      const cases = [
        [PROTECTED[0], false, true, '未登录'],
        [PROTECTED[0], true, false, '未同意隐私政策'],
        [LOGIN_PAGE, true, true, '已登录'],
      ]
      for (const [url, loggedIn, accepted, reason] of cases) {
        const r = checkRoute(url, loggedIn, accepted)
        if (r.action === 'redirect') {
          expect({ url, reason: r.reason }).toEqual({ url, reason })
        }
      }
    })

    it('跳转目标一定是受信任的内部路由（不能是外部 URL）', () => {
      // ★ 安全边界：url 会直接喂给 uni.redirectTo。
      //   如果 checkRoute 未来引入了「带 redirect 参数回跳」的逻辑，
      //   很容易被构造成 openRedirect 漏洞。
      const results = [
        checkRoute(PROTECTED[0], false, true),
        checkRoute(PROTECTED[0], true, false),
        checkRoute(LOGIN_PAGE, true, true),
      ]
      for (const r of results) {
        if (r.action === 'redirect') {
          expect(r.url.startsWith('pages/')).toBe(true)
          expect(r.url).not.toContain('://')
        }
      }
    })
  })

  describe('常量与 pages.json 的一致性', () => {
    it('HOME_PAGE / LOGIN_PAGE 都是合法页面路径', () => {
      expect(HOME_PAGE).toBe('pages/index/index')
      expect(LOGIN_PAGE).toBe('pages/login/login')
    })
  })
})
