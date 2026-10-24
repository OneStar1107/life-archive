/**
 * common/interceptors/response.interceptor.ts
 * 统一包装 Result<T>。
 *
 * ══════════════════════════════════════════════════════════════
 * 核心原则（00 号 T2 / 02 号 T2）：
 *   HTTP 200 只代表「通信成功」，业务成败一律看 body.code。
 *   唯一例外是真正的鉴权失败，返回 HTTP 401。
 * ══════════════════════════════════════════════════════════════
 *
 * 这样设计的好处：前端只需一套判断逻辑（先看 HTTP 层是否 401，
 * 再看 body.code 是否为 0），不必为每个接口配置不同的 HTTP 语义。
 */

import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  StreamableFile,
} from '@nestjs/common'
import { Observable, map } from 'rxjs'
import { randomUUID } from 'node:crypto'
import { ErrorCode } from '../constants/error-codes'
import type { Result } from '../dto/result.dto'

/** 已在响应体里的标记，避免二次包装 */
const RAW_RESPONSE = Symbol('RAW_RESPONSE')

/** 控制器返回此对象可跳过包装（健康检查、文件流等） */
export function rawResponse<T>(payload: T): T {
  Object.defineProperty(payload, RAW_RESPONSE, { value: true, enumerable: false })
  return payload
}

export function isRawResponse(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as Record<symbol, unknown>)[RAW_RESPONSE] === true
  )
}

@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T, Result<T> | T> {
  intercept(context: ExecutionContext, next: CallHandler<T>): Observable<Result<T> | T> {
    return next.handle().pipe(
      map((data): Result<T> | T => {
        // 文件流、已标记的原始响应：不包装
        if (data instanceof StreamableFile || isRawResponse(data)) {
          return data
        }

        // 控制器显式返回 null/undefined 也包成 data: null，保持结构一致
        return {
          code: ErrorCode.SUCCESS,
          message: '操作成功',
          data: (data ?? null) as T,
          traceId: resolveTraceId(context),
        }
      }),
    )
  }
}

function resolveTraceId(context: ExecutionContext): string {
  const res = context.switchToHttp().getResponse()
  const existing = res.locals?.['traceId']
  if (typeof existing === 'string' && existing.length > 0) return existing
  const id = randomUUID()
  res.locals['traceId'] = id
  return id
}
