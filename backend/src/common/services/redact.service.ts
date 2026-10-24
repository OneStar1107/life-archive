/**
 * common/services/logger.service.ts
 * ★ 日志脱敏服务（02 号 T8）。
 *
 * pino 的 redact 只能按路径脱敏，无法覆盖「字符串里嵌了 token」的情况。
 * 因此这里额外提供一个显式的脱敏工具，所有拼接日志的地方都应经过它。
 */

import { Injectable } from '@nestjs/common'

/** 需要脱敏的键名（小写匹配） */
const SENSITIVE_KEYS = [
  'password',
  'passwordhash',
  'token',
  'accesstoken',
  'refreshtoken',
  'authorization',
  'secret',
  'apikey',
  'idcard',
  'idcardno',
  'phone',
  'mobile',
  'email',
  'bankcard',
]

/** 需要整体打码的敏感值形态 */
const PATTERNS: Array<[RegExp, (m: string) => string]> = [
  // JWT
  [/eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, () => '[REDACTED_JWT]'],
  // Bearer
  [/Bearer\s+[A-Za-z0-9._~+/-]{10,}=*/g, () => 'Bearer [REDACTED]'],
  // 身份证
  [
    /\b[1-9]\d{5}(?:19|20)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\d{3}[\dXx]\b/g,
    () => '[REDACTED_ID]',
  ],
  // 中国大陆手机号
  [/\b1[3-9]\d{9}\b/g, () => '[REDACTED_PHONE]'],
  // 数据库连接串
  [/postgres(?:ql)?:\/\/[^:\s]+:[^@\s]+@[^\s/]+/gi, () => 'postgresql://[REDACTED]'],
  // 查询串里的敏感参数
  [/([?&](?:token|access_token|refresh_token|code|phone)=)[^&\s]+/gi, () => '$1[REDACTED]'],
]

@Injectable()
export class RedactService {
  /**
   * 对任意值做深度脱敏。
   * 命中敏感键名的值直接替换；字符串值走正则打码。
   */
  redact<T>(input: T, depth = 0): unknown {
    if (depth > 6) return '[DEPTH_LIMIT]'
    if (input === null || input === undefined) return input

    if (typeof input === 'string') return this.redactString(input)
    if (typeof input !== 'object') return input

    if (input instanceof Date) return input.toISOString()
    if (input instanceof Error) {
      return { name: input.name, message: this.redactString(input.message) }
    }
    if (Array.isArray(input)) {
      return input.map((v) => this.redact(v, depth + 1))
    }

    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
      if (SENSITIVE_KEYS.includes(k.toLowerCase())) {
        out[k] = '[REDACTED]'
      } else {
        out[k] = this.redact(v, depth + 1)
      }
    }
    return out
  }

  /** 单字符串脱敏 */
  redactString(s: string): string {
    let out = s
    for (const [re, fn] of PATTERNS) out = out.replace(re, fn)
    return out
  }
}
