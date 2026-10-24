/**
 * frontend/tests/unit/retry.test.js
 * ══════════════════════════════════════════════════════════════
 * 退避重试策略（★ 本文件在 CI 中真实执行并必须全绿）
 * ══════════════════════════════════════════════════════════════
 *
 * 为什么重试逻辑必须单测：
 *   shouldRetry 的每一次放宽或收紧都会直接变成线上事故，且都不会报错：
 *     · 放宽到 POST 也能重试 → 用户点「保存」点了三次，数据库里三条重复记录
 *     · 放宽到 4xx 也重试 → 参数写错时用户看着界面转圈 15 秒才知道自己填错了
 *     · 漏掉「主动取消」判断 → 用户离开页面后请求还在重试，白耗流量与电量
 *     · nextDelay 去掉抖动 → 10 个请求同时失败会同一毫秒一起重试，
 *       正好把刚恢复的服务再打垮（雪崩）
 *   这四条没有一条会在编译期或人工 review 里被发现。
 *
 * 被测模块 retry.ts 依赖 env.ts 的常量，两者都是纯数据 → Node 可直接跑。
 */

import { shouldRetry, nextDelay, estimatedTotalDelay } from '@/core/http/retry'
import { ERROR_LAYER, HTTP_METHOD } from '@/core/http/types'
import { MAX_RETRY, RETRY_BASE_DELAY } from '@/core/env/env'

/**
 * 构造一个 HttpError。
 *
 * ★ 刻意手写对象而不是 new HttpError(...)：
 *   shouldRetry 只读 layer / httpStatus / code 三个字段，
 *   用最小对象能让「测试依赖了哪些字段」一目了然 ——
 *   如果哪天实现改成读别的字段，这条测试会立刻失败提醒你。
 */
function httpError(layer, httpStatus = 0, code = 0) {
  return { layer, httpStatus, code, message: '测试用错误对象', traceId: 'test-trace' }
}

