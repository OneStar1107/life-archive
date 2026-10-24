// core/http/refresh.ts
// ══════════════════════════════════════════════════════════════
// Token 单例刷新锁
// ══════════════════════════════════════════════════════════════
//
// ★★★ 这是 05 号 T4 明确的「最容易写错」之处 ★★★
//
// 场景：用户冷启动时 App 同时发起 10 个业务请求，
//       access token 已过期 → 10 个请求都收到 20001。
//       若每个请求各自去刷新，就会：
//         1. 发出 10 次 refresh 请求
//         2. 后端是轮换式刷新：第 1 次成功，2~10 次全被判定为「重放攻击」
//         3. 整个令牌族被吊销 → 用户被莫名踢下线
//
// 解法：**单例 refreshingPromise**。
//       第一个遇到 401 的请求发起刷新并把 Promise 存起来，
//       其余 9 个 await 同一个 Promise，全过程只发出 1 次 refresh。

import { CODE } from './error-code'
import {
  getAccessToken,
  getRefreshToken,
  removeAccessToken,
  removeRefreshToken,
  removeUserInfo,
  setAccessToken,
  setRefreshToken,
} from '../storage/secure'
import { BASE_URL, TIMEOUT } from '../env/env'
import { HTTP_METHOD, type Result } from './types'
import { PLATFORM } from '../platform'

/** ★ 核心：全局唯一的刷新 Promise */
let refreshingPromise: Promise<boolean> | null = null

/** 刷新中的监听者计数，用于日志与调试 */
let waitingCount: number = 0

/**
 * 是否正在刷新中。供请求内核判断是否应排队等待。
 */
export function isRefreshing(): boolean {
  return refreshingPromise !== null
}

/**
 * 拿令牌（单例刷新锁）。
 *
 * @returns 成功返回新 accessToken；失败返回空串（调用方应抛 LOGIN_EXPIRED）
 */
export function refreshToken(): Promise<string> {
  // 情况 1：已经在刷新 → 直接挂到同一个 Promise 上
  if (refreshingPromise !== null) {
    waitingCount += 1
    return refreshingPromise.then((ok: boolean) => {
      if (ok) return getAccessToken()
      return ''
    })
  }

  // 情况 2：没人刷新 → 我们来发起，并锁住
  refreshingPromise = doRefresh()
  waitingCount = 1

  // 无论成败，最终都要释放锁，否则后续 401 会永久排队等待
  refreshingPromise = refreshingPromise.finally(() => {
    refreshingPromise = null
    waitingCount = 0
  })

  return refreshingPromise.then((ok: boolean) => {
    if (ok) return getAccessToken()
    return ''
  })
}

/**
 * 实际发起刷新请求。
 * ★ 关键点：这是**唯一**允许绕过 401 分支的路径。
 *   刷新接口自己返回 401 时绝不能再触发刷新，否则无限递归。
 */
function doRefresh(): Promise<boolean> {
  const rt = getRefreshToken()
  if (rt.length === 0) {
    return Promise.resolve(false)
  }

  return new Promise<boolean>((resolve) => {
    uni.request({
      url: `${BASE_URL}/auth/refresh`,
      method: HTTP_METHOD.POST,
      data: { refreshToken: rt },
      header: {
        'Content-Type': 'application/json',
        'X-Platform': PLATFORM,
        // ★ 不带 Authorization：刷新接口靠 body 里的 refreshToken 认证
      },
      timeout: TIMEOUT,
      success: (res) => {
        const status = res.statusCode
        if (status < 200 || status >= 300) {
          // 网络层或 HTTP 层失败
          if (status === 401) {
            // 刷新凭证本身失效 → 必须重新登录
            clearTokens()
          }
          resolve(false)
          return
        }

        const body = res.data as Result<{ accessToken: string; refreshToken: string }>
        if (body == null || body.code !== CODE.SUCCESS) {
          if (body != null && body.code === CODE.REFRESH_REUSED) {
            // ★ 重放攻击：整族已被吊销，必须重新登录
            clearTokens()
          }
          resolve(false)
          return
        }

        const tokens = body.data
        if (tokens == null || tokens.accessToken.length === 0) {
          resolve(false)
          return
        }

        // ★ 轮换成功：旧 refresh 已被后端作废，必须换成新的
        setTokens(tokens.accessToken, tokens.refreshToken)
        resolve(true)
      },
      fail: () => {
        // 网络失败：不清 token，下次请求会再试
        resolve(false)
      },
    })
  })
}

/** 写入新令牌（走安全存储抽象，不直接调 uni.setStorageSync） */
function setTokens(accessToken: string, refreshToken: string): void {
  setAccessToken(accessToken)
  setRefreshToken(refreshToken)
}

/** 清除全部登录态 */
export function clearTokens(): void {
  removeAccessToken()
  removeRefreshToken()
  removeUserInfo()
}

/**
 * 强制重置刷新锁。
 * 仅供测试使用；生产代码不应调用。
 */
export function __resetRefreshLockForTest(): void {
  refreshingPromise = null
  waitingCount = 0
}

/** 调试信息：本次刷新有多少请求在排队 */
export function refreshQueueSize(): number {
  return waitingCount
}
