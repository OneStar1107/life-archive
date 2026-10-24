// core/http/retry.ts
// ══════════════════════════════════════════════════════════════
// 退避重试策略
// ══════════════════════════════════════════════════════════════
//
// 铁律（05 号 T5）：
//   1. **仅对幂等 GET 与网络类错误重试**，最多 2 次
//   2. 指数退避：500ms → 1500ms，**带随机抖动**（避免同时重试造成雪崩）
//   3. 以下情况**不重试**：
//      POST/PUT/PATCH/DELETE（非幂等，重试可能造成重复数据）
//      超时以外的 4xx（参数错了重试也没用）
//      401/403（要刷新令牌，不是重试能解决的）
//      主动取消（用户自己点的）
//   4. 若业务确实需要 POST 重试，必须携带 Idempotency-Key 头并由后端配合

import { RETRY_BASE_DELAY, MAX_RETRY } from '../env/env'
import { ERROR_LAYER, HTTP_METHOD, type HttpMethod, type HttpError } from './types'

/** 幂等方法白名单 */
const IDEMPOTENT: HttpMethod[] = [HTTP_METHOD.GET, HTTP_METHOD.HEAD]

/**
 * 是否应该重试。
 *
 * @param method 请求方法
 * @param err 上次失败的原因
 * @param retryCount 已重试次数
 * @param maxRetry 上限，默认取全局 MAX_RETRY（2）
 */
export function shouldRetry(
  method: HttpMethod,
  err: HttpError,
  retryCount: number,
  maxRetry: number = MAX_RETRY,
): boolean {
  // 1. 次数上限
  if (retryCount >= maxRetry) return false

  // 2. 主动取消不重试
  if (err.layer === ERROR_LAYER.CANCELLED) return false

  // 3. 只重试幂等方法
  if (!IDEMPOTENT.includes(method)) return false

  // 4. 只重试网络层错误与 5xx
  if (err.layer === ERROR_LAYER.NETWORK) return true
  if (err.layer === ERROR_LAYER.HTTP && err.httpStatus >= 500) return true

  // 5. 业务层与 4xx 一律不重试
  return false
}

/**
 * 退避时长：500ms → 1500ms（指数 ×3），带 ±25% 随机抖动。
 *
 * 抖动的作用：10 个请求同时失败时，若退避完全一致，
 * 它们会在同一毫秒一起重试，正好把刚恢复的服务再打垮。
 */
export function nextDelay(retryCount: number): number {
  const base = RETRY_BASE_DELAY * Math.pow(3, retryCount)
  // ±25% 抖动
  const jitter = base * 0.25 * (Math.random() * 2 - 1)
  return Math.max(0, Math.round(base + jitter))
}

/** 预估总耗时（用于超时预算判断） */
export function estimatedTotalDelay(maxRetry: number = MAX_RETRY): number {
  let sum = 0
  for (let i = 0; i < maxRetry; i++) {
    sum += RETRY_BASE_DELAY * Math.pow(3, i)
  }
  return sum
}
