// core/http/request.ts
// ══════════════════════════════════════════════════════════════
// 请求内核：Promise 化 + 三层错误分类 + 401 单例刷新 + 退避重试
// ══════════════════════════════════════════════════════════════
//
// 设计原则（05 号）：
//   把网络的不确定性全部收敛在这一层。
//   业务调用方只需要 `await getXxx()`，
//   不需要关心 token 过期怎么办、断网了怎么提示。
//
// ★★★ 三个必须守住的点 ★★★
//   1. 绝对禁止只判 HTTP 200 就 resolve（必须看 body.code）
//   2. 401 只在 code === 20001 时走刷新；其余认证失败直接抛 LOGIN_EXPIRED
//   3. 禁止在拦截器里做页面跳转——只抛错误，由业务层订阅事件决策

import { BASE_URL, IS_DEV, TIMEOUT } from '../env/env'
import { getAccessToken } from '../storage/secure'
import { PLATFORM, deviceBrand, deviceModel, osVersionStr } from '../platform'
import {
  CANCELLED,
  CODE,
  LOGIN_EXPIRED,
  NETWORK_ERROR,
  TIMEOUT_ERROR,
  isLoginExpired,
  isTokenExpired,
  messageOf,
} from './error-code'
import { ERROR_LAYER, HTTP_METHOD, HttpError, type RequestConfig, type Result } from './types'
import { refreshToken } from './refresh'
import { shouldRetry, nextDelay } from './retry'
import { abortRegistry, getAbortScope } from './cancel'
import { emit } from './events'

// ────────────────────────────────────────────────────────────
// 全局限流冷却（429）
// ────────────────────────────────────────────────────────────
//
// ★ 后端全局限流 120 次/60s/IP（auth 接口更紧）。开发期反复 F5 + HMR 重载
//   很容易打满，一旦打满，整 60s 窗口内所有请求都会 429，页面就一直报错。
//
// 做法：收到 429 时记录「冷却截止时间」（优先读后端 X-RateLimit-Reset /
// Retry-After 头，否则兜底 60s）。冷却期内本层直接本地拒绝，不再打服务器，
// 既避免雪崩式重试，也让页面显示一句干净的话而不是每张卡都红。
let rateLimitUntil = 0
const RATE_LIMIT_DEFAULT_COOLDOWN = 60_000

/** 从响应头解析冷却时长（秒 → 毫秒） */
function parseRetryAfter(header: Record<string, string> | undefined): number {
  if (header == null) return RATE_LIMIT_DEFAULT_COOLDOWN
  const reset = header['X-RateLimit-Reset'] ?? header['x-ratelimit-reset']
  const retry = header['Retry-After'] ?? header['retry-after']
  const raw = reset ?? retry
  const sec = Number(raw)
  if (!Number.isNaN(sec) && sec > 0) return Math.max(1, Math.ceil(sec)) * 1000
  return RATE_LIMIT_DEFAULT_COOLDOWN
}

/** 进入限流冷却 */
function onRateLimited(header: Record<string, string> | undefined): void {
  const cooldown = parseRetryAfter(header)
  const now = Date.now()
  // ★ 取较晚的截止时间，避免连续 429 把冷却越拉越长（本地已拒绝就不会再 429）
  rateLimitUntil = Math.max(rateLimitUntil, now + cooldown)
  console.warn(`[request] 触发限流冷却，约 ${(cooldown / 1000).toFixed(0)}s 内不再请求`)
}

// ────────────────────────────────────────────────────────────
// 对外入口
// ────────────────────────────────────────────────────────────

/**
 * 发起请求并解包 data。
 *
 * @throws { HttpError} 所有失败路径都抛这个，调用方只需 try/catch 一处
 */
export function request<T>(config: RequestConfig): Promise<T> {
  return execute<T>(config, 0)
}

/** GET */
export function get<T>(url: string, params?: unknown, extra?: Partial<RequestConfig>): Promise<T> {
  return execute<T>(
    {
      url,
      method: HTTP_METHOD.GET,
      data: params,
      auth: true,
      showLoading: false,
      ...extra,
    },
    0,
  )
}

