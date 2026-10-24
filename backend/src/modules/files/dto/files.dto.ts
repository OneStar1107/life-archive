/**
 * modules/files/dto/files.dto.ts
 * 文件上传的入参与出参。
 *
 * 说明：出参刻意**不暴露** storageKey 与 checksum——
 * 前端只需要 url，存储路径属于内部实现。
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Transform } from 'class-transformer'
import { IsEnum, IsOptional } from 'class-validator'
import { PageDto } from '../../../common/dto/page.dto'

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value

/** 文件用途白名单，与 DB 的 purpose 字段取值一致 */
export const FILE_PURPOSES = ['avatar', 'memory', 'journey', 'journal'] as const
export type FilePurpose = (typeof FILE_PURPOSES)[number]

// ── 出参 ──────────────────────────────────────────────

export class FileDto {
  @ApiProperty() id!: string
  @ApiProperty({ description: '可直接访问的完整 URL' }) url!: string
  @ApiProperty({ description: '用户上传时的原始文件名，仅用于展示' }) originalName!: string
  @ApiProperty({ example: 'image/jpeg' }) mimeType!: string
  @ApiProperty({ description: '字节数', example: 204800 }) size!: number
  @ApiProperty({ enum: FILE_PURPOSES, description: '用途：头像 / 记忆配图 / 旅途封面 / 日记插图' })
  purpose!: string
  @ApiProperty({ description: '上传时间' }) createdAt!: string
}

export class UploadResultDto {
  @ApiProperty({ type: FileDto }) file!: FileDto
  @ApiProperty({
    description: '★ 是否命中秒传：内容 checksum 与已有文件相同，未重复落盘',
    example: false,
  })
  deduplicated!: boolean
}

// ── 入参 ──────────────────────────────────────────────

export class QueryFileDto extends PageDto {
  @ApiPropertyOptional({ enum: FILE_PURPOSES, description: '按用途过滤' })
  @IsOptional()
  @Transform(trim)
  @IsEnum(FILE_PURPOSES, { message: 'purpose 只能是 avatar / memory / journey / journal' })
  purpose?: FilePurpose
}
