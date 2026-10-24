/**
 * modules/memories/dto/memories.dto.ts
 * 记忆节点的入参与出参。
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Transform, Type } from 'class-transformer'
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator'
import { PageDto } from '../../../common/dto/page.dto'

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value

// ── 出参 ──────────────────────────────────────────────

export class MemoryDto {
  @ApiProperty() id!: string
  @ApiProperty({ description: '节点标题' }) title!: string
  @ApiProperty({ nullable: true }) description!: string | null
  @ApiProperty({ isArray: true, type: String }) tags!: string[]
  @ApiProperty({ isArray: true, type: String }) people!: string[]
  @ApiProperty({ nullable: true }) location!: string | null
  @ApiProperty({ nullable: true, description: '图谱横坐标 0~1' }) graphX!: number | null
  @ApiProperty({ nullable: true, description: '图谱纵坐标 0~1' }) graphY!: number | null
  @ApiProperty({ nullable: true }) icon!: string | null
  @ApiProperty({
    nullable: true,
    description: '颜色令牌名（指向 theme.json，禁存十六进制）',
  })
  colorToken!: string | null
  @ApiProperty({ nullable: true, description: '关联的感受 ID' }) feelingId!: string | null
  @ApiProperty({ description: '权重 0~100，决定图谱节点大小' }) weight!: number
  @ApiProperty({ enum: ['manual', 'import', 'insight'] }) source!: string

  @ApiProperty({ nullable: true, description: '★ 当时的我怎么看' }) pastSelfView!: string | null
  @ApiProperty({ nullable: true, description: '★ 现在的我怎么想' }) presentSelfView!: string | null
  @ApiProperty({ nullable: true }) pastViewedAt!: string | null
  @ApiProperty({ nullable: true }) presentViewedAt!: string | null

  @ApiProperty({ description: '事件发生时间' }) occurredAt!: string
  @ApiProperty() createdAt!: string
  @ApiProperty() updatedAt!: string
}

// ── 入参 ──────────────────────────────────────────────

export class CreateMemoryDto {
  @ApiProperty({ description: '节点标题', maxLength: 128, example: '夜跑' })
  @Transform(trim)
  @IsString()
  @MinLength(1, { message: '给这条记忆起个名字吧' })
  @MaxLength(128)
  title!: string

  @ApiPropertyOptional({ description: '节点描述', maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string

  @ApiPropertyOptional({ isArray: true, type: String, description: '分类标签' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(32, { each: true })
  tags?: string[]

  @ApiPropertyOptional({ isArray: true, type: String, description: '关联人物' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  people?: string[]

  @ApiPropertyOptional({ maxLength: 128, example: '杭州' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(128)
  location?: string

  @ApiPropertyOptional({ description: '图谱横坐标 0~1', minimum: 0, maximum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'graphX 必须是数字' })
  @Min(0)
  @Max(1)
  graphX?: number

  @ApiPropertyOptional({ description: '图谱纵坐标 0~1', minimum: 0, maximum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'graphY 必须是数字' })
  @Min(0)
  @Max(1)
  graphY?: number

  @ApiPropertyOptional({ maxLength: 32, description: 'emoji 或 iconfont 标识' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  icon?: string

  @ApiPropertyOptional({
    maxLength: 32,
    description: '颜色令牌名，禁传十六进制色值',
    example: 'accent',
  })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  @Matches(/^[a-z][a-zA-Z0-9-]*$/, { message: 'colorToken 只能是令牌名，不能是色值' })
  colorToken?: string

  @ApiPropertyOptional({ description: '关联的感受 ID' })
  @IsOptional()
  @IsUUID('4', { message: 'feelingId 必须是合法 UUID' })
  feelingId?: string

  @ApiPropertyOptional({ minimum: 0, maximum: 100, default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  weight?: number

  @ApiPropertyOptional({ description: '事件发生时间，默认现在' })
  @IsOptional()
  @IsString()
  occurredAt?: string
}

export class UpdateMemoryDto extends CreateMemoryDto {
  @ApiPropertyOptional({ description: '★ 当时的我怎么看' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  pastSelfView?: string

  @ApiPropertyOptional({ description: '★ 现在的我怎么想' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  presentSelfView?: string
}

// 所有字段可选的更新体（用于 PATCH 语义）
export class PatchMemoryDto {
  @ApiPropertyOptional({ maxLength: 128 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(128)
  title?: string
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) description?: string
  @ApiPropertyOptional({ isArray: true, type: String })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  tags?: string[]
  @ApiPropertyOptional({ isArray: true, type: String })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  people?: string[]
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(128)
  location?: string
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1)
  graphX?: number
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1)
  graphY?: number
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(32) icon?: string
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(32) colorToken?: string
  @ApiPropertyOptional() @IsOptional() @IsUUID('4') feelingId?: string
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  weight?: number
  @ApiPropertyOptional() @IsOptional() @IsString() occurredAt?: string
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) pastSelfView?: string
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) presentSelfView?: string
}

export class QueryMemoryDto extends PageDto {
  @ApiPropertyOptional({ description: '按标题/描述模糊搜索' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(64)
  keyword?: string

  @ApiPropertyOptional({ description: '按标签过滤' })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string'
      ? value
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : value,
  )
  @IsArray()
  @IsString({ each: true })
  tags?: string[]

  @ApiPropertyOptional({ description: '按人物过滤' })
  @IsOptional()
  @IsString()
  person?: string

  @ApiPropertyOptional({ description: '只看有时空对照的节点' })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => value === 'true' || value === true)
  hasTimeline?: boolean

  @ApiPropertyOptional({
    enum: ['occurredAt', 'createdAt', 'weight', 'title'],
    default: 'createdAt',
  })
  @IsOptional()
  @IsString()
  sortBy?: 'occurredAt' | 'createdAt' | 'weight' | 'title'

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'desc' })
  @IsOptional()
  @IsString()
  sortOrder?: 'asc' | 'desc'
}

// ── 记忆关联 ──────────────────────────────────────────

export class CreateRelationDto {
  @ApiProperty({ description: '起点记忆 ID' })
  @IsUUID('4')
  sourceId!: string

  @ApiProperty({ description: '终点记忆 ID' })
  @IsUUID('4')
  targetId!: string

  @ApiProperty({
    enum: ['emotional', 'causal', 'temporal', 'person', 'location', 'topical'],
    default: 'topical',
  })
  @IsEnum(['emotional', 'causal', 'temporal', 'person', 'location', 'topical'])
  kind!: 'emotional' | 'causal' | 'temporal' | 'person' | 'location' | 'topical'

  @ApiPropertyOptional({ minimum: 0, maximum: 100, default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  strength?: number

  @ApiPropertyOptional({ maxLength: 512 })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  note?: string
}

export class RelationDto {
  @ApiProperty() id!: string
  @ApiProperty() sourceId!: string
  @ApiProperty() targetId!: string
  @ApiProperty({ enum: ['emotional', 'causal', 'temporal', 'person', 'location', 'topical'] })
  kind!: string
  @ApiProperty() strength!: number
  @ApiProperty({ nullable: true }) note!: string | null
  @ApiProperty({ description: '是否系统自动发现' }) discovered!: boolean
  @ApiProperty() createdAt!: string
}

// ── 图谱 ──────────────────────────────────────────────

export class GraphNodeDto {
  @ApiProperty() id!: string
  @ApiProperty() title!: string
  @ApiProperty({ nullable: true }) icon!: string | null
  @ApiProperty({ nullable: true }) colorToken!: string | null
  @ApiProperty() weight!: number
  @ApiProperty({ nullable: true }) graphX!: number | null
  @ApiProperty({ nullable: true }) graphY!: number | null
  @ApiProperty() degree!: number
}

export class GraphEdgeDto {
  @ApiProperty() id!: string
  @ApiProperty() sourceId!: string
  @ApiProperty() targetId!: string
  @ApiProperty() kind!: string
  @ApiProperty() strength!: number
}

export class GraphDto {
  @ApiProperty({ isArray: true, type: GraphNodeDto }) nodes!: GraphNodeDto[]
  @ApiProperty({ isArray: true, type: GraphEdgeDto }) edges!: GraphEdgeDto[]
}

// ── 时间轴 ────────────────────────────────────────────

export class TimelineEntryDto {
  @ApiProperty() memoryId!: string
  @ApiProperty() title!: string
  @ApiProperty({ nullable: true }) icon!: string | null
  @ApiProperty({ nullable: true }) colorToken!: string | null
  @ApiProperty() occurredAt!: string
  @ApiProperty({ nullable: true, description: '当时的我怎么看' }) pastSelfView!: string | null
  @ApiProperty({ nullable: true, description: '现在的我怎么想' }) presentSelfView!: string | null
  @ApiProperty({ nullable: true }) pastViewedAt!: string | null
  @ApiProperty({ nullable: true }) presentViewedAt!: string | null
  @ApiProperty({ description: '是否已经发生过视角转变' }) hasShift!: boolean
}

export class TimelineDto {
  @ApiProperty({ isArray: true, type: TimelineEntryDto }) entries!: TimelineEntryDto[]
  @ApiProperty({ description: '发生视角转变的节点数' }) shiftedCount!: number
  @ApiProperty({ description: '最早的事件时间' }) earliest!: string | null
  @ApiProperty({ description: '最晚的事件时间' }) latest!: string | null
}