/** POST */
export function post<T>(url: string, data?: unknown, extra?: Partial<RequestConfig>): Promise<T> {
  return execute<T>({
    url,
    method: HTTP_METHOD.POST,
    data,
    auth: true,
    showLoading: false,
    ...extra,
  }, 0)
}

/** PATCH */
export function patch<T>(url: string, data?: unknown, extra?: Partial<RequestConfig>): Promise<T> {
  return execute<T>({
    url,
    method: HTTP_METHOD.PATCH,
    data,
    auth: true,
    showLoading: false,
    ...extra,
  }, 0)
}

/** PUT */
export function put<T>(url: string, data?: unknown, extra?: Partial<RequestConfig>): Promise<T> {
  return execute<T>({
    url,
    method: HTTP_METHOD.PUT,
    data,
    auth: true,
    showLoading: false,
    ...extra,
  }, 0)
}

/** DELETE */
export function del<T>(url: string, data?: unknown, extra?: Partial<RequestConfig>): Promise<T> {
  return execute<T>({
    url,
    method: HTTP_METHOD.DELETE,
    data,
    auth: true,
    showLoading: false,
    ...extra,
  }, 0)
}

// ────────────────────────────────────────────────────────────
// 内部实现
// ────────────────────────────────────────────────────────────

/**
 * @param retryCount 已重试次数，用于退避计算与上限控制
 */
function execute<T>(config: RequestConfig, retryCount: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    // ★ 限流冷却期内：本地直接拒绝，不再打服务器（避免雪崩 + 干净报错）
    if (Date.now() < rateLimitUntil) {
      reject(
        new HttpError(
          '操作太频繁，请稍后再试',
          ERROR_LAYER.HTTP,
          CODE.RATE_LIMITED,
          429,
          '',
          null,
          false,
        ),
      )
      return
    }
    const timeout = config.timeout ?? TIMEOUT
    const needAuth = config.auth !== false

    // 0. 解析取消键：显式传入优先，否则回落到当前页面的取消域。
    //    页面只需在 onLoad 调 setAbortScope()，本层自动给它的所有请求打标，
    //    onUnload 调 cancelByKey() 即可一次性取消，不必逐个方法传参。
    const abortKey = config.abortKey ?? getAbortScope() ?? undefined

    // 0.1 注册取消器（页面卸载时可中断）
    const task = abortRegistry.register(abortKey)

    if (task.aborted) {
      reject(new HttpError(CANCELLED, ERROR_LAYER.CANCELLED, 0, 0))
      return
    }

    // 1. 组装 header
    const header: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Platform': PLATFORM,
      'X-App-Version': currentVersion(),
      'X-Request-Id': requestId(),
      'X-Client-Channel': channel(),
      ...(config.header ?? {}),
    }

    if (needAuth) {
      const token = getAccessToken()
      if (token.length > 0) {
        header['Authorization'] = `Bearer ${token}`
      }
    }

    // 2. 发起
    uni.request({
      url: `${BASE_URL}${config.url}`,
      method: config.method,
      data: config.data,
      header,
      timeout,
      success: (res) => {
        abortRegistry.unregister(abortKey, task)
        handleSuccess<T>(res.statusCode, res.data as Result<T>, config, retryCount, resolve, reject, res.header)
      },
      fail: (err) => {
        abortRegistry.unregister(abortKey, task)
        handleFail<T>(err, config, retryCount, resolve, reject)
      },
    })
  })
}

// ────────────────────────────────────────────────────────────
// 成功路径：三层判定
// ────────────────────────────────────────────────────────────

