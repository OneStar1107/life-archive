/**
 * frontend/tests/unit/cancel.test.js
 * ══════════════════════════════════════════════════════════════
 * 请求取消与竞态处理（★ 本文件在 CI 中真实执行并必须全绿）
 * ══════════════════════════════════════════════════════════════
 *
 * 为什么这层必须单测：
 *   取消与竞态是**最难在真机上稳定复现**的一类问题 ——
 *   「先发的请求后到」要靠特定网络时序才触发，
 *   人工点十次也未必碰到一次，但用户一定会在地铁里碰到。
 *
 *   而且它的失败后果是**数据错误而非报错**：
 *     · 竞态没守卫 → 用户选了「生气」，页面显示「难过」的候选词，
 *       还照着存进了数据库。三个月后回看，这条记录是错的。
 *     · 卸载没取消 → 回调写到已销毁页面的 ref 上，
 *       轻则内存泄漏，重则下个页面莫名其妙多了些数据。
 *
 * 被测模块 cancel.ts 无 uni 依赖（只有 setTimeout / clearTimeout）→ Node 可跑。
 */

import {
  RaceGuard,
  debounce,
  abortRegistry,
  cancelByKey,
  setAbortScope,
  clearAbortScope,
  getAbortScope,
} from '@/core/http/cancel'

describe('竞态守卫 RaceGuard (core/http/cancel)', () => {
  it('首次 next() 返回 1', () => {
    const g = new RaceGuard()
    expect(g.next()).toBe(1)
  })

  it('票据严格递增', () => {
    const g = new RaceGuard()
    const tickets = [g.next(), g.next(), g.next(), g.next()]
    expect(tickets).toEqual([1, 2, 3, 4])
  })

  it('最新票据 isCurrent 为真', () => {
    const g = new RaceGuard()
    const t = g.next()
    expect(g.isCurrent(t)).toBe(true)
  })

  it('★ 旧票据在有新请求后立即失效（这正是竞态守卫的用途）', () => {
    // 复现 pages/feeling/edit 的 refine 场景：
    //   用户快速点了「难受」→ 候选请求 A 发出
    //   又点了「生气」  → 候选请求 B 发出
    //   B 先回来了，A 后回来 —— A 必须被丢弃，
    //   否则用户看到「我选了生气，候选却是难过的词」。
    const g = new RaceGuard()
    const ticketA = g.next()
    const ticketB = g.next()

    expect(g.isCurrent(ticketA)).toBe(false) // A 已过期，必须丢弃
    expect(g.isCurrent(ticketB)).toBe(true) // B 才是最新
  })

  it('★ 连续三次切换时，只有最后一个票据有效', () => {
    const g = new RaceGuard()
    const t1 = g.next()
    const t2 = g.next()
    const t3 = g.next()

    expect([g.isCurrent(t1), g.isCurrent(t2), g.isCurrent(t3)]).toEqual([false, false, true])
  })

  it('reset() 后票据从 1 重新开始', () => {
    const g = new RaceGuard()
    g.next()
    g.next()
    g.reset()
    expect(g.next()).toBe(1)
  })

  it('reset() 后旧票据不再有效', () => {
    // 场景：页面复用同一个 RaceGuard 实例时，
    // reset 之后上一轮遗留的响应回来，必须被丢弃。
    const g = new RaceGuard()
    const old = g.next()
    g.reset()
    expect(g.isCurrent(old)).toBe(false)
  })

  it('每个实例独立计数（互不干扰）', () => {
    // ★ 为什么要这条：多个页面各自 new 一个 RaceGuard 是常态
    //   （edit.uvue 里的 refineGuard）。
    //   若用模块级变量实现，A 页面的请求会让 B 页面的票据失效。
    const a = new RaceGuard()
    const b = new RaceGuard()

    const ta = a.next()
    b.next()
    b.next()

    expect(a.isCurrent(ta)).toBe(true)
  })

  it('不传票据时 isCurrent 返回 false（不会误判为最新）', () => {
    // 防御性：调用方漏传票据时应该「宁可丢弃」而不是「全部放行」。
    const g = new RaceGuard()
    g.next()
    expect(g.isCurrent(undefined)).toBe(false)
  })
})

