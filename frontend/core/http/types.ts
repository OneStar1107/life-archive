// core/http/types.ts
// 网络层类型定义。

import type { CODE } from './error-code'

/** 后端统一响应体（02 号 T2） */
export type Result<T> = {
  code: number
  message: string
  data: T | null
  traceId: string
}

/** HTTP 方法常量（05 号禁止事项：禁止字符串硬写） */
export const HTTP_METHOD = {
  GET: 'GET',
  /** HEAD 语义上幂等（只取响应头），可安全重试 */
  HEAD: 'HEAD',
  POST: 'POST',
  PUT: 'PUT',
  PATCH: 'PATCH',
  DELETE: 'DELETE',
} as const

export type HttpMethod = (typeof HTTP_METHOD)[keyof typeof HTTP_METHOD]

/** 请求配置 */
export type RequestConfig = {
  url: string
  method: HttpMethod
  data?: unknown
  header?: Record<string, string>
  /** 是否需要鉴权（默认 true） */
  auth?: boolean
  /**
   * ★ 跳过 401 刷新。
   * 刷新接口自身必须置 true，否则会走 401 分支造成无限递归。
   */
  skipAuthRefresh?: boolean
  /** 覆盖默认 15s 超时 */
  timeout?: number
  /** 覆盖默认 0 次重试 */
  retry?: number
  /** 是否显示全局 loading */
  showLoading?: boolean
  /** 页面级取消器：页面卸载时用 */
  abortKey?: string
}

/** 错误三层分类（05 号 T3） */
export const ERROR_LAYER = {
  /** 网络层：DNS 失败 / SSL 失败 / 超时 / 断网 */
  NETWORK: 'network',
  /** HTTP 层：4xx / 5xx */
  HTTP: 'http',
  /** 业务层：data.code !== 0 */
  BIZ: 'biz',
  /** 主动取消 */
  CANCELLED: 'cancelled',
} as const

export type ErrorLayer = (typeof ERROR_LAYER)[keyof typeof ERROR_LAYER]

/** 归一化后的网络错误 */
export class HttpError extends Error {
  readonly layer: ErrorLayer
  readonly code: number
  readonly httpStatus: number
  readonly traceId: string
  readonly data: unknown
  /** 是否可重试 */
  readonly retryable: boolean
  /** 是否已重试过（避免死循环） */
  retried: boolean

  constructor(
    message: string,
    layer: ErrorLayer,
    code: number,
    httpStatus: number,
    traceId: string = '',
    data: unknown = null,
    retryable: boolean = false,
  ) {
    super(message)
    this.name = 'HttpError'
    this.layer = layer
    this.code = code
    this.httpStatus = httpStatus
    this.traceId = traceId
    this.data = data
    this.retryable = retryable
    this.retried = false
  }

  /** 是否为认证类错误 */
  isAuth(): boolean {
    return this.code >= 20000 && this.code < 30000
  }
}

/** 请求取消任务句柄 */
export type AbortTask = {
  abort: () => void
  readonly aborted: boolean
}

/** 分页入参 */
export type PageQuery = {
  page: number
  pageSize: number
}

/** 分页出参 */
export type PageResult<T> = {
  list: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
  hasNext: boolean
}

export type { CODE }