function handleSuccess<T>(
  status: number,
  body: Result<T>,
  config: RequestConfig,
  retryCount: number,
  resolve: (v: T) => void,
  reject: (e: unknown) => void,
  header?: Record<string, string>,
): void {
  // ── HTTP 层 ──
  if (status === 401) {
    // ★ 唯一允许跳转相关的分支：认证失败
    handleUnauthorized(body, config, retryCount, resolve, reject)
    return
  }

  if (status < 200 || status >= 300) {
    // ★ 限流：进入冷却，避免整窗口内反复 429
    if (status === 429) {
      onRateLimited(header)
    }
    // ★ 后端的 4xx/5xx 同样带统一业务包装（{code, message}）——
    //   有业务码就用业务码，让「密码需含字母与数字」「手机号已注册」
    //   这类错误显示真实原因，而不是笼统的「参数格式有误」。
    //   401 已在上面单独处理，不会走到这里；layer 保持 HTTP，
    //   5xx 的重试判定（shouldRetry 看 HTTP 层 + httpStatus）不受影响。
    let errCode = httpStatusToCode(status)
    let errMsg = `服务异常（${status}）`
    const bizCode = body?.code
    if (
      typeof bizCode === 'number' &&
      bizCode > 0 &&
      bizCode != CODE.SUCCESS
    ) {
      errCode = bizCode
      if (body != null && body.message.length > 0) {
        errMsg = body.message
      }
    }
    const err = new HttpError(
      errMsg,
      ERROR_LAYER.HTTP,
      errCode,
      status,
      body?.traceId ?? '',
      null,
      // 5xx 允许重试，4xx 不重试（含 429）
      status >= 500,
    )
    maybeRetry<T>(err, config, retryCount, resolve, reject)
    return
  }

  // ── 业务层 ──
  // ★ 绝对禁止只判 HTTP 200 就 resolve
  if (body == null) {
    const err = new HttpError(
      '服务返回了空响应',
      ERROR_LAYER.HTTP,
      CODE.INTERNAL_ERROR,
      status,
      '',
      null,
      true,
    )
    maybeRetry<T>(err, config, retryCount, resolve, reject)
    return
  }

  if (body.code !== CODE.SUCCESS) {
    // 业务失败：不可重试（重试同样的入参不会变）
    const err = new HttpError(
      body.message.length > 0 ? body.message : messageOf(body.code),
      ERROR_LAYER.BIZ,
      body.code,
      status,
      body.traceId,
      body.data,
      false,
    )

    // 业务码里也可能有需要刷新的情况（理论上后端统一走 401，这里兜底）
    if (isTokenExpired(body.code) && !config.skipAuthRefresh) {
      handleTokenExpired(config, retryCount, resolve, reject)
      return
    }

    reject(err)
    return
  }

  // 成功
  resolve(body.data as T)
}

// ────────────────────────────────────────────────────────────
// 401 处理
// ────────────────────────────────────────────────────────────

/**
 * 收到 HTTP 401。
 * 只有 code === 20001（token 过期）才允许静默刷新；
 * 其余一律 LOGIN_EXPIRED，交由业务层跳登录。
 */
function handleUnauthorized<T>(
  body: Result<T>,
  config: RequestConfig,
  retryCount: number,
  resolve: (v: T) => void,
  reject: (e: unknown) => void,
): void {
  // 刷新接口自身收到 401：绝不能再刷新，否则无限递归
  if (config.skipAuthRefresh === true) {
    reject(
      new HttpError(
        body?.message ?? LOGIN_EXPIRED,
        ERROR_LAYER.BIZ,
        body?.code ?? CODE.LOGIN_EXPIRED,
        401,
        body?.traceId ?? '',
        null,
        false,
      ),
    )
    return
  }

  const code = body?.code ?? CODE.TOKEN_EXPIRED

  if (isTokenExpired(code)) {
    handleTokenExpired(config, retryCount, resolve, reject)
    return
  }

  if (isLoginExpired(code)) {
    // 刷新也救不了：通知业务层跳登录
    emit('auth:expired', code)
    reject(
      new HttpError(
        body?.message ?? LOGIN_EXPIRED,
        ERROR_LAYER.BIZ,
        code,
        401,
        body?.traceId ?? '',
        null,
        false,
      ),
    )
    return
  }

  reject(
    new HttpError(
      body?.message ?? '请先登录',
      ERROR_LAYER.BIZ,
      code,
      401,
      body?.traceId ?? '',
      null,
      false,
    ),
  )
}

