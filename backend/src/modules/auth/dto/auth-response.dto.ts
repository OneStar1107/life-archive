/**
 * modules/auth/dto/auth-response.dto.ts
 * 认证相关出参。★ 严禁出现 passwordHash / tokenVersion / deletedAt。
 */

import { ApiProperty } from '@nestjs/swagger'

export class TokenPair {
  @ApiProperty({ description: 'Access Token，15 分钟有效' })
  accessToken!: string

  @ApiProperty({ description: 'Refresh Token，7 天有效，每次刷新都会轮换' })
  refreshToken!: string

  @ApiProperty({ description: 'Access 剩余有效秒数', example: 900 })
  accessExpiresIn!: number

  @ApiProperty({ description: 'Refresh 剩余有效秒数', example: 604800 })
  refreshExpiresIn!: number

  @ApiProperty({ description: '固定为 Bearer', example: 'Bearer' })
  tokenType!: 'Bearer'
}

export class UserBriefDto {
  @ApiProperty({ description: '用户 ID（uuid）' })
  id!: string

  @ApiProperty({ description: '昵称', nullable: true })
  nickname!: string | null

  @ApiProperty({ description: '头像地址', nullable: true })
  avatarUrl!: string | null
}

export class AuthResultDto {
  @ApiProperty({ description: '令牌对' })
  tokens!: TokenPair

  @ApiProperty({ description: '用户概要' })
  user!: UserBriefDto
}

export class RefreshResultDto {
  @ApiProperty({ description: '轮换后的新令牌对' })
  tokens!: TokenPair
}
