/**
 * common/interceptors/logging.interceptor.ts
 * 请求耗时统计 + traceId 生成。
 *
 * ★ 铁律：日志中不允许出现任何明文 token、手机号、身份证。
 *   这里只记录 method / path（不含 query）/ status / 耗时。
 */

import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common'
import { Observable, tap } from 'rxjs'
import { randomUUID } from 'node:crypto'
import type { Request, Response } from 'express'

/** 慢请求阈值（毫秒） */
const SLOW_MS = 1000

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP')

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle()

    const http = context.switchToHttp()
    const req = http.getRequest<Request>()
    const res = http.getResponse<Response>()

    // traceId：优先用上游传入的，便于跨服务串联
    const traceId = extractTraceId(req) ?? randomUUID()
    res.locals['traceId'] = traceId
    res.setHeader('X-Trace-Id', traceId)

    const start = process.hrtime.bigint()

    return next.handle().pipe(
      tap({
        next: () => {
          const ms = Number(process.hrtime.bigint() - start) / 1e6
          // ★ 只记 path，不记 query：query 里可能出现敏感参数
          const line = `${req.method} ${req.path} ${res.statusCode} ${ms.toFixed(1)}ms trace=${traceId}`
          if (ms > SLOW_MS) this.logger.warn(`慢请求 ${line}`)
          else this.logger.log(line)
        },
        error: () => {
          const ms = Number(process.hrtime.bigint() - start) / 1e6
          this.logger.error(
            `${req.method} ${req.path} ${res.statusCode} ${ms.toFixed(1)}ms trace=${traceId}`,
          )
        },
      }),
    )
  }
}

function extractTraceId(req: Request): string | null {
  const h = req.headers['x-trace-id'] ?? req.headers['x-request-id']
  const v = Array.isArray(h) ? h[0] : h
  if (typeof v !== 'string') return null
  // 只接受安全的字符集，避免日志注入
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(v)) return null
  return v
}
