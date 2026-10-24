// core/http/events.ts
// ══════════════════════════════════════════════════════════════
// 网络层事件总线
// ══════════════════════════════════════════════════════════════
//
// 为什么需要它（05 号 T4）：
//   ★ 禁止在拦截器/请求层里直接 `uni.redirectTo` 跳登录页。
//   理由有三：
//     1. 拦截器无法 mock 跳转，单测会死锁
//     2. 某些场景（如后台静默刷新）**不应该**跳转
//     3. 跳转是 UI 决策，不该由网络层替业务做
//
//   所以请求层只 emit 事件，由 App.uvue / auth store 订阅后决定怎么响应。

export type HttpEvent =
  /** 登录态彻底失效，需要跳登录。payload = 错误码 */
  | { name: 'auth:expired'; code: number }
  /** 网络断开 */
  | { name: 'net:offline' }
  /** 网络恢复 */
  | { name: 'net:online'; type: string }
  /** 全局错误提示（可选，默认关闭） */
  | { name: 'error:toast'; message: string; code: number }

type Handler = (payload: never) => void

const handlers = new Map<string, Handler[]>()

/** 订阅 */
export function on(event: HttpEvent['name'], handler: Handler): () => void {
  const list = handlers.get(event)
  if (list != null) {
    list.push(handler)
  } else {
    handlers.set(event, [handler])
  }
  // 返回取消订阅函数
  return () => off(event, handler)
}

/** 取消订阅 */
export function off(event: HttpEvent['name'], handler: Handler): void {
  const list = handlers.get(event)
  if (list == null) return
  const idx = list.indexOf(handler)
  if (idx >= 0) list.splice(idx, 1)
  if (list.length === 0) handlers.delete(event)
}

/** 触发 */
export function emit(event: HttpEvent): void {
  const list = handlers.get(event.name)
  if (list == null) return
  // 复制一份再遍历：回调里可能 off 掉自己
  const snapshot = list.slice()
  for (const h of snapshot) {
    try {
      ;(h as (p: unknown) => void)(event)
    } catch (e) {
      // 订阅方抛错不能影响网络层
      console.error(`[http] 事件处理器异常：${event.name}`)
    }
  }
}

/** 清空全部订阅（仅供测试） */
export function clearAll(): void {
  handlers.clear()
}
