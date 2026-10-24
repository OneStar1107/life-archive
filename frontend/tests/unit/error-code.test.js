/**
 * frontend/tests/unit/error-code.test.js
 * ══════════════════════════════════════════════════════════════
 * 错误码契约（★ 本文件在 CI 中真实执行并必须全绿）
 * ══════════════════════════════════════════════════════════════
 *
 * 为什么错误码值得单独一层单测：
 *   error-code.ts 是**前后端唯一的中文文案出口**（05 号 T7）。
 *   它坏掉的方式非常隐蔽：
 *     · 加了后端新码但忘了加前端文案 → 用户看到「开小差了」，完全不知道发生了什么
 *     · 把 isTokenExpired 的判断写成 != → 静默刷新变成无限刷新，触发风控
 *     · 文案写成空串 → 页面弹一个空 toast，用户以为 App 卡了
 *   这三类问题都不会导致编译失败，只会在真机上被用户发现。
 *   所以必须在 CI 里挡住。
 *
 * 被测模块是纯数据 + 纯函数，无 uni 依赖 → Node 可直接跑。
 */

import {
  CODE,
  ERROR_CODE,
  messageOf,
  isAuthError,
  isTokenExpired,
  isLoginExpired,
  messageOfError,
  NETWORK_ERROR,
  TIMEOUT_ERROR,
  LOGIN_EXPIRED,
  CANCELLED,
} from '@/core/http/error-code'

