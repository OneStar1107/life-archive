/**
 * common/filters/all-exception.filter.ts
 * 任何异常 → 统一 Result<T> 错误结构。
 *
 * ★ 铁律（02 号第 ⑨ 节第 4 条）：禁止把 SQL 错误、堆栈信息回显给客户端。
 *   非生产环境才把 message 带出去，生产环境一律回落为标准文案。
 */

import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common'
import { Prisma } from '@prisma/client'
import type { Request, Response } from 'express'
import { ErrorCode, messageOf } from '../constants/error-codes'
import { BusinessException, AuthException } from '../exceptions/business.exception'
import type { Result } from '../dto/result.dto'

@Catch()
export class AllExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionFilter.name)

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp()
    const res = ctx.getResponse<Response>()
    const req = ctx.getRequest<Request>()

    const traceId: string = res.locals?.['traceId'] ?? 'unknown'
    const isProd = process.env['NODE_ENV'] === 'production'

    const mapped = this.mapException(exception, isProd)

    // 5xx 记 error，4xx 记 warn
    const logLine = {
      traceId,
      method: req.method,
      // 只记路径，不记 query —— query 里可能有敏感信息
      path: req.path,
      status: mapped.httpStatus,
      code: mapped.code,
      error: mapped.logMessage,
    }
    if (mapped.httpStatus >= 500) this.logger.error(logLine)
    else this.logger.warn(logLine)

    const body: Result<null> = {
      code: mapped.code,
      message: mapped.message,
      data: null,
      traceId,
    }

    res.setHeader('X-Trace-Id', traceId)
    res.status(mapped.httpStatus).json(body)
  }

  private mapException(
    exception: unknown,
    isProd: boolean,
  ): { httpStatus: number; code: number; message: string; logMessage: string } {
    // 1. 业务异常：带明确错误码
    if (exception instanceof AuthException) {
      return {
        httpStatus: HttpStatus.UNAUTHORIZED,
        code: exception.code,
        message: exception.message,
        logMessage: exception.message,
      }
    }

    if (exception instanceof BusinessException) {
      return {
        httpStatus: HttpStatus.OK, // 业务失败也返回 200，错误在 body.code
        code: exception.code,
        message: exception.message,
        logMessage: `${exception.message} ${exception.detail ?? ''}`.trim(),
      }
    }

    // 2. Prisma 已知错误 → 映射为资源类错误码，绝不回显 SQL
    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      return this.mapPrisma(exception)
    }

    if (exception instanceof Prisma.PrismaClientValidationError) {
      return {
        httpStatus: HttpStatus.OK,
        code: ErrorCode.PARAM_INVALID,
        message: messageOf(ErrorCode.PARAM_INVALID),
        logMessage: 'Prisma validation error',
      }
    }

    if (exception instanceof Prisma.PrismaClientInitializationError) {
      return {
        httpStatus: HttpStatus.SERVICE_UNAVAILABLE,
        code: ErrorCode.DATABASE_ERROR,
        message: messageOf(ErrorCode.DATABASE_ERROR),
        logMessage: 'Prisma 初始化失败（数据库不可达）',
      }
    }

    // 3. Multer 文件上传错误
    if (exception instanceof Error && 'code' in exception) {
      const multerCode = (exception as { code?: string }).code
      if (multerCode === 'LIMIT_FILE_SIZE') {
        return {
          httpStatus: HttpStatus.OK,
          code: ErrorCode.FILE_TOO_LARGE,
          message: messageOf(ErrorCode.FILE_TOO_LARGE),
          logMessage: '上传文件超出大小限制',
        }
      }
      if (multerCode === 'LIMIT_UNEXPECTED_FILE') {
        return {
          httpStatus: HttpStatus.OK,
          code: ErrorCode.PARAM_INVALID,
          message: messageOf(ErrorCode.PARAM_INVALID),
          logMessage: '上传字段名不符合预期',
        }
      }
    }

    // 4. Nest 内建 HTTP 异常
    if (exception instanceof HttpException) {
      const status = exception.getStatus()
      const response = exception.getResponse()
      const nestMessage =
        typeof response === 'string'
          ? response
          : ((response as { message?: unknown }).message ?? '')
      const firstMessage = Array.isArray(nestMessage) ? nestMessage[0] : nestMessage

      return {
        httpStatus: status,
        code: this.httpStatusToCode(status),
        message: isProd ? messageOf(this.httpStatusToCode(status)) : String(firstMessage ?? ''),
        logMessage: String(firstMessage ?? exception.name),
      }
    }

    // 5. 兜底：未知异常
    return {
      httpStatus: HttpStatus.INTERNAL_SERVER_ERROR,
      code: ErrorCode.INTERNAL_ERROR,
      message: messageOf(ErrorCode.INTERNAL_ERROR),
      logMessage:
        exception instanceof Error ? (exception.stack ?? exception.message) : String(exception),
    }
  }

  private mapPrisma(e: Prisma.PrismaClientKnownRequestError): {
    httpStatus: number
    code: number
    message: string
    logMessage: string
  } {
    switch (e.code) {
      case 'P2002': // 唯一约束冲突
        return {
          httpStatus: HttpStatus.OK,
          code: ErrorCode.ALREADY_EXISTS,
          message: messageOf(ErrorCode.ALREADY_EXISTS),
          logMessage: `唯一约束冲突: ${e.meta?.['target'] ?? 'unknown'}`,
        }
      case 'P2003': // 外键约束失败
        return {
          httpStatus: HttpStatus.OK,
          code: ErrorCode.FORBIDDEN_RESOURCE,
          message: messageOf(ErrorCode.FORBIDDEN_RESOURCE),
          logMessage: `外键约束失败: ${e.meta?.['field_name'] ?? 'unknown'}`,
        }
      case 'P2025': // 记录不存在
        return {
          httpStatus: HttpStatus.OK,
          code: ErrorCode.NOT_FOUND,
          message: messageOf(ErrorCode.NOT_FOUND),
          logMessage: '记录不存在',
        }
      default:
        return {
          httpStatus: HttpStatus.SERVICE_UNAVAILABLE,
          code: ErrorCode.DATABASE_ERROR,
          message: messageOf(ErrorCode.DATABASE_ERROR),
          logMessage: `Prisma 错误 ${e.code}`,
        }
    }
  }

  private httpStatusToCode(status: number): number {
    switch (status) {
      case HttpStatus.BAD_REQUEST:
        return ErrorCode.PARAM_INVALID
      case HttpStatus.UNAUTHORIZED:
        return ErrorCode.TOKEN_INVALID
      case HttpStatus.FORBIDDEN:
        return ErrorCode.NO_PERMISSION
      case HttpStatus.NOT_FOUND:
        return ErrorCode.NOT_FOUND
      case HttpStatus.CONFLICT:
        return ErrorCode.ALREADY_EXISTS
      case HttpStatus.PAYLOAD_TOO_LARGE:
        return ErrorCode.FILE_TOO_LARGE
      case HttpStatus.UNSUPPORTED_MEDIA_TYPE:
        return ErrorCode.UNSUPPORTED_MEDIA_TYPE
      case HttpStatus.TOO_MANY_REQUESTS:
        return ErrorCode.RATE_LIMITED
      case HttpStatus.SERVICE_UNAVAILABLE:
        return ErrorCode.SERVICE_UNAVAILABLE
      case HttpStatus.GATEWAY_TIMEOUT:
        return ErrorCode.TIMEOUT
      default:
        return status >= 500 ? ErrorCode.INTERNAL_ERROR : ErrorCode.PARAM_INVALID
    }
  }
}
