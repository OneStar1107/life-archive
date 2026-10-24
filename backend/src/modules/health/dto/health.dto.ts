/**
 * modules/health/dto/health.dto.ts
 * 身体信号（只记录，不做绩效评价）。
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Transform, Type } from 'class-transformer'
import { IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator'
import { PageDto } from '../../../common/dto/page.dto'

/** 允许的指标类型 */
export const METRIC_TYPES = [
  'sleep',
  'steps',
  'heart_rate',
  'duration',
  'mood_energy',
  'weight',
] as const
export type MetricType = (typeof METRIC_TYPES)[number]

export class HealthMetricDto {
  @ApiProperty() id!: string
  @ApiProperty({
    enum: METRIC_TYPES,
    description: 'sleep/steps/heart_rate/duration/mood_energy/weight',
  })
  metricType!: string
  @ApiProperty() value!: number
  @ApiProperty({ description: '单位：小时/次/bpm/分钟/级/kg' }) unit!: string
  @ApiProperty({ nullable: true, description: '主观状态，如「有点累」' }) subjectiveState!:
    string | null
  @ApiProperty({ nullable: true }) note!: string | null
  @ApiProperty({ enum: ['manual', 'import', 'insight'] }) source!: string
  @ApiProperty() measuredAt!: string
  @ApiProperty() createdAt!: string
}

export class CreateHealthMetricDto {
  @ApiProperty({ enum: METRIC_TYPES, example: 'sleep' })
  @IsString()
  @Matches(/^(sleep|steps|heart_rate|duration|mood_energy|weight)$/, {
    message: 'metricType 必须是 sleep / steps / heart_rate / duration / mood_energy / weight 之一',
  })
  metricType!: MetricType

  @ApiProperty({ description: '数值', example: 7.5 })
  @Type(() => Number)
  @IsNumber({}, { message: 'value 必须是数字' })
  @Min(0, { message: '身体信号数值不能为负' })
  @Max(100000, { message: '身体信号数值超出合理范围' })
  value!: number

  @ApiProperty({ description: '单位', maxLength: 16, example: '小时' })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(16)
  unit!: string

  @ApiPropertyOptional({ description: '主观状态', maxLength: 64, example: '睡不好' })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(64)
  subjectiveState?: string

  @ApiPropertyOptional({ maxLength: 512 })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  note?: string

  @ApiPropertyOptional({ description: '测量时间，默认现在' })
  @IsOptional()
  @IsString()
  measuredAt?: string
}

export class QueryHealthMetricDto extends PageDto {
  @ApiPropertyOptional({ enum: METRIC_TYPES, description: '按指标类型过滤' })
  @IsOptional()
  @IsString()
  metricType?: MetricType

  @ApiPropertyOptional({ description: '起始日期（含），YYYY-MM-DD' })
  @IsOptional()
  @IsString()
  from?: string

  @ApiPropertyOptional({ description: '结束日期（含），YYYY-MM-DD' })
  @IsOptional()
  @IsString()
  to?: string
}

// ── 趋势 ──────────────────────────────────────────────

export class TrendPointDto {
  @ApiProperty({ description: '日期 YYYY-MM-DD' }) date!: string
  @ApiProperty() value!: number
  @ApiProperty({ nullable: true }) subjectiveState!: string | null
}

export class TrendDto {
  @ApiProperty() metricType!: string
  @ApiProperty() unit!: string
  @ApiProperty({ isArray: true, type: TrendPointDto }) points!: TrendPointDto[]
  @ApiProperty({ nullable: true, description: '区间平均值' }) average!: number | null
  @ApiProperty({ nullable: true, description: '区间最小值' }) min!: number | null
  @ApiProperty({ nullable: true, description: '区间最大值' }) max!: number | null
  @ApiProperty({
    description: '★ 纯陈述的自然语言描述，不含评价与建议',
  })
  narrative!: string
}

export class OverviewDto {
  @ApiProperty({ description: '最近 N 天的各指标趋势' })
  trends!: TrendDto[]
  @ApiProperty({ description: '数据连续记录天数' }) streakDays!: number
  @ApiProperty({
    description: '★ 整体陈述。刻意不做「达标 / 未达标」判断',
  })
  summary!: string
}
