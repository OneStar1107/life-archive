/**
 * common/exceptions/business.exception.ts
 * 业务异常：Service 层唯一允许抛出的异常类型。
 * 由 all-exception.filter.ts 统一翻译成 Result<T>。
 *
 * 铁律：禁止裸 `throw new Error()`（见 00 号第 ⑨ 节与本文件 eslint 规则）。
 */

import { HttpException, HttpStatus } from '@nestjs/common'
import { ErrorCode, messageOf } from '../constants/error-codes'

export class BusinessException extends HttpException {
  readonly code: number
  readonly detail?: string

  constructor(code: number, message?: string, detail?: string) {
    // 未显式传文案时回落到错误码表中的标准文案，
    // 保证三端展示同一句话。
    super(message ?? messageOf(code), HttpStatus.OK)
    this.code = code
    this.detail = detail
  }

  static paramInvalid(detail?: string): BusinessException {
    return new BusinessException(ErrorCode.PARAM_INVALID, undefined, detail)
  }

  static notFound(code: number = ErrorCode.NOT_FOUND): BusinessException {
    return new BusinessException(code)
  }

  static alreadyExists(code: number = ErrorCode.ALREADY_EXISTS): BusinessException {
    return new BusinessException(code)
  }

  static noPermission(): BusinessException {
    return new BusinessException(ErrorCode.NO_PERMISSION)
  }

  static loginExpired(): BusinessException {
    return new BusinessException(ErrorCode.LOGIN_EXPIRED)
  }
}

/**
 * 鉴权失败专用：HTTP 状态码用 401（00 号 T2 的唯一例外），
 * 让前端拦截器能在 HTTP 层就识别出来。
 */
export class AuthException extends HttpException {
  readonly code: number

  constructor(code: number, message?: string) {
    super(message ?? messageOf(code), HttpStatus.UNAUTHORIZED)
    this.code = code
  }
}
