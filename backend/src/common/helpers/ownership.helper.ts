/**
 * common/helpers/ownership.helper.ts
 * 资源归属校验。
 *
 * 本项目是「单用户自治」模型：任何记录都归属于某个 userId，
 * 任何查询/修改/删除都必须先确认归属，否则就是越权。
 *
 * 这是防止 30003（只能操作自己的数据）被绕过的唯一入口。
 */

import { BusinessException } from '../exceptions/business.exception'
import { ErrorCode } from '../constants/error-codes'

/** 归属校验失败时统一抛这个码，由各模块按需覆盖为更具体的码 */
export function assertOwnership<T extends { userId: string } | null>(
  record: T,
  currentUserId: string,
  notFoundCode: number = ErrorCode.NOT_FOUND,
): NonNullable<T> {
  if (!record) {
    // 资源不存在与无权访问返回同一个码，避免通过错误码探测他人数据是否存在
    throw new BusinessException(notFoundCode)
  }
  if (record.userId !== currentUserId) {
    throw new BusinessException(ErrorCode.NOT_RESOURCE_OWNER)
  }
  return record
}
