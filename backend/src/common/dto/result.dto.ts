/**
 * common/dto/result.dto.ts
 * 统一出参结构。★ 任何接口都必须返回这个形状。
 *
 * 注意：出参 DTO 中**不允许**出现 passwordHash、deletedAt、token 等内部字段。
 * 02 号 DoD 有对应检查项。
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

export class Result<T = unknown> {
  @ApiProperty({ description: '业务码，0 为成功。非 0 见错误码表', example: 0 })
  code!: number

  @ApiProperty({ description: '中文可展示文案', example: '操作成功' })
  message!: string

  @ApiProperty({ description: '业务数据，失败时为 null', nullable: true })
  data!: T | null

  @ApiProperty({ description: '全链路追踪 ID，同时写入响应头 X-Trace-Id' })
  traceId!: string
}

/** 分页出参 */
export class PageResult<T> {
  @ApiProperty({ description: '当前页数据', isArray: true })
  list!: T[]

  @ApiProperty({ description: '总条数', example: 128 })
  total!: number

  @ApiProperty({ description: '当前页码，从 1 开始', example: 1 })
  page!: number

  @ApiProperty({ description: '每页条数', example: 20 })
  pageSize!: number

  @ApiProperty({ description: '总页数', example: 7 })
  totalPages!: number

  @ApiProperty({ description: '是否还有下一页', example: true })
  hasNext!: boolean
}

/** 构造分页结果 */
export function toPageResult<T>(
  list: T[],
  total: number,
  page: number,
  pageSize: number,
): PageResult<T> {
  const totalPages = pageSize > 0 ? Math.ceil(total / pageSize) : 0
  return {
    list,
    total,
    page,
    pageSize,
    totalPages,
    hasNext: page < totalPages,
  }
}

/** 健康检查响应（跳过统一包装） */
export class HealthResponse {
  @ApiProperty({ example: 'ok' })
  status!: 'ok' | 'degraded' | 'error'

  @ApiProperty({ description: '各依赖项状态', example: { database: 'up', redis: 'up' } })
  checks!: Record<string, 'up' | 'down' | 'skipped'>

  @ApiPropertyOptional({ description: '服务版本', example: '1.0.0' })
  version?: string

  @ApiPropertyOptional({ description: '进程启动时间（ISO 8601）' })
  startedAt?: string

  @ApiPropertyOptional({ description: '已运行秒数', example: 3600 })
  uptimeSeconds?: number
}
