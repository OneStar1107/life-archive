// core/http/cancel.ts
// ══════════════════════════════════════════════════════════════
// 请求取消与竞态处理
// ══════════════════════════════════════════════════════════════
//
// 解决两个真实场景（05 号 T6）：
//   1. 页面 onUnload 时，该页面的在途请求应全部中断，
//      否则回调会去更新已销毁页面的状态。
//   2. 搜索框连续输入时，前一个请求必须取消，
//      否则会出现「先发的后到」导致列表显示旧结果。

import type { AbortTask } from './types'

/** 活跃任务表：abortKey → 该 key 下的所有请求任务 */
const tasks = new Map<string, AbortTask[]>()

/** 全局任务表：无 key 的请求 */
const anonymous = new Set<AbortTask>()

/**
 * ★ 当前页面的自动取消键。
 *
 * 背景：service 层的每个方法签名都只有 (query)，
 *       如果要求每个方法都多带一个 abortKey 参数，12 个 service、60 个方法
 *       都要改，而且以后每加一个方法都容易忘。
 *
 * 方案：页面在 onLoad 时调用 `setAbortScope('pages/health/index')`，
 *       此后该页面发起的**所有**请求会自动归到这个 key 下；
 *       onUnload 时 `cancelByKey('pages/health/index')` 一次性全部取消。
 *
 * 这样页面层只需两行，且天然成对——不传就是全局请求，不受影响。
 */
let currentScope: string | null = null

/** 设置当前页面的取消域。页面 onLoad 调用。 */
export function setAbortScope(key: string): void {
  currentScope = key.length > 0 ? key : null
}

/** 清除当前取消域。页面 onUnload 调用（cancelByKey 之前）。 */
export function clearAbortScope(): void {
  currentScope = null
}

/** 取当前取消域 */
export function getAbortScope(): string | null {
  return currentScope
}

/**
 * 取消器注册表。
 * 页面用 `abortKey`（通常是页面路由）来分组管理自己的请求。
 */
export const abortRegistry = {
  /**
   * 注册一个任务。
   * @param key 分组键；为空则进匿名池
   */
  register(key?: string): AbortTask {
    let aborted = false
    const task: AbortTask = {
      abort: () => {
        aborted = true
      },
      get aborted(): boolean {
        return aborted
      },
    }

    if (key != null && key.length > 0) {
      const list = tasks.get(key)
      if (list != null) {
        list.push(task)
      } else {
        tasks.set(key, [task])
      }
    } else {
      anonymous.add(task)
    }
    return task
  },

  /** 任务完成后注销，避免 Map 无限增长 */
  unregister(key: string | undefined, task: AbortTask): void {
    if (key != null && key.length > 0) {
      const list = tasks.get(key)
      if (list != null) {
        const idx = list.indexOf(task)
        if (idx >= 0) list.splice(idx, 1)
        if (list.length === 0) tasks.delete(key)
      }
    } else {
      anonymous.delete(task)
    }
  },

  /** 取消某个 key 下的全部请求（页面卸载时调用） */
  abortByKey(key: string): number {
    const list = tasks.get(key)
    if (list == null) return 0
    for (const t of list) t.abort()
    tasks.delete(key)
    return list.length
  },

  /** 取消全部匿名请求 */
  abortAnonymous(): number {
    const n = anonymous.size
    for (const t of anonymous) t.abort()
    anonymous.clear()
    return n
  },
}

/**
 * 取消某个 key 下的全部请求。
 * ★ 页面 onUnload 中必须调用，否则请求回调会打到已销毁的页面上。
 */
export function cancelByKey(key: string): number {
  return abortRegistry.abortByKey(key)
}

/**
 * 防抖。
 * 搜索框输入场景：300ms 内的连续输入只发一次请求。
 */
export function debounce<T>(fn: (arg: T) => void, delay: number): (arg: T) => void {
  let timer: number | null = null
  return (arg: T): void => {
    if (timer != null) {
      clearTimeout(timer)
    }
    timer = setTimeout(() => {
      timer = null
      fn(arg)
    }, delay) as unknown as number
  }
}

/**
 * 竞态守卫。
 *
 * 典型用法：
 *   let guard = new RaceGuard()
 *   const ticket = guard.next()
 *   const res = await search(kw)
 *   if (!guard.isCurrent(ticket)) return   // 已有更新的请求发出，丢弃本次结果
 *   apply(res)
 */
export class RaceGuard {
  private seq: number = 0

  /** 取一个递增票据 */
  next(): number {
    this.seq += 1
    return this.seq
  }

  /** 该票据是否仍是最新 */
  isCurrent(ticket: number): boolean {
    return ticket === this.seq
  }

  /** 重置 */
  reset(): void {
    this.seq = 0
  }
}