describe('退避重试策略 (core/http/retry)', () => {
  describe('shouldRetry —— 八种组合的完整判定', () => {
    it('① GET + 网络层错误（断网 / DNS / SSL）→ 重试', () => {
      // 用户在电梯里划一下，出来自动恢复，这是重试最有价值的场景
      expect(shouldRetry(HTTP_METHOD.GET, httpError(ERROR_LAYER.NETWORK), 0)).toBe(true)
    })

    it('② GET + HTTP 500 → 重试', () => {
      // 5xx 是服务端临时故障，重试有意义
      expect(shouldRetry(HTTP_METHOD.GET, httpError(ERROR_LAYER.HTTP, 500), 0)).toBe(true)
    })

    it('③ POST + 网络层错误 → 不重试（非幂等）', () => {
      // ★ 最危险的一条：POST 重试会造成重复数据。
      //   注意请求可能已经到达服务端只是响应丢了，
      //   此时重试 = 用户点一次保存，库里多一条。
      //   业务确实需要重试时，走 Idempotency-Key（05 号 T5 第 4 条）。
      expect(shouldRetry(HTTP_METHOD.POST, httpError(ERROR_LAYER.NETWORK), 0)).toBe(false)
    })

    it('④ GET + 4xx → 不重试（参数错了重试也没用）', () => {
      expect(shouldRetry(HTTP_METHOD.GET, httpError(ERROR_LAYER.HTTP, 400), 0)).toBe(false)
      expect(shouldRetry(HTTP_METHOD.GET, httpError(ERROR_LAYER.HTTP, 404), 0)).toBe(false)
      expect(shouldRetry(HTTP_METHOD.GET, httpError(ERROR_LAYER.HTTP, 422), 0)).toBe(false)
      expect(shouldRetry(HTTP_METHOD.GET, httpError(ERROR_LAYER.HTTP, 429), 0)).toBe(false)
    })

    it('⑤ GET + 401/403 → 不重试（要刷新令牌，不是重试能解决的）', () => {
      // ★ 401 走 refresh.ts 的静默刷新分支。
      //   如果这里返回 true，逻辑会变成「重试 2 次都 401，再重试 2 次」，
      //   令牌刷新的并发保护被绕过，直接触发风控。
      expect(shouldRetry(HTTP_METHOD.GET, httpError(ERROR_LAYER.HTTP, 401, 20001), 0)).toBe(false)
      expect(shouldRetry(HTTP_METHOD.GET, httpError(ERROR_LAYER.HTTP, 403, 30001), 0)).toBe(false)
    })

    it('⑥ 主动取消 → 不重试（用户自己点的，尊重用户意图）', () => {
      // 典型场景：用户在搜索框连续输入，前一个请求被 debounce 取消。
      // 如果还重试，用户已经不看这个结果了，纯浪费。
      expect(shouldRetry(HTTP_METHOD.GET, httpError(ERROR_LAYER.CANCELLED), 0)).toBe(false)
    })

    it('⑦ 超过重试上限 → 不重试', () => {
      // MAX_RETRY = 2，所以 retryCount 0/1 可重试，2 起不重试
      expect(MAX_RETRY).toBe(2)
      expect(shouldRetry(HTTP_METHOD.GET, httpError(ERROR_LAYER.NETWORK), 0)).toBe(true)
      expect(shouldRetry(HTTP_METHOD.GET, httpError(ERROR_LAYER.NETWORK), 1)).toBe(true)
      expect(shouldRetry(HTTP_METHOD.GET, httpError(ERROR_LAYER.NETWORK), 2)).toBe(false)
      expect(shouldRetry(HTTP_METHOD.GET, httpError(ERROR_LAYER.NETWORK), 3)).toBe(false)
    })

    it('⑧ GET + 超时 → 重试', () => {
      // 超时属于网络层（ERROR_LAYER.NETWORK，request.ts 归一化时这么分）
      expect(shouldRetry(HTTP_METHOD.GET, httpError(ERROR_LAYER.NETWORK, 0, 90006), 0)).toBe(true)
    })

    it('业务层错误（data.code !== 0）一律不重试', () => {
      // 业务失败是**确定性的**：比如「强度必须在 1~10 之间」，
      // 再发一百次结果都一样，只会拖慢界面。
      expect(shouldRetry(HTTP_METHOD.GET, httpError(ERROR_LAYER.BIZ, 200, 50003), 0)).toBe(false)
      expect(shouldRetry(HTTP_METHOD.GET, httpError(ERROR_LAYER.BIZ, 200, 40005), 0)).toBe(false)
    })
  })

  describe('shouldRetry —— 幂等方法白名单', () => {
    it('GET 可重试（幂等）', () => {
      expect(shouldRetry(HTTP_METHOD.GET, httpError(ERROR_LAYER.NETWORK), 0)).toBe(true)
    })

    it('★ HEAD 与 GET 一样可重试（HEAD 语义上幂等，只取响应头）', () => {
      // 这条用例最初是 it.todo：写它的时候 HTTP_METHOD 缺 HEAD 键，
      // 导致 retry.ts 的 IDEMPOTENT 白名单实际是 ['GET', undefined]，
      // HEAD 请求不被当作幂等。
      // 现已补上 HEAD: 'HEAD'，这里从 todo 转成了正式断言 ——
      // 目的不是「记录曾经坏过」，而是防止 HEAD 键被再次误删。
      //
      // ★ 回归症状很隐蔽：HEAD 少了一次重试不会报错，
      //   只在「探测接口偶发失败」时让人多等一轮。
      expect(HTTP_METHOD.HEAD).toBe('HEAD')
      expect(shouldRetry(HTTP_METHOD.HEAD, httpError(ERROR_LAYER.NETWORK), 0)).toBe(true)
      expect(shouldRetry(HTTP_METHOD.HEAD, httpError(ERROR_LAYER.HTTP, 503), 0)).toBe(true)
    })

    it('PUT / PATCH / DELETE 都不重试', () => {
      // ★ DELETE 尤其危险：网络抖动后重试 DELETE，
      //   第二次会返回「不存在」，用户看到「删除失败」但东西其实已经删了。
      for (const m of [HTTP_METHOD.PUT, HTTP_METHOD.PATCH, HTTP_METHOD.DELETE]) {
        expect(shouldRetry(m, httpError(ERROR_LAYER.NETWORK), 0)).toBe(false)
      }
    })
  })

  describe('shouldRetry —— 上限参数可覆盖', () => {
    it('显式传入 maxRetry=0 时一次都不重试', () => {
      // 用于「用户手动点重试」的场景：只试一次，不自动重试，
      // 免得用户以为没响应又狂点。
      expect(shouldRetry(HTTP_METHOD.GET, httpError(ERROR_LAYER.NETWORK), 0, 0)).toBe(false)
    })

    it('显式传入更大的 maxRetry 时按新上限走', () => {
      expect(shouldRetry(HTTP_METHOD.GET, httpError(ERROR_LAYER.NETWORK), 3, 5)).toBe(true)
      expect(shouldRetry(HTTP_METHOD.GET, httpError(ERROR_LAYER.NETWORK), 5, 5)).toBe(false)
    })

    it('判定顺序：次数上限优先于其他所有条件', () => {
      // 即使是可重试的组合，超次数也必须返回 false。
      // 顺序反了会导致「超次数的 POST 也重试」之类的诡异行为。
      expect(shouldRetry(HTTP_METHOD.POST, httpError(ERROR_LAYER.NETWORK), 99, 2)).toBe(false)
    })
  })

  describe('nextDelay —— 指数退避 + 抖动', () => {
    it('退避基数正确（500ms → 1500ms）', () => {
      expect(RETRY_BASE_DELAY).toBe(500)
      // 第 0 次重试：500ms ± 25%  → [375, 625]
      const d0 = nextDelay(0)
      expect(d0).toBeGreaterThanOrEqual(375)
      expect(d0).toBeLessThanOrEqual(625)
    })

    it('★ 单调递增：第 n 次的延迟区间严格高于第 n-1 次', () => {
      // 为什么重要：退避不递增等于没退避，
      // 服务端刚扛住一轮又被打一次，永远起不来。
      for (let i = 1; i <= 4; i++) {
        // 每个区间取下界比较，避免抖动造成的随机相等导致 flaky
        const prevMax = RETRY_BASE_DELAY * Math.pow(3, i - 1) * 1.25
        const curMin = RETRY_BASE_DELAY * Math.pow(3, i) * 0.75
        expect(curMin).toBeGreaterThan(prevMax)
      }
    })

    it('抖动范围在 ±25% 以内', () => {
      // 采样验证：Math.random 若被误改成常量或反向，这里会炸
      for (let i = 0; i < 3; i++) {
        for (let n = 0; n < 200; n++) {
          const base = RETRY_BASE_DELAY * Math.pow(3, i)
          const d = nextDelay(i)
          expect(d).toBeGreaterThanOrEqual(Math.floor(base * 0.75))
          expect(d).toBeLessThanOrEqual(Math.ceil(base * 1.25))
        }
      }
    })

    it('★ 抖动确实生效：同一 retryCount 多次取值不全相同', () => {
      // ★ 这是抖动的**核心目的**：避免同时失败的请求在同一毫秒一起重试。
      //   如果去掉抖动，10 个请求会精确地在同一时刻打向刚恢复的服务。
      const samples = new Set()
      for (let n = 0; n < 50; n++) samples.add(nextDelay(0))
      // 50 次采样至少要有多个不同值（纯抖动下几乎不可能全撞）
      expect(samples.size).toBeGreaterThan(1)
    })

    it('返回整数（setTimeout 传小数在部分端行为不一致）', () => {
      for (let i = 0; i < 50; i++) {
        expect(Number.isInteger(nextDelay(i))).toBe(true)
      }
    })

    it('永不返回负数（负的 setTimeout 会被当 0，立即重试等于没退避）', () => {
      for (let i = 0; i < 50; i++) {
        expect(nextDelay(i)).toBeGreaterThanOrEqual(0)
      }
    })
  })

  describe('estimatedTotalDelay —— 超时预算预估', () => {
    it('默认 2 次重试的预估总耗时为 500 + 1500 = 2000ms', () => {
      // ★ 为什么要算这个：网络层 TIMEOUT 是 15s。
      //   如果重试总耗时接近或超过它，外层超时会先触发，
      //   内层的退避就白设了 —— 用户看到的是「超时」而不是「正在重试」。
      expect(estimatedTotalDelay()).toBe(2000)
    })

    it('★ 重试总耗时必须远小于外层超时（留出 5 倍以上余量）', () => {
      // 15s / 2s = 7.5 倍。
      // 为什么要求 5 倍而不是更严：留出的 13 秒要够一次真实请求往返
      // （含 TLS 握手与后端处理），否则重试机制等于没生效。
      const TIMEOUT = 15000
      expect(TIMEOUT / estimatedTotalDelay()).toBeGreaterThan(5)
    })

    it('0 次重试时预估为 0', () => {
      expect(estimatedTotalDelay(0)).toBe(0)
    })

    it('重试次数增加时预估总耗时递增', () => {
      const d1 = estimatedTotalDelay(1)
      const d2 = estimatedTotalDelay(2)
      const d3 = estimatedTotalDelay(3)
      expect(d2).toBeGreaterThan(d1)
      expect(d3).toBeGreaterThan(d2)
    })
  })

  describe('策略整体一致性', () => {
    it('★ 可重试的组合：只有「幂等方法 + 网络层/5xx + 未超次数」三者同时满足', () => {
      // 穷举所有组合，确认判定逻辑是这三个条件的交集，
      // 没有任何隐含的第四个条件。
      const methods = Object.values(HTTP_METHOD)
      const layers = [
        { layer: ERROR_LAYER.NETWORK, httpStatus: 0 },
        { layer: ERROR_LAYER.HTTP, httpStatus: 500 },
        { layer: ERROR_LAYER.HTTP, httpStatus: 400 },
        { layer: ERROR_LAYER.BIZ, httpStatus: 200 },
        { layer: ERROR_LAYER.CANCELLED, httpStatus: 0 },
      ]

      const retryable = []
      for (const m of methods) {
        for (const l of layers) {
          if (shouldRetry(m, httpError(l.layer, l.httpStatus), 0)) {
            retryable.push(`${m}+${l.layer}${l.httpStatus || ''}`)
          }
        }
      }

      // 期望：GET / HEAD × (NETWORK, HTTP5xx)
      expect(retryable.sort()).toEqual([
        'GET+http500',
        'GET+network',
        'HEAD+http500',
        'HEAD+network',
      ])
    })

    it('★ 漏传 method（undefined）不会被当成幂等', () => {
      // ★ 这条守的是一个已经修掉、但极易复发的坑：
      //   当 HTTP_METHOD 缺 HEAD 键时，IDEMPOTENT 实际是 ['GET', undefined]，
      //   于是 `IDEMPOTENT.includes(undefined)` 为 true ——
      //   任何漏传 method 的调用都会被当成幂等方法而重试，
      //   对 POST 来说就是重复数据。
      //
      //   症状是「某个新接口偶尔发出两次请求」，极难定位，
      //   所以把它钉成断言而不是靠人记住。
      const net = httpError(ERROR_LAYER.NETWORK)
      expect(shouldRetry(undefined, net, 0)).toBe(false)
      expect(shouldRetry(null, net, 0)).toBe(false)
      expect(shouldRetry('', net, 0)).toBe(false)
    })

    it('HTTP_METHOD 的每个键都是非空的合法方法名', () => {
      // 白名单里混进 undefined 的根源就是常量缺键或键值为空，
      // 从源头断言比在 retry.ts 里防更省事。
      for (const [key, value] of Object.entries(HTTP_METHOD)) {
        expect(typeof value).toBe('string')
        expect(value.length).toBeGreaterThan(0)
        expect(value).toBe(key) // 键名与值一致（GET: 'GET'）
      }
    })
  })
})
