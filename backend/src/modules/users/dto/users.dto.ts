/**
 * modules/users/dto/users.dto.ts
 * 账号管理的入参与出参：资料、授权同意、数据导出。
 *
 * 说明：出参中的手机号与邮箱**永远脱敏**，
 * 完整值只在账号本人明确索取数据导出时才可能出现在服务端日志/离线文件中。
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Transform } from 'class-transformer'
import { IsBoolean, IsOptional, IsString, IsUrl, MaxLength, MinLength } from 'class-validator'

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value

// ── 出参 ──────────────────────────────────────────────

export class UserProfileDto {
  @ApiProperty() id!: string
  @ApiProperty({ nullable: true, description: '昵称，未设置时为 null' }) nickname!: string | null
  @ApiProperty({ nullable: true }) avatarUrl!: string | null
  @ApiProperty({
    nullable: true,
    description: '★ 已脱敏的手机号，如 138****8000',
    example: '138****8000',
  })
  phone!: string | null
  @ApiProperty({
    nullable: true,
    description: '★ 已脱敏的邮箱，如 a***@domain.com',
    example: 'a***@domain.com',
  })
  email!: string | null
  @ApiProperty({ description: '注册时间' }) createdAt!: string
}

// ── 入参 ──────────────────────────────────────────────

export class UpdateUserDto {
  @ApiPropertyOptional({ description: '昵称', minLength: 1, maxLength: 64 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(1, { message: '昵称不能为空' })
  @MaxLength(64)
  nickname?: string

  @ApiPropertyOptional({ description: '头像地址（先上传文件再回填）', maxLength: 512 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsUrl({ require_protocol: true }, { message: 'avatarUrl 必须是完整 URL' })
  @MaxLength(512)
  avatarUrl?: string
}

export class ConsentDto {
  @ApiProperty({
    description: '★ 是否已阅读并同意隐私政策，必须为 true，否则返回 30006',
    example: true,
  })
  @IsBoolean()
  privacyPolicyAccepted!: boolean

  @ApiPropertyOptional({
    description: '是否同意把本应用数据用于生成洞察（可随时在设置里关闭）',
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  dataSourceConsent?: boolean
}

// ── 数据导出 ──────────────────────────────────────────

export class AccountExportDto {
  @ApiProperty({ description: '本次导出的生成时间' }) exportedAt!: string
  @ApiProperty({ type: UserProfileDto }) user!: UserProfileDto
  @ApiProperty({
    description: '各数据表的记录条数，键为业务名（feelings / memories / …）',
    additionalProperties: { type: 'number' },
    example: { feelings: 12, memories: 30, memoryRelations: 8 },
  })
  counts!: Record<string, number>
  @ApiProperty({
    nullable: true,
    description: '导出包下载地址；当前版本直接返回 null，后续接入离线打包后填充',
  })
  downloadUrl!: string | null
}
