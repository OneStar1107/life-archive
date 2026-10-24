/**
 * modules/users/users.controller.ts
 * 账号管理：我的资料 / 更新资料 / 授权同意 / 数据导出 / 账号注销。
 *
 * ★ 控制器只返回业务数据，Result<T> 包装由 ResponseInterceptor 统一完成
 *   （见 common/interceptors/response.interceptor.ts）。
 *
 * 路由统一挂在 `/me` 下：本项目的账号是「单用户自治」模型，
 * 不提供按 id 查询他人资料的入口，从路由层面杜绝越权。
 */

import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Patch, Post } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { UsersService } from './users.service'
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator'
import { ErrorCode, messageOf } from '../../common/constants/error-codes'
import { AccountExportDto, ConsentDto, UpdateUserDto, UserProfileDto } from './dto/users.dto'

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  @ApiOperation({ summary: '我的资料', description: '手机号与邮箱已脱敏' })
  async detail(@CurrentUser() user: AuthUser): Promise<UserProfileDto> {
    return this.usersService.detail(user.id)
  }

  @Patch('me')
  @ApiOperation({
    summary: '更新我的资料',
    description: '只更新显式传入的字段；昵称重复返回 40002',
  })
  async update(@CurrentUser() user: AuthUser, @Body() dto: UpdateUserDto): Promise<UserProfileDto> {
    return this.usersService.update(user.id, dto)
  }

  @Post('me/consent')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '提交授权同意',
    description: `privacyPolicyAccepted 必须为 true，否则返回 30006：${messageOf(ErrorCode.CONSENT_REQUIRED)}`,
  })
  async acceptConsent(
    @CurrentUser() user: AuthUser,
    @Body() dto: ConsentDto,
  ): Promise<{ privacyPolicyAcceptedAt: string }> {
    return this.usersService.acceptConsent(user.id, dto)
  }

  @Get('me/export')
  @ApiOperation({
    summary: '导出我的数据',
    description:
      '《个人信息保护法》赋予用户的数据可携带权：返回账号资料与各业务表的记录条数。' +
      'downloadUrl 预留为 null，接入离线打包后返回下载链接。',
  })
  async exportData(@CurrentUser() user: AuthUser): Promise<AccountExportDto> {
    return this.usersService.exportData(user.id)
  }

  @Delete('me')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '注销账号',
    description:
      '★ 不可逆操作。账号将被禁用、全部登录令牌立即失效、' +
      '所有感受 / 记忆 / 健康 / 旅途 / 待办 / 洞察 / 文件被软删除且不再可访问。' +
      '如需继续使用，请重新注册。',
  })
  async remove(@CurrentUser() user: AuthUser): Promise<{ success: true }> {
    return this.usersService.deleteAccount(user.id)
  }
}