/**
 * token 过期 → 走单例刷新锁 → 重放原请求（最多 1 次）。
 *
 * ★ 关键：10 个并发 401 全部 await 同一个 refreshingPromise，
 *   全程只发出 1 次 refresh 请求。
 */
function handleTokenExpired<T>(
  config: RequestConfig,
  retryCount: number,
  resolve: (v: T) => void,
  reject: (e: unknown) => void,
): void {
  // 已经重放过一次就不再重试
  if (retryCount > 0) {
    emit('auth:expired', CODE.TOKEN_EXPIRED)
    reject(new HttpError(LOGIN_EXPIRED, ERROR_LAYER.BIZ, CODE.LOGIN_EXPIRED, 401, '', null, false))
    return
  }

  refreshToken()
    .then((newToken: string) => {
      if (newToken.length === 0) {
        // 刷新失败：清凭证 + 抛 LOGIN_EXPIRED
        emit('auth:expired', CODE.LOGIN_EXPIRED)
        reject(new HttpError(LOGIN_EXPIRED, ERROR_LAYER.BIZ, CODE.LOGIN_EXPIRED, 401, '', null, false))
        return
      }
      // 重放原请求
      execute<T>(config, retryCount + 1).then(resolve).catch(reject)
    })
    .catch(() => {
      emit('auth:expired', CODE.LOGIN_EXPIRED)
      reject(new HttpError(LOGIN_EXPIRED, ERROR_LAYER.BIZ, CODE.LOGIN_EXPIRED, 401, '', null, false))
    })
}

// ────────────────────────────────────────────────────────────
// 失败路径：网络层
// ────────────────────────────────────────────────────────────

function handleFail<T>(
  err: { errMsg?: string },
  config: RequestConfig,
  retryCount: number,
  resolve: (v: T) => void,
  reject: (e: unknown) => void,
): void {
  const msg = err.errMsg ?? ''

  // 主动取消
  if (msg.includes('abort')) {
    reject(new HttpError(CANCELLED, ERROR_LAYER.CANCELLED, 0, 0))
    return
  }

  // 超时
  if (msg.includes('timeout')) {
    const e = new HttpError(
      TIMEOUT_ERROR,
      ERROR_LAYER.NETWORK,
      CODE.TIMEOUT,
      0,
      '',
      null,
      true, // 超时可重试
    )
    maybeRetry<T>(e, config, retryCount, resolve, reject)
    return
  }

  // 其他网络错误：DNS 失败 / SSL 握手失败 / 断网
  const e = new HttpError(
    NETWORK_ERROR,
    ERROR_LAYER.NETWORK,
    CODE.SERVICE_UNAVAILABLE,
    0,
    '',
    null,
    true,
  )
  // ★ 这里此前漏传 resolve，参数错位导致 reject===undefined：
  //   一旦走网络失败路径，maybeRetry 内部 reject(err) 直接抛
  //   「reject is not a function」，异常被吞，Promise 永不落地，
  //   页面就永远卡在骨架屏。
  maybeRetry(e, config, retryCount, resolve, reject)
}

// ────────────────────────────────────────────────────────────
// 重试
// ────────────────────────────────────────────────────────────

/**
 * 决定是否重试。
 *
 * 铁律（05 号 T5）：
 *   仅对**幂等 GET** 与**网络类错误**重试，最多 2 次；
 *   POST/PUT/PATCH/DELETE、超时以外的 4xx、401/403、主动取消一律不重试。
 */
function maybeRetry<T>(
  err: HttpError,
  config: RequestConfig,
  retryCount: number,
  resolve: (v: T) => void,
  reject: (e: unknown) => void,
): void {
  const maxRetry = config.retry ?? 0

  if (!shouldRetry(config.method, err, retryCount, maxRetry)) {
    reject(err)
    return
  }

  const delay = nextDelay(retryCount)
  setTimeout(() => {
    // 重试成功会走 resolve，失败会走 reject
    execute<T>(config, retryCount + 1).then(resolve).catch(reject)
  }, delay)
}

// ────────────────────────────────────────────────────────────
// 辅助
// ────────────────────────────────────────────────────────────

