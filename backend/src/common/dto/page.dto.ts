/**
 * common/dto/page.dto.ts
 * 统一分页入参。所有列表接口复用。
 */

import { ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsInt, IsOptional, Max, Min } from 'class-validator'

export class PageDto {
  @ApiPropertyOptional({ description: '页码，从 1 开始', default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'page 必须是整数' })
  @Min(1, { message: 'page 最小为 1' })
  page: number = 1

  @ApiPropertyOptional({ description: '每页条数', default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'pageSize 必须是整数' })
  @Min(1, { message: 'pageSize 最小为 1' })
  @Max(100, { message: 'pageSize 最大为 100' })
  pageSize: number = 20

  /** 供 Service 使用的 0 基偏移 */
  get skip(): number {
    return (this.page - 1) * this.pageSize
  }

  get take(): number {
    return this.pageSize
  }
}

/** 排序入参 */
export class SortDto {
  @ApiPropertyOptional({ description: '排序字段（下划线命名）', default: 'created_at' })
  @IsOptional()
  sortBy: string = 'created_at'

  @ApiPropertyOptional({ description: '排序方向', enum: ['asc', 'desc'], default: 'desc' })
  @IsOptional()
  sortOrder: 'asc' | 'desc' = 'desc'
}

/** 日期区间入参 */
export class DateRangeDto {
  @ApiPropertyOptional({ description: '开始时间（ISO 8601）' })
  @IsOptional()
  from?: string

  @ApiPropertyOptional({ description: '结束时间（ISO 8601）' })
  @IsOptional()
  to?: string

  /** 解析为 Date，非法则返回 undefined 由上层用错误码拦截 */
  get fromDate(): Date | undefined {
    if (!this.from) return undefined
    const d = new Date(this.from)
    return Number.isNaN(d.getTime()) ? undefined : d
  }

  get toDate(): Date | undefined {
    if (!this.to) return undefined
    const d = new Date(this.to)
    return Number.isNaN(d.getTime()) ? undefined : d
  }
}
