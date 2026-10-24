/**
 * modules/feelings/dto/feelings.dto.ts
 * 感受（情绪记录）的入参与出参。
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Transform, Type } from 'class-transformer'
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator'
import { PageDto } from '../../../common/dto/page.dto'

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value

export class FeelingDto {
  @ApiProperty() id!: string
  @ApiProperty({ description: '你原本的说法' }) rawLabel!: string
  @ApiProperty({ nullable: true, description: '更精确的情绪词' }) refinedLabel!: string | null
  @ApiProperty({ minimum: 1, maximum: 10 }) intensity!: number
  @ApiProperty({ enum: ['positive', 'neutral', 'negative'] }) polarity!: string
  @ApiProperty({ nullable: true }) content!: string | null
  @ApiProperty({ nullable: true }) trigger!: string | null
  @ApiProperty({ enum: ['manual', 'import', 'insight'] }) source!: string
  @ApiProperty({ description: '发生时间' }) happenedAt!: string
  @ApiProperty() createdAt!: string
  @ApiProperty() updatedAt!: string
}

export class CreateFeelingDto {
  @ApiProperty({ description: '你的原话，如「难受」', maxLength: 64, example: '难受' })
  @Transform(trim)
  @IsString()
  @MinLength(1, { message: '说说现在是什么感觉' })
  @MaxLength(64)
  rawLabel!: string

  @ApiPropertyOptional({ description: '更精确的情绪词', maxLength: 64, example: '憋屈' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(64)
  refinedLabel?: string

  @ApiPropertyOptional({ minimum: 1, maximum: 10, default: 5 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1, { message: '感受强度需要在 1 到 10 之间' })
  @Max(10, { message: '感受强度需要在 1 到 10 之间' })
  intensity?: number

  @ApiPropertyOptional({ enum: ['positive', 'neutral', 'negative'] })
  @IsOptional()
  @IsEnum(['positive', 'neutral', 'negative'])
  polarity?: 'positive' | 'neutral' | 'negative'

  @ApiPropertyOptional({ maxLength: 2000, description: '想说的话' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  content?: string

  @ApiPropertyOptional({ maxLength: 2000, description: '是什么触发了这个感受' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  trigger?: string

  @ApiPropertyOptional({ description: '发生时间，默认现在。支持补记过去。' })
  @IsOptional()
  @IsString()
  happenedAt?: string
}

export class UpdateFeelingDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(64)
  refinedLabel?: string
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10)
  intensity?: number
  @ApiPropertyOptional({ enum: ['positive', 'neutral', 'negative'] })
  @IsOptional()
  @IsEnum(['positive', 'neutral', 'negative'])
  polarity?: 'positive' | 'neutral' | 'negative'
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) content?: string
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) trigger?: string
  @ApiPropertyOptional() @IsOptional() @IsString() happenedAt?: string
}

export class QueryFeelingDto extends PageDto {
  @ApiPropertyOptional({ enum: ['positive', 'neutral', 'negative'] })
  @IsOptional()
  @IsString()
  polarity?: 'positive' | 'neutral' | 'negative'

  @ApiPropertyOptional({ description: '按情绪词模糊搜索' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(64)
  keyword?: string

  @ApiPropertyOptional({ description: 'ISO 日期，含当天' })
  @IsOptional()
  @IsString()
  from?: string

  @ApiPropertyOptional({ description: 'ISO 日期，含当天' })
  @IsOptional()
  @IsString()
  to?: string
}

// ── 情绪粒度训练（RULER 词表子集）────────────────────

export class EmotionWordDto {
  @ApiProperty({ description: '粗粒度词' }) raw!: string
  @ApiProperty({ description: '精粒度候选词' }) refined!: string
  @ApiProperty({ enum: ['positive', 'neutral', 'negative'] }) polarity!: string
}

export class RefineSuggestionDto {
  @ApiProperty({ description: '你输入的原话' }) rawLabel!: string
  @ApiProperty({
    isArray: true,
    type: EmotionWordDto,
    description: '候选的更精确说法，按贴近度排序',
  })
  candidates!: EmotionWordDto[]
}

/** 情绪统计（首页「今天过得怎么样」用） */
export class FeelingStatDto {
  @ApiProperty() date!: string
  @ApiProperty() count!: number
  @ApiProperty({ nullable: true }) dominantPolarity!: string | null
  @ApiProperty({ nullable: true }) averageIntensity!: number | null
  @ApiProperty({ isArray: true, type: EmotionWordDto, description: '当日情绪词分布' })
  words!: EmotionWordDto[]
}
