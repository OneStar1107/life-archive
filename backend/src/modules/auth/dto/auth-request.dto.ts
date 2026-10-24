/**
 * modules/auth/dto/auth-request.dto.ts
 * 注册 / 登录 / 刷新 / 改密的入参。
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Transform } from 'class-transformer'
import {
  IsEmail,
  IsOptional,
  IsPhoneNumber,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator'

/** 去空格：用户经常在手机号里输入空格 */
const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value

export class RegisterDto {
  @ApiPropertyOptional({ description: '手机号（与邮箱二选一）', example: '13800138000' })
  @ValidateIf((o: RegisterDto) => !o.email)
  @IsPhoneNumber('CN', { message: '手机号格式有误' })
  @Transform(trim)
  @IsString()
  phone?: string

  @ApiPropertyOptional({ description: '邮箱（与手机号二选一）', example: 'user@example.com' })
  @ValidateIf((o: RegisterDto) => !o.phone)
  @IsEmail({}, { message: '邮箱格式有误' })
  @Transform(trim)
  @IsString()
  email?: string

  @ApiProperty({ description: '密码，8~72 位且含字母与数字', example: 'abcd1234' })
  @IsString()
  @MinLength(8, { message: '密码至少 8 位' })
  @MaxLength(72, { message: '密码最长 72 位' })
  @Matches(/^(?=.*[A-Za-z])(?=.*\d)[\S]{8,72}$/, {
    message: '密码需同时包含字母与数字，且不含空白字符',
  })
  password!: string

  @ApiPropertyOptional({ description: '昵称', maxLength: 64, example: '林澈' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(64)
  nickname?: string
}

export class LoginDto {
  @ApiPropertyOptional({ description: '手机号', example: '13800138000' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  phone?: string

  @ApiPropertyOptional({ description: '邮箱', example: 'user@example.com' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  email?: string

  @ApiProperty({ description: '密码', example: 'abcd1234' })
  @IsString()
  @MinLength(1, { message: '请输入密码' })
  @MaxLength(72)
  password!: string
}

export class RefreshDto {
  @ApiProperty({ description: 'Refresh Token' })
  @IsString()
  @MinLength(20, { message: 'refreshToken 格式有误' })
  @MaxLength(2048)
  refreshToken!: string
}

export class LogoutDto {
  @ApiPropertyOptional({ description: 'Refresh Token；不传则吊销该用户全部令牌' })
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  refreshToken?: string
}

export class ChangePasswordDto {
  @ApiProperty({ description: '旧密码' })
  @IsString()
  @MinLength(1, { message: '请输入原密码' })
  @MaxLength(72)
  oldPassword!: string

  @ApiProperty({ description: '新密码，8~72 位且含字母与数字' })
  @IsString()
  @MinLength(8, { message: '新密码至少 8 位' })
  @MaxLength(72)
  @Matches(/^(?=.*[A-Za-z])(?=.*\d)[\S]{8,72}$/, {
    message: '新密码需同时包含字母与数字，且不含空白字符',
  })
  newPassword!: string
}