function httpStatusToCode(status: number): number {
  if (status === 401) return CODE.TOKEN_INVALID
  if (status === 403) return CODE.NO_PERMISSION
  if (status === 404) return CODE.NOT_FOUND
  if (status === 409) return CODE.ALREADY_EXISTS
  if (status === 413) return CODE.FILE_TOO_LARGE
  if (status === 415) return CODE.UNSUPPORTED_MEDIA_TYPE
  if (status === 429) return CODE.RATE_LIMITED
  if (status === 503) return CODE.SERVICE_UNAVAILABLE
  if (status === 504) return CODE.TIMEOUT
  if (status >= 500) return CODE.INTERNAL_ERROR
  return CODE.PARAM_INVALID
}

/**
 * uni.getAppBaseInfo() 里本次关心的四个版本字段。
 * ★ 写法与 pages/mine/settings.uvue 保持一致：字段缺失时运行时是 undefined，
 *   靠下面的 typeof 守卫兜住，不依赖编译期可选性。
 */
type VersionLike = {
  appVersion: string | number | null
  appVersionCode: string | number | null
  version: string | number | null
  versionCode: string | number | null
}

let versionCache: string = ''

/**
 * 应用版本（请求头 X-App-Version 用）。
 *
 * ★ 原来那句是病的：
 *     versionCache = `${info.version}+${info.versionCode}`
 *   GetAppBaseInfoResult 里**没有** versionCode 字段（只有 appVersionCode），
 *   version 也已废弃（它给的是**引擎版本号**，不是应用版本号）。
 *   模板字符串不会抛错，于是静默把 "1.0.0+undefined" 当成版本号发给后端 ——
 *   不崩、不报错，但版本号一直是错的。设置页的 loadVersion() 是同一处病根。
 *
 * ★ 取值口径与 pages/mine/settings.uvue 对齐：appVersion / appVersionCode 优先，
 *   取不到再回落已废弃的 version / versionCode，取值前一律做类型守卫。
 * ★ uni.getAppBaseInfo() 在 H5 下**是存在的**（不是原生端专属 API），
 *   只有整体不可用时才会落到 catch。
 */
function currentVersion(): string {
  if (versionCache.length > 0) return versionCache
  let name = ''
  let code = ''
  try {
    const info = uni.getAppBaseInfo() as unknown as VersionLike
    if (info != null) {
      if (typeof info.appVersion === 'string') name = info.appVersion
      else if (typeof info.appVersion === 'number') name = info.appVersion.toString()
      if (name.length === 0 && typeof info.version === 'string') name = info.version
      else if (name.length === 0 && typeof info.version === 'number') name = info.version.toString()

      if (typeof info.appVersionCode === 'string') code = info.appVersionCode
      else if (typeof info.appVersionCode === 'number') code = info.appVersionCode.toString()
      if (code.length === 0 && typeof info.versionCode === 'string') code = info.versionCode
      else if (code.length === 0 && typeof info.versionCode === 'number') code = info.versionCode.toString()
    }
  } catch (e) {
    // 整体取不到：走下面回落
  }
  if (name.length === 0) versionCache = '0.0.0'
  else versionCache = code.length > 0 ? name + '+' + code : name
  return versionCache
}

/** 渠道（HBuilderX 打包时写入） */
function channel(): string {
  try {
    const info = uni.getAppBaseInfo()
    return info.channel ?? 'dev'
  } catch (e) {
    return IS_DEV ? 'dev' : 'official'
  }
}

/** 请求 ID（UUID v4 形式，用于串日志） */
function requestId(): string {
  return (
    Math.random().toString(16).slice(2, 10) +
    Math.random().toString(16).slice(2, 10) +
    Math.random().toString(16).slice(2, 10)
  )
}

/** 设备摘要，仅用于后端日志归类，不含任何隐私 */
export function deviceSummary(): string {
  return `${PLATFORM}/${osVersionStr()}/${deviceBrand()}/${deviceModel()}`
}

export default {
  request,
  get,
  post,
  put,
  patch,
  del,
}