describe('防抖 debounce (core/http/cancel)', () => {
  beforeEach(() => {
    jest.useFakeTimers()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('★ 300ms 内的连续调用只执行最后一次', () => {
    // 场景：搜索框连续输入「生」「生气」「生气记」
    // 若不去抖，会发 3 个请求，且先发的可能后到 → 结果错乱。
    const fn = jest.fn()
    const debounced = debounce(fn, 300)

    debounced('生')
    debounced('生气')
    debounced('生气记')

    expect(fn).not.toHaveBeenCalled() // 还没到时间，一次都不该执行

    jest.advanceTimersByTime(300)

    expect(fn).toHaveBeenCalledTimes(1)
    expect(fn).toHaveBeenCalledWith('生气记') // 必须是最后一次的参数
  })

  it('间隔超过延时后正常执行', () => {
    const fn = jest.fn()
    const debounced = debounce(fn, 300)

    debounced('a')
    jest.advanceTimersByTime(300)
    expect(fn).toHaveBeenCalledTimes(1)
    expect(fn).toHaveBeenCalledWith('a')
  })

  it('两次独立调用各自执行一次', () => {
    const fn = jest.fn()
    const debounced = debounce(fn, 300)

    debounced('第一次')
    jest.advanceTimersByTime(300)
    debounced('第二次')
    jest.advanceTimersByTime(300)

    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('提前不足 300ms 时不执行（边界：299ms）', () => {
    const fn = jest.fn()
    const debounced = debounce(fn, 300)

    debounced('x')
    jest.advanceTimersByTime(299)
    expect(fn).not.toHaveBeenCalled()

    jest.advanceTimersByTime(1) // 补足到 300ms
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('★ 每次调用都会重置计时器（滑动窗口，不是固定窗口）', () => {
    // 固定窗口的实现会每 300ms 执行一次；
    // 正确的防抖是「最后一次调用后 300ms 才执行」。
    const fn = jest.fn()
    const debounced = debounce(fn, 300)

    for (let i = 0; i < 10; i++) {
      debounced(i)
      jest.advanceTimersByTime(200) // 每次间隔 200ms < 300ms
    }

    // 10 次调用跨度 2000ms，若按固定窗口会执行 6 次
    expect(fn).not.toHaveBeenCalled()

    jest.advanceTimersByTime(300)
    expect(fn).toHaveBeenCalledTimes(1)
    expect(fn).toHaveBeenCalledWith(9)
  })

  it('延时为 0 时也要等到下一个 tick 才执行', () => {
    // setTimeout(fn, 0) 是异步的：同步阶段绝不能已经执行。
    // 若改成「延时 0 就直接调用」，连续输入会退化成一请求一输入。
    const fn = jest.fn()
    const debounced = debounce(fn, 0)

    debounced('x')
    expect(fn).not.toHaveBeenCalled()

    jest.advanceTimersByTime(0)
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('不同 debounced 实例互不干扰', () => {
    const fnA = jest.fn()
    const fnB = jest.fn()
    const debouncedA = debounce(fnA, 300)
    const debouncedB = debounce(fnB, 300)

    debouncedA('a')
    debouncedB('b')
    jest.advanceTimersByTime(300)

    expect(fnA).toHaveBeenCalledTimes(1)
    expect(fnB).toHaveBeenCalledTimes(1)
  })
})

describe('取消域 abort scope (core/http/cancel)', () => {
  // ★ 每个用例都清域：abortRegistry 与 currentScope 都是模块级状态，
  //   不清理会造成用例间顺序依赖 —— 而 07 号 ⑦ 明令禁止顺序依赖。
  afterEach(() => {
    clearAbortScope()
    abortRegistry.abortAnonymous()
  })

  it('setAbortScope 设置后可读回', () => {
    setAbortScope('pages/feeling/edit')
    expect(getAbortScope()).toBe('pages/feeling/edit')
  })

  it('clearAbortScope 后为 null', () => {
    setAbortScope('pages/feeling/edit')
    clearAbortScope()
    expect(getAbortScope()).toBeNull()
  })

  it('空字符串等价于清空（不能把空串当有效 key）', () => {
    // 否则 cancelByKey('') 会误取消一批匿名请求。
    setAbortScope('')
    expect(getAbortScope()).toBeNull()
  })
})

describe('取消器注册表 abortRegistry (core/http/cancel)', () => {
  /**
   * ★ 本组用例涉及的 key。
   *
   * abortRegistry 内部是**模块级** Map（tasks / anonymous），
   * 不清理就会跨用例残留 —— 上一条用例注册的任务会被下一条的
   * abortByKey 一起数进去，计数断言随之飘忽。
   *
   * 这不只是「测试写得不严谨」：它正是 07 号 ⑦ 禁止的「顺序依赖」的典型形态。
   * 用例必须能任意顺序单独执行，所以每条用例结束后把状态清干净，
   * 而不是靠「前面的用例刚好把数据用完了」。
   */
  const KEYS = [
    'pages/health/index',
    'pages/memory/index',
    'pages/feeling/edit',
    'pages/journey/index',
    'pages/privacy/privacy',
    'pages/todo/index',
  ]

  afterEach(() => {
    for (const k of KEYS) abortRegistry.abortByKey(k)
    abortRegistry.abortAnonymous()
  })

  it('register 创建的任务初始为未取消', () => {
    const task = abortRegistry.register('pages/health/index')
    expect(task.aborted).toBe(false)
  })

  it('★ abortByKey 取消该 key 下的全部任务并返回数量', () => {
    // 场景：health 页 onUnload 时必须一次清掉所有在途请求，
    // 否则响应会打到已销毁的 ref 上。
    const k = 'pages/health/index'
    abortRegistry.register(k)
    abortRegistry.register(k)
    abortRegistry.register(k)

    const n = abortRegistry.abortByKey(k)

    expect(n).toBe(3)
  })

  it('★ 只取消指定 key，不影响其他 key（页面隔离）', () => {
    // ★ 这是最关键的一条：不能一取消就全清。
    //   用户从健康页跳到记忆页，健康页的 onUnload 触发取消，
    //   记忆页的请求必须继续跑 —— 否则页面刚打开就是空的。
    const a1 = abortRegistry.register('pages/health/index')
    const b1 = abortRegistry.register('pages/memory/index')

    abortRegistry.abortByKey('pages/health/index')

    expect(a1.aborted).toBe(true)
    expect(b1.aborted).toBe(false)
  })

  it('取消不存在的 key 返回 0，不抛异常', () => {
    // 页面可能压根没发过请求就退出了。
    expect(abortRegistry.abortByKey('从未使用过的页面')).toBe(0)
  })

  it('★ 重复取消同一个 key 第二次返回 0（幂等）', () => {
    // onUnload 可能被触发两次（某些端的生命周期行为），
    // 取消逻辑必须幂等，否则第二次会误报「取消了 N 个」。
    const k = 'pages/feeling/edit'
    abortRegistry.register(k)
    expect(abortRegistry.abortByKey(k)).toBe(1)
    expect(abortRegistry.abortByKey(k)).toBe(0)
  })

  it('unregister 后再取消该 key 不再计数', () => {
    // 请求正常完成后必须注销，否则 tasks Map 无限增长（内存泄漏）。
    const k = 'pages/feeling/edit'
    const task = abortRegistry.register(k)
    abortRegistry.unregister(k, task)

    expect(abortRegistry.abortByKey(k)).toBe(0)
  })

  it('全部任务 unregister 后 key 被回收', () => {
    const k = 'pages/feeling/edit'
    const t1 = abortRegistry.register(k)
    const t2 = abortRegistry.register(k)
    abortRegistry.unregister(k, t1)
    abortRegistry.unregister(k, t2)

    // key 彻底消失，abortByKey 拿不到任何任务
    expect(abortRegistry.abortByKey(k)).toBe(0)
  })

  it('无 key 的任务进匿名池', () => {
    const task = abortRegistry.register()
    expect(task.aborted).toBe(false)
    expect(abortRegistry.abortAnonymous()).toBeGreaterThanOrEqual(1)
    expect(task.aborted).toBe(true)
  })

  it('★ 带 key 的任务不受 abortAnonymous 影响', () => {
    // 两条通道必须分离：全局兜底清理不能误伤页面分组管理的任务。
    const keyed = abortRegistry.register('pages/journey/index')
    abortRegistry.abortAnonymous()
    expect(keyed.aborted).toBe(false)
  })

  it('unregister 一个未注册的任务不抛异常', () => {
    const k = 'pages/memory/index'
    const orphan = abortRegistry.register('别的 key')
    expect(() => abortRegistry.unregister(k, orphan)).not.toThrow()
  })

  it('cancelByKey 是 abortByKey 的函数式别名', () => {
    const k = 'pages/todo/index'
    abortRegistry.register(k)
    expect(cancelByKey(k)).toBe(1)
  })

  it('★ 大量任务下取消计数准确（防止只取消一部分）', () => {
    // 一次误判（比如遍历时用 break）会导致部分请求泄漏，
    // 症状是「偶尔进新页面数据是空的」，极难复现。
    const k = 'pages/privacy/privacy'
    const tasks = []
    for (let i = 0; i < 50; i++) tasks.push(abortRegistry.register(k))

    expect(abortRegistry.abortByKey(k)).toBe(50)
    expect(tasks.every((t) => t.aborted)).toBe(true)
  })
})
