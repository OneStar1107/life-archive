/**
 * modules/profiles/dto/profiles.dto.ts
 * 「你」Tab 的基本资料 / 性格 / 边界的入参与出参。
 *
 * 产品边界（铁律）：
 *   1. offLimitTopics 是用户明确划出的禁区，AI 生成任何内容前都要先读它。
 *   2. quietHours 是「允许主动联系的时间段」——跨零点书写，如 22:00 → 08:00。
 *   3. dataSourceConsent 未开启时，任何数据源导入都必须先拒绝（30006）。
 *   4. 所有字段都可为空：资料是逐步补齐的，不做一次性强制填写。
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Transform, Type } from 'class-transformer'
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator'

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value

/** HH:mm，24 小时制 */
export const HH_MM_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/

/** query string 里的布尔转换：?unreadOnly=true / ?consent=false */
const toBool = ({ value }: { value: unknown }): unknown => {
  if (typeof value === 'boolean') return value
  if (value === 'true') return true
  if (value === 'false') return false
  return value
}

/** 免打扰时段：允许跨零点 */
export class QuietHoursItemDto {
  @ApiProperty({ description: '开始时间 HH:mm', example: '22:00' })
  @Transform(trim)
  @IsString()
  @Matches(HH_MM_PATTERN, { message: 'start 必须是 HH:mm 格式' })
  start!: string

  @ApiProperty({ description: '结束时间 HH:mm', example: '08:00' })
  @Transform(trim)
  @IsString()
  @Matches(HH_MM_PATTERN, { message: 'end 必须是 HH:mm 格式' })
  end!: string
}

// ── 出参 ──────────────────────────────────────────────

export class ProfileDto {
  @ApiProperty() id!: string
  @ApiProperty({ nullable: true, description: '真实姓名' }) realName!: string | null
  @ApiProperty({ nullable: true }) gender!: string | null
  @ApiProperty({ nullable: true, description: '生日 YYYY-MM-DD' }) birthday!: string | null
  @ApiProperty({ nullable: true }) bloodType!: string | null
  @ApiProperty({ nullable: true, description: '身高 cm' }) heightCm!: number | null
  @ApiProperty({ nullable: true, description: '体重 kg' }) weightKg!: number | null
  @ApiProperty({ nullable: true, description: '作息类型：早睡型 / 晚睡型 / 随机型' })
  sleepPattern!: string | null
  @ApiProperty({ nullable: true }) dietPreference!: string | null
  @ApiProperty({ nullable: true, description: 'MBTI，由用户自填，允许留空' }) mbti!: string | null
  @ApiProperty({ isArray: true, type: String, description: '读得懂这些' }) readableTopics!: string[]
  @ApiProperty({ isArray: true, type: String, description: '★ 不碰这些' }) offLimitTopics!: string[]
  @ApiProperty({
    type: QuietHoursItemDto,
    isArray: true,
    nullable: true,
    description: '允许主动联系的时间段，可跨零点；null 表示未设置',
  })
  quietHours!: QuietHoursItemDto[] | null
  @ApiProperty({ description: '数据来源授权开关，未开启时禁止导入' })
  dataSourceConsent!: boolean
  @ApiProperty() createdAt!: string
  @ApiProperty() updatedAt!: string
}

/** 资料完整度：驱动「你」Tab 的引导式补齐 */
export class ProfileCompletenessDto {
  @ApiProperty({ description: '已填写项数', example: 2 }) completed!: number
  @ApiProperty({ description: '需要填写的项数', example: 5 }) total!: number
  @ApiProperty({ description: '完成百分比 0~100', example: 40 }) percent!: number
  @ApiProperty({
    isArray: true,
    type: String,
    description: '缺失项的中文名，直接用于前端提示',
    example: ['性别', '生日'],
  })
  missing!: string[]
}

// ── 入参 ──────────────────────────────────────────────

/**
 * 资料更新体：全部字段可选。
 * 传 null 表示清空该字段，不传（undefined）表示保留原值。
 */
export class UpdateProfileDto {
  @ApiPropertyOptional({ maxLength: 64 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(64)
  realName?: string | null

  @ApiPropertyOptional({ maxLength: 16, example: 'female' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(16)
  gender?: string | null

  @ApiPropertyOptional({ description: '生日 YYYY-MM-DD' })
  @IsOptional()
  @IsDateString({}, { message: 'birthday 必须是 YYYY-MM-DD' })
  birthday?: string | null

  @ApiPropertyOptional({ maxLength: 8, example: 'O' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(8)
  bloodType?: string | null

  @ApiPropertyOptional({ minimum: 50, maximum: 300, description: '身高 cm' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(50)
  @Max(300)
  heightCm?: number | null

  @ApiPropertyOptional({ minimum: 20, maximum: 400, description: '体重 kg' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(20)
  @Max(400)
  weightKg?: number | null

  @ApiPropertyOptional({ maxLength: 32, description: '早睡型 / 晚睡型 / 随机型' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(32)
  sleepPattern?: string | null

  @ApiPropertyOptional({ maxLength: 128 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(128)
  dietPreference?: string | null

  @ApiPropertyOptional({ maxLength: 8, example: 'INFJ' })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsString()
  @MaxLength(8)
  mbti?: string | null

  @ApiPropertyOptional({ isArray: true, type: String, description: '读得懂这些' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(32, { each: true })
  readableTopics?: string[]

  @ApiPropertyOptional({ isArray: true, type: String, description: '★ 不碰这些' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(32, { each: true })
  offLimitTopics?: string[]

  @ApiPropertyOptional({
    type: QuietHoursItemDto,
    isArray: true,
    description: '允许主动联系的时间段，可跨零点；传 null 或 [] 表示取消',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @ValidateNested({ each: true })
  @Type(() => QuietHoursItemDto)
  quietHours?: QuietHoursItemDto[] | null

  @ApiPropertyOptional({ description: '数据来源授权开关' })
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  dataSourceConsent?: boolean
}
