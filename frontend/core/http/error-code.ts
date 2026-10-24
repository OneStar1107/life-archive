// core/http/error-code.ts
// ══════════════════════════════════════════════════════════════
// ★ 与后端 backend/src/common/constants/error-codes.ts 严格同源 ★
// ══════════════════════════════════════════════════════════════
//
// 生成源：docs/api/error-codes.json（由 `pnpm gen:openapi` 导出）
// 校验命令：node scripts/check-error-codes.mjs
//
// 铁律（05 号 T7 / 禁止事项第 8 条）：
//   **禁止前端自定义新的错误码数字。**
//   需要新码时必须回后端加，然后两边同步。

/** 后端错误码编号（与后端 ErrorCode 枚举一致） */
export const CODE = {
  SUCCESS: 0,

  // 1xxxx 参数 / 校验
  PARAM_INVALID: 10001,
  PARAM_MISSING: 10002,
  BODY_INVALID: 10003,
  QUERY_INVALID: 10004,
  PATH_INVALID: 10005,
  PHONE_INVALID: 10006,
  EMAIL_INVALID: 10007,
  PASSWORD_WEAK: 10008,
  PAGINATION_INVALID: 10009,
  DATE_RANGE_INVALID: 10010,
  CONTENT_TOO_LONG: 10011,
  UNSUPPORTED_MEDIA_TYPE: 10012,
  FILE_TOO_LARGE: 10013,

  // 2xxxx 认证
  TOKEN_MISSING: 20000,
  TOKEN_EXPIRED: 20001,
  LOGIN_EXPIRED: 20002,
  TOKEN_INVALID: 20003,
  REFRESH_INVALID: 20004,
  REFRESH_REUSED: 20005,
  PASSWORD_INCORRECT: 20006,
  ACCOUNT_DISABLED: 20007,
  SMS_CODE_INVALID: 20008,
  SMS_CODE_EXPIRED: 20009,
  SMS_TOO_FREQUENT: 20010,
  CREDENTIALS_INCOMPLETE: 20011,

  // 3xxxx 权限
  NO_PERMISSION: 30001,
  FORBIDDEN_RESOURCE: 30002,
  NOT_RESOURCE_OWNER: 30003,
  ROLE_INSUFFICIENT: 30004,
  QUIET_HOURS_ACTIVE: 30005,
  CONSENT_REQUIRED: 30006,

  // 4xxxx 资源
  NOT_FOUND: 40001,
  ALREADY_EXISTS: 40002,
  USER_NOT_FOUND: 40003,
  MEMORY_NOT_FOUND: 40004,
  FEELING_NOT_FOUND: 40005,
  JOURNEY_NOT_FOUND: 40006,
  TODO_NOT_FOUND: 40007,
  INSIGHT_NOT_FOUND: 40008,
  HEALTH_METRIC_NOT_FOUND: 40009,
  PROFILE_NOT_FOUND: 40010,
  FILE_NOT_FOUND: 40011,
  RELATION_SELF_LOOP: 40012,
  RELATION_EXISTS: 40013,

  // 5xxxx 业务
  PROFILE_INCOMPLETE: 50001,
  MEMORY_TITLE_REQUIRED: 50002,
  FEELING_INTENSITY_INVALID: 50003,
  HEALTH_METRIC_VALUE_INVALID: 50004,
  JOURNEY_DATE_INVALID: 50005,
  TODO_ALREADY_DONE: 50006,
  INSIGHT_ALREADY_ADOPTED: 50007,
  DATA_SOURCE_NOT_CONNECTED: 50008,
  DAILY_CHECKIN_DUPLICATE: 50009,
  MEMORY_INSUFFICIENT_FOR_INSIGHT: 50010,

  // 9xxxx 系统
  SERVICE_UNAVAILABLE: 90001,
  DATABASE_ERROR: 90002,
  INTERNAL_ERROR: 90003,
  RATE_LIMITED: 90004,
  UPSTREAM_ERROR: 90005,
  TIMEOUT: 90006,
  NOT_IMPLEMENTED: 90007,
  STORAGE_ERROR: 90008,
  MAINTENANCE_MODE: 90009,
} as const

/**
 * 错误码 → 中文可展示文案。
 * ★ 文案必须与后端 ERROR_CODE_MESSAGE 逐字一致，
 *   否则同一个错误三端会显示不同说法。
 */