describe('错误码契约 (core/http/error-code)', () => {
  describe('messageOf —— 每个码都必须有非空中文文案', () => {
    it('CODE 里登记的每一个码，messageOf 都返回非空文案', () => {
      // ★ 遍历而不是逐个写死：
      //   写死的话，加了新码就会有人忘记补这条断言。
      const codes = Object.values(CODE)
      expect(codes.length).toBeGreaterThan(50)

      const empty = []
      for (const code of codes) {
        const msg = messageOf(code)
        // 非空、非空白、且不是兜底文案（用了兜底说明 ERROR_CODE 表里漏了这一条）
        if (typeof msg !== 'string' || msg.trim().length === 0) {
          empty.push({ code, reason: '文案为空' })
        } else if (msg === ERROR_CODE[90003] && code !== 90003) {
          empty.push({ code, reason: '落到了通用兜底，ERROR_CODE 表里没登记' })
        }
      }

      expect(empty).toEqual([])
    })

    it('ERROR_CODE 表里没有空字符串文案', () => {
      const bad = Object.keys(ERROR_CODE).filter((k) => {
        const v = ERROR_CODE[k]
        return typeof v !== 'string' || v.trim().length === 0
      })
      expect(bad).toEqual([])
    })

    it('未登记的码回落到通用系统错误，而不是抛异常或返回 undefined', () => {
      // ★ 必须回落而不是崩：后端加了新码而前端还没更新时，
      //   用户至少看到一句人话，而不是白屏。
      expect(messageOf(99999)).toBe(ERROR_CODE[90003])
      expect(messageOf(-1)).toBe(ERROR_CODE[90003])
    })

    it('成功码 0 返回成功文案', () => {
      expect(messageOf(CODE.SUCCESS)).toBe('操作成功')
    })
  })

  describe('isTokenExpired —— 只有 20001 允许静默刷新', () => {
    it('20001（Access Token 过期）为真', () => {
      expect(isTokenExpired(CODE.TOKEN_EXPIRED)).toBe(true)
      expect(isTokenExpired(20001)).toBe(true)
    })

    it('★ 其余所有认证类码都为假（走错分支会导致无限刷新 → 触发风控）', () => {
      // 逐个排除而不是用「除了 20001 都为假」：
      // 显式列出更能让人看出每个码的语义归属。
      const notRefreshable = [
        CODE.TOKEN_MISSING, // 20000 没带令牌，刷新也没用
        CODE.LOGIN_EXPIRED, // 20002 登录已失效
        CODE.TOKEN_INVALID, // 20003 令牌伪造
        CODE.REFRESH_INVALID, // 20004 刷新凭证无效
        CODE.REFRESH_REUSED, // 20005 检测到重放，整族吊销
        CODE.PASSWORD_INCORRECT, // 20006 密码不对
        CODE.ACCOUNT_DISABLED, // 20007 账号停用
      ]
      for (const code of notRefreshable) {
        expect(isTokenExpired(code)).toBe(false)
      }
    })

    it('非认证类码为假', () => {
      expect(isTokenExpired(CODE.PARAM_INVALID)).toBe(false)
      expect(isTokenExpired(CODE.NOT_FOUND)).toBe(false)
      expect(isTokenExpired(CODE.INTERNAL_ERROR)).toBe(false)
      expect(isTokenExpired(CODE.SUCCESS)).toBe(false)
    })
  })

  describe('isLoginExpired —— 这 5 个码必须跳登录', () => {
    it('20002 / 20003 / 20004 / 20005 / 20000 全部为真', () => {
      expect(isLoginExpired(CODE.LOGIN_EXPIRED)).toBe(true) // 20002
      expect(isLoginExpired(CODE.TOKEN_INVALID)).toBe(true) // 20003
      expect(isLoginExpired(CODE.REFRESH_INVALID)).toBe(true) // 20004
      expect(isLoginExpired(CODE.REFRESH_REUSED)).toBe(true) // 20005
      expect(isLoginExpired(CODE.TOKEN_MISSING)).toBe(true) // 20000
    })

    it('★ 20001 不在其中 —— 它要先尝试刷新，刷新成功就无需跳登录', () => {
      // 这是 isTokenExpired 与 isLoginExpired 的分工边界：
      // 20001 走「静默刷新」，若这里也返回 true，
      // 用户每 15 分钟就会被踢到登录页一次。
      expect(isLoginExpired(CODE.TOKEN_EXPIRED)).toBe(false)
    })

    it('密码错误、账号停用等不跳登录（只提示，不清会话）', () => {
      // 20006 密码错误发生在登录接口上，本来就没会话可清；
      // 20007 账号停用要保留 token，否则用户无法看到停用原因。
      expect(isLoginExpired(CODE.PASSWORD_INCORRECT)).toBe(false)
      expect(isLoginExpired(CODE.ACCOUNT_DISABLED)).toBe(false)
    })

    it('业务码与系统码都不跳登录', () => {
      expect(isLoginExpired(CODE.FEELING_NOT_FOUND)).toBe(false)
      expect(isLoginExpired(CODE.PROFILE_INCOMPLETE)).toBe(false)
      expect(isLoginExpired(CODE.INTERNAL_ERROR)).toBe(false)
    })
  })

  describe('isAuthError —— 认证类区间判定', () => {
    it('20000 ≤ code < 30000 为真', () => {
      expect(isAuthError(20000)).toBe(true)
      expect(isAuthError(20011)).toBe(true)
      expect(isAuthError(29999)).toBe(true)
    })

    it('区间外为假', () => {
      expect(isAuthError(0)).toBe(false)
      expect(isAuthError(10001)).toBe(false)
      expect(isAuthError(30001)).toBe(false)
      expect(isAuthError(90003)).toBe(false)
    })

    it('两个判定函数不重叠：没有哪个码既刷新又跳登录', () => {
      // ★ 互斥性是刷新逻辑正确的前提。
      //   若某个码同时满足两者，refresh.ts 里的分支顺序
      //   就决定了行为，且改一处顺序就会静默改变语义。
      const all = Object.values(CODE)
      const both = all.filter((c) => isTokenExpired(c) && isLoginExpired(c))
      expect(both).toEqual([])
    })
  })

  describe('messageOfError —— catch 块里的文案出口', () => {
    // ★ messageOfError 遇到未登记结构时会 console.error（这是有意为之的
    //   「记日志便于定位」行为）。这里用 spy 静音，
    //   避免测试输出被预期内的日志刷屏 ——
    //   真出现未登记结构时，断言会失败，那才是需要看的信号。
    let errorSpy

    beforeEach(() => {
      errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
    })

    afterEach(() => {
      errorSpy.mockRestore()
    })

    it('带 code 的 HttpError 形态走 messageOf', () => {
      const msg = messageOfError({ code: CODE.PHONE_INVALID, layer: 'biz' })
      expect(msg).toBe(ERROR_CODE[10006])
      // 命中业务码时不该走「未登记」分支
      expect(errorSpy).not.toHaveBeenCalled()
    })

    it('code 为 0 时不当成业务错误（0 是成功码）', () => {
      // 若把 0 也当业务码，messageOf(0) 会返回「操作成功」，
      // catch 里弹出「操作成功」是明显的线上事故。
      const msg = messageOfError({ code: 0, message: '某个内部消息' })
      expect(msg).not.toBe(ERROR_CODE[0])
    })

    it('网络层常量原样透传（它们不在 ERROR_CODE 表里）', () => {
      expect(messageOfError({ message: NETWORK_ERROR })).toBe(NETWORK_ERROR)
      expect(messageOfError({ message: TIMEOUT_ERROR })).toBe(TIMEOUT_ERROR)
      expect(messageOfError({ message: LOGIN_EXPIRED })).toBe(LOGIN_EXPIRED)
      expect(messageOfError({ message: CANCELLED })).toBe(CANCELLED)
    })

    it('未登记的结构回落到通用文案，绝不把原始异常抛给用户', () => {
      // ★ 这条是安全边界：原始异常里可能含堆栈、内部路径、SQL 片段。
      //   直接展示等于泄露实现细节，且用户也看不懂。
      const msg = messageOfError({ message: 'PGECONNREFUSED 10.0.0.5:5432' })
      expect(msg).toBe(ERROR_CODE[90003])
      expect(msg).not.toContain('10.0.0.5')
      // 同时必须留下日志，否则线上出问题无从查起
      expect(errorSpy).toHaveBeenCalled()
    })

    it('null / undefined 也返回通用文案而不是崩溃', () => {
      expect(messageOfError(null)).toBe(ERROR_CODE[90003])
      expect(messageOfError(undefined)).toBe(ERROR_CODE[90003])
    })
  })

  describe('同源约束（与 scripts/check-error-codes.mjs 呼应）', () => {
    it('CODE 的键与 ERROR_CODE 的键完全对应', () => {
      const codeKeys = Object.values(CODE).sort((a, b) => a - b)
      const tableKeys = Object.keys(ERROR_CODE)
        .map(Number)
        .sort((a, b) => a - b)

      // ★ 前端私自加码会让同一个错误在三端显示不同说法，
      //   也让后端排查时对不上号（00 号第 ⑨ 条 / 05 号 T7）。
      //   真正的同源校验在 check-error-codes.mjs（逐字比对文案），
      //   这里只保证「码集合不漂移」，是它的前置条件。
      expect(codeKeys).toEqual(tableKeys)
    })

    it('所有业务码都是五位数字（0 与网络层除外）', () => {
      const bad = Object.values(CODE).filter((c) => c !== 0 && !/^\d{5}$/.test(String(c)))
      expect(bad).toEqual([])
    })
  })
})
