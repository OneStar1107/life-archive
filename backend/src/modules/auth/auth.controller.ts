/**
 * modules/auth/auth.controller.ts
 * 注册 / 登录 / 刷新 / 登出 / 改密 / 当前用户。
 *
 * ★ 控制器只返回业务数据，Result<T> 包装由 ResponseInterceptor 统一完成
 *   （见 common/interceptors/response.interceptor.ts）。
 *   控制器自己再包一层会导致双重嵌套。
 *
 * 限流：登录、注册走更严格的独立限流器（02 号 T5）。
 */

import { Body, Controller, Get, HttpCode, HttpStatus, Ip, Post, Headers } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { Throttle } from '@nestjs/throttler'
import { AuthService } from './auth.service'
import { Public } from '../../common/decorators/public.decorator'
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator'
import { ErrorCode, messageOf } from '../../common/constants/error-codes'
import {
  ChangePasswordDto,
  LoginDto,
  LogoutDto,
  RefreshDto,
  RegisterDto,
} from './dto/auth-request.dto'
import { AuthResultDto, RefreshResultDto } from './dto/auth-response.dto'

@ApiTags('认证')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('register')
  @HttpCode(HttpStatus.OK)
  // 注册：10 分钟内最多 5 次
  @Throttle({ default: { limit: 5, ttl: 600_000 } })
  @ApiOperation({ summary: '注册', description: '手机号与邮箱二选一；成功后自动建空资料' })
  @ApiResponse({ status: 200, description: '注册成功' })
  async register(
    @Body() dto: RegisterDto,
    @Ip() ip: string,
    @Headers('user-agent') ua?: string,
  ): Promise<AuthResultDto> {
    return this.authService.register(dto, { ip, userAgent: ua })
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  // 登录：60 秒内最多 5 次（02 号 T5）
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: '登录', description: '手机号或邮箱 + 密码' })
  @ApiResponse({ status: 200, description: '登录成功' })
  @ApiResponse({ status: 401, description: messageOf(ErrorCode.PASSWORD_INCORRECT) })
  async login(
    @Body() dto: LoginDto,
    @Ip() ip: string,
    @Headers('user-agent') ua?: string,
  ): Promise<AuthResultDto> {
    return this.authService.login(dto, { ip, userAgent: ua })
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({
    summary: '刷新令牌',
    description:
      '轮换式刷新：每次都颁发新 Refresh 并作废旧的。若检测到已作废的 Refresh 被再次使用，' +
      '将吊销整个令牌族并强制重新登录。',
  })
  @ApiResponse({ status: 200, description: '刷新成功' })
  @ApiResponse({ status: 401, description: messageOf(ErrorCode.REFRESH_REUSED) })
  async refresh(
    @Body() dto: RefreshDto,
    @Ip() ip: string,
    @Headers('user-agent') ua?: string,
  ): Promise<RefreshResultDto> {
    return this.authService.refresh(dto.refreshToken, { ip, userAgent: ua })
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: '登出', description: '不传 refreshToken 则吊销该用户全部令牌' })
  async logout(@CurrentUser() user: AuthUser, @Body() dto: LogoutDto): Promise<{ success: true }> {
    return this.authService.logout(user.id, dto.refreshToken)
  }

  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({
    summary: '修改密码',
    description: '改密后所有设备都会被登出，当前设备会拿到一对新令牌。',
  })
  async changePassword(
    @CurrentUser() user: AuthUser,
    @Body() dto: ChangePasswordDto,
    @Ip() ip: string,
    @Headers('user-agent') ua?: string,
  ): Promise<{ success: true }> {
    return this.authService.changePassword(user, dto, { ip, userAgent: ua })
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: '当前登录用户', description: '手机号与邮箱已脱敏' })
  async me(@CurrentUser() user: AuthUser): Promise<unknown> {
    return this.authService.me(user.id)
  }
}