export const ERROR_CODE: Record<number, string> = {
  0: '操作成功',

  10001: '参数格式有误，请检查后重试',
  10002: '缺少必要参数',
  10003: '请求内容格式有误',
  10004: '查询参数有误',
  10005: '请求路径有误',
  10006: '手机号格式有误',
  10007: '邮箱格式有误',
  10008: '密码强度不足，至少 8 位且包含字母与数字',
  10009: '分页参数有误',
  10010: '日期区间有误',
  10011: '内容超出长度限制',
  10012: '不支持的文件类型',
  10013: '文件超出大小限制',

  20000: '请先登录',
  20001: '登录状态已过期，正在重新登录',
  20002: '登录已失效，请重新登录',
  20003: '身份凭证无效，请重新登录',
  20004: '刷新凭证无效，请重新登录',
  20005: '检测到异常登录，为安全起见请重新登录',
  20006: '手机号或密码不正确',
  20007: '账号已被停用，如有疑问请联系客服',
  20008: '验证码不正确',
  20009: '验证码已过期，请重新获取',
  20010: '验证码发送过于频繁，请稍后再试',
  20011: '请填写手机号或邮箱中的一项',

  30001: '您没有执行此操作的权限',
  30002: '禁止访问该资源',
  30003: '只能操作自己的数据',
  30004: '当前身份权限不足',
  30005: '现在是你的免打扰时段，我先不打扰你',
  30006: '请先同意隐私政策后继续',

  40001: '内容不存在或已被删除',
  40002: '数据已存在',
  40003: '用户不存在',
  40004: '这条记忆不存在或已被删除',
  40005: '这次感受记录不存在或已被删除',
  40006: '这段旅途不存在或已被删除',
  40007: '该待办不存在或已被删除',
  40008: '该洞察不存在或已被删除',
  40009: '该健康记录不存在或已被删除',
  40010: '资料尚未建立',
  40011: '文件不存在或已过期',
  40012: '不能把记忆关联到它自己',
  40013: '这两个记忆之间已经有这条关联了',

  50001: '资料还没填完，先补齐 basics 我们就能开始了',
  50002: '给这条记忆起个名字吧',
  50003: '感受强度需要在 1 到 10 之间',
  50004: '身体信号数值超出合理范围',
  50005: '旅途的结束时间不能早于开始时间',
  50006: '这件事已经完成了',
  50007: '这条洞察你已经采纳过了',
  50008: '还没有连接这个数据来源',
  50009: '今天已经打过卡啦，明天再来',
  50010: '再多记几件事，我就能看出规律了',

  90001: '服务暂时不可用，请稍后再试',
  90002: '数据处理失败，请稍后再试',
  90003: '开小差了，请稍后再试',
  90004: '操作太频繁，请稍后再试',
  90005: '上游服务异常，请稍后再试',
  90006: '请求超时，请稍后重试',
  90007: '该功能正在路上',
  90008: '文件存储异常，请稍后再试',
  90009: '正在维护中，请稍后再来',
}

/**
 * 纯前端网络层常量。
 * 这三个不是后端业务码，只用于表达「连不上服务器」这一类状态。
 * 它们不出现在 ERROR_CODE 表里，因为后端不会返回它们。
 */
export const NETWORK_ERROR: string = '网络连接失败，请检查网络后重试'
export const TIMEOUT_ERROR: string = '请求超时，请稍后重试'
export const LOGIN_EXPIRED: string = '登录已失效，请重新登录'
export const CANCELLED: string = '请求已取消'

/** 取错误码对应的中文文案；未登记的码回落到通用系统错误 */
export function messageOf(code: number): string {
  const m = ERROR_CODE[code]
  return m != null ? m : ERROR_CODE[90003]
}

/** 是否为认证类错误（20000 ≤ code < 30000） */
export function isAuthError(code: number): boolean {
  return code >= 20000 && code < 30000
}

/** 是否为「Access Token 过期」——只有这一类允许走静默刷新 */
export function isTokenExpired(code: number): boolean {
  return code === CODE.TOKEN_EXPIRED
}

/** 是否为「刷新也无效，必须跳登录」 */
export function isLoginExpired(code: number): boolean {
  return (
    code === CODE.LOGIN_EXPIRED ||
    code === CODE.TOKEN_INVALID ||
    code === CODE.REFRESH_INVALID ||
    code === CODE.REFRESH_REUSED ||
    code === CODE.TOKEN_MISSING
  )
}

/**
 * ★ 页面层唯一的错误文案出口（05 号 T7）。
 *
 * 为什么不让页面直接 catch(e)然后自己拼文案：
 *   1. 同一个错误三端会显示不同说法（比如「网络连接失败」vs「网络不给力」），
 *      用户会以为是两个不同的故障。
 *   2. 页面自定义文案会与后端 ERROR_CODE_MESSAGE 漂移，
 *      check-error-codes.mjs 也校验不到 UI 上的字。
 *
 * 用法（catch 里必须调它，否则等于吞错误）：
 *   try {
 *     await load()
 *   } catch (e) {
 *     console.error('[index] 加载失败', e)
 *     errMsg.value = messageOfError(e)
 *   }
 *
 * @param e catch 出来的任意值（HttpError / 未知结构 / 字符串）
 */
export function messageOfError(e: unknown): string {
  if (e == null) return ERROR_CODE[90003]

  // HttpError 的形态：{ layer, code, message, ... }
  const err = e as { code?: unknown; message?: unknown; layer?: unknown }
  const code = err.code
  if (typeof code === 'number' && code !== 0) {
    return messageOf(code)
  }

  // 网络层错误自带 message（NETWORK_ERROR / TIMEOUT_ERROR / LOGIN_EXPIRED / CANCELLED），
  // 它们是常量而非业务码，不在 ERROR_CODE 表里，所以单独放行。
  const msg = err.message
  if (typeof msg === 'string' && msg.length > 0) {
    if (
      msg === NETWORK_ERROR ||
      msg === TIMEOUT_ERROR ||
      msg === LOGIN_EXPIRED ||
      msg === CANCELLED
    ) {
      return msg
    }
  }

  // 走到这里说明是未登记的结构：宁可给通用文案，也不要把原始异常暴露给用户
  // （可能含堆栈或内部路径）。同时把它记进日志便于定位。
  console.error('[error-code] 未登记的错误结构：', e)
  return ERROR_CODE[90003]
}
