/**
 * modules/journeys/dto/journeys.dto.ts
 * 旅途：去过的地方 / 常驻城市。
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Transform, Type } from 'class-transformer'
import {
  IsArray,
  IsBoolean,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator'
import { PageDto } from '../../../common/dto/page.dto'

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value

const toBool = ({ value }: { value: unknown }): unknown =>
  value === true || value === 'true' || value === '1' || value === 1

export class JourneyDto {
  @ApiProperty() id!: string
  @ApiProperty({ description: '地点名', example: '杭州' }) place!: string
  @ApiProperty({ description: '是否常驻' }) isResident!: boolean
  @ApiProperty({ nullable: true }) latitude!: number | null
  @ApiProperty({ nullable: true }) longitude!: number | null
  @ApiProperty({ nullable: true }) coverUrl!: string | null
  @ApiProperty({ nullable: true, description: '起始日期 YYYY-MM-DD' }) startedAt!: string | null
  @ApiProperty({ nullable: true, description: '结束日期；常驻为 null' }) endedAt!: string | null
  @ApiProperty({ nullable: true }) note!: string | null
  @ApiProperty({ isArray: true, type: String, description: '关联记忆节点 ID' }) memoryIds!: string[]
  @ApiProperty() createdAt!: string
  @ApiProperty() updatedAt!: string
}

export class CreateJourneyDto {
  @ApiProperty({ maxLength: 128, example: '大理' })
  @Transform(trim)
  @IsString()
  @MinLength(1, { message: '这个地方叫什么' })
  @MaxLength(128)
  place!: string

  @ApiPropertyOptional({ description: '是否常驻城市', default: false })
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  isResident?: boolean

  @ApiPropertyOptional({ minimum: -90, maximum: 90 })
  @IsOptional()
  @Type(() => Number)
  @IsLatitude({ message: '纬度不合法' })
  latitude?: number

  @ApiPropertyOptional({ minimum: -180, maximum: 180 })
  @IsOptional()
  @Type(() => Number)
  @IsLongitude({ message: '经度不合法' })
  longitude?: number

  @ApiPropertyOptional({ maxLength: 512 })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  coverUrl?: string

  @ApiPropertyOptional({ description: '起始日期 YYYY-MM-DD' })
  @IsOptional()
  @IsString()
  startedAt?: string

  @ApiPropertyOptional({ description: '结束日期 YYYY-MM-DD；常驻不填' })
  @IsOptional()
  @IsString()
  endedAt?: string

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string

  @ApiPropertyOptional({ isArray: true, type: String, description: '关联记忆节点 ID 列表' })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  memoryIds?: string[]
}

export class UpdateJourneyDto {
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MaxLength(128) place?: string
  @ApiPropertyOptional() @IsOptional() @Transform(toBool) @IsBoolean() isResident?: boolean
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsLatitude() latitude?: number
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsLongitude() longitude?: number
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(512) coverUrl?: string
  @ApiPropertyOptional() @IsOptional() @IsString() startedAt?: string
  @ApiPropertyOptional() @IsOptional() @IsString() endedAt?: string
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) note?: string
  @ApiPropertyOptional({ isArray: true, type: String })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  memoryIds?: string[]
}

export class QueryJourneyDto extends PageDto {
  @ApiPropertyOptional({ description: '只看常驻' })
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  isResident?: boolean
}

/** 地图点位，前端直接渲染 */
export class MapPointDto {
  @ApiProperty() id!: string
  @ApiProperty() place!: string
  @ApiProperty({ nullable: true }) latitude!: number | null
  @ApiProperty({ nullable: true }) longitude!: number | null
  @ApiProperty() isResident!: boolean
  @ApiProperty({ nullable: true }) startedAt!: string | null
  @ApiProperty({ nullable: true }) endedAt!: string | null
  @ApiProperty({ nullable: true }) note!: string | null
}

export class TimelineSegmentDto {
  @ApiProperty() id!: string
  @ApiProperty() place!: string
  @ApiProperty() isResident!: boolean
  @ApiProperty({ nullable: true }) startedAt!: string | null
  @ApiProperty({ nullable: true }) endedAt!: string | null
  @ApiProperty({ nullable: true, description: '停留天数' }) days!: number | null
  @ApiProperty({ nullable: true }) note!: string | null
}
