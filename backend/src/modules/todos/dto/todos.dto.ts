/**
 * modules/todos/dto/todos.dto.ts
 * 待办 · 时间与你：提醒事项 / 生日 / 节日 / 出行。
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Transform } from 'class-transformer'
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator'
import { PageDto } from '../../../common/dto/page.dto'

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value

export const TODO_KINDS = ['task', 'birthday', 'festival', 'trip'] as const
export const TODO_REPEATS = ['none', 'yearly', 'monthly', 'weekly'] as const
export const TODO_STATUSES = ['pending', 'done', 'archived'] as const

export class TodoDto {
  @ApiProperty() id!: string
  @ApiProperty() title!: string
  @ApiProperty({ nullable: true }) note!: string | null
  @ApiProperty({ enum: TODO_KINDS, description: 'task/birthday/festival/trip' }) kind!: string
  @ApiProperty({ enum: TODO_STATUSES }) status!: string
  @ApiProperty({ nullable: true }) dueAt!: string | null
  @ApiProperty({ nullable: true }) completedAt!: string | null
  @ApiProperty({ enum: TODO_REPEATS }) repeatRule!: string
  @ApiProperty({ isArray: true, type: String }) people!: string[]
  @ApiProperty() createdAt!: string
  @ApiProperty() updatedAt!: string
}

export class CreateTodoDto {
  @ApiProperty({ maxLength: 256, example: '老周的生日' })
  @Transform(trim)
  @IsString()
  @MinLength(1, { message: '写点什么吧' })
  @MaxLength(256)
  title!: string

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string

  @ApiPropertyOptional({ enum: TODO_KINDS, default: 'task' })
  @IsOptional()
  @IsEnum(TODO_KINDS)
  kind?: (typeof TODO_KINDS)[number]

  @ApiPropertyOptional({ description: '计划时间' })
  @IsOptional()
  @IsString()
  dueAt?: string

  @ApiPropertyOptional({ enum: TODO_REPEATS, default: 'none' })
  @IsOptional()
  @IsEnum(TODO_REPEATS)
  repeatRule?: (typeof TODO_REPEATS)[number]

  @ApiPropertyOptional({ isArray: true, type: String, description: '关联人物' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  people?: string[]
}

export class UpdateTodoDto {
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MaxLength(256) title?: string
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) note?: string
  @ApiPropertyOptional({ enum: TODO_KINDS })
  @IsOptional()
  @IsEnum(TODO_KINDS)
  kind?: (typeof TODO_KINDS)[number]
  @ApiPropertyOptional({ enum: TODO_STATUSES })
  @IsOptional()
  @IsEnum(TODO_STATUSES)
  status?: (typeof TODO_STATUSES)[number]
  @ApiPropertyOptional() @IsOptional() @IsString() dueAt?: string
  @ApiPropertyOptional({ enum: TODO_REPEATS })
  @IsOptional()
  @IsEnum(TODO_REPEATS)
  repeatRule?: (typeof TODO_REPEATS)[number]
  @ApiPropertyOptional({ isArray: true, type: String })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  people?: string[]
}

export class QueryTodoDto extends PageDto {
  @ApiPropertyOptional({ enum: TODO_STATUSES })
  @IsOptional()
  @IsEnum(TODO_STATUSES)
  status?: (typeof TODO_STATUSES)[number]

  @ApiPropertyOptional({ enum: TODO_KINDS })
  @IsOptional()
  @IsEnum(TODO_KINDS)
  kind?: (typeof TODO_KINDS)[number]

  @ApiPropertyOptional({ description: '只看某个人的相关项' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(64)
  person?: string
}

/** 首页「今天」分组 */
export class TodoGroupDto {
  @ApiProperty({ description: '今天' }) today!: TodoDto[]
  @ApiProperty({ description: '未来 7 天' }) upcoming!: TodoDto[]
  @ApiProperty({ description: '已逾期未完成' }) overdue!: TodoDto[]
  @ApiProperty({ description: '最近完成' }) completed!: TodoDto[]
}

export class AcceptTodoDto {
  @ApiProperty({ description: '本次操作的用户可见反馈文案' })
  message!: string
}
