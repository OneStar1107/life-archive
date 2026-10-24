/**
 * modules/profiles/profiles.controller.ts
 * 「你」Tab：基本资料 / 性格 / 边界。
 *
 * 说明：控制器**只返回业务数据**，Result<T> 包装由 ResponseInterceptor 统一完成。
 * 本模块没有删除接口——资料是长期资产，不提供软删除入口。
 */

import { Body, Controller, Get, Patch } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { ProfilesService } from './profiles.service'
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator'
import { ProfileCompletenessDto, ProfileDto, UpdateProfileDto } from './dto/profiles.dto'

@ApiTags('profiles')
@ApiBearerAuth()
@Controller('profiles')
export class ProfilesController {
  constructor(private readonly profilesService: ProfilesService) {}

  @Get()
  @ApiOperation({
    summary: '获取「你」的资料',
    description:
      '尚未建档时返回 40010（资料尚未建立），此时端上应展示引导填写的空态，而不是当作错误。',
  })
  async get(@CurrentUser() user: AuthUser): Promise<ProfileDto> {
    return this.profilesService.get(user.id)
  }

  @Patch()
  @ApiOperation({
    summary: '更新「你」的资料',
    description:
      'upsert 语义：首次进入可直接 PATCH 建档。不传的字段保留原值；显式传 null 的字段被清空。' +
      'quietHours 每项的 start / end 必须形如 HH:mm，可跨零点（如 22:00 → 08:00）。',
  })
  async update(@CurrentUser() user: AuthUser, @Body() dto: UpdateProfileDto): Promise<ProfileDto> {
    return this.profilesService.update(user.id, dto)
  }

  @Get('completeness')
  @ApiOperation({
    summary: '资料完整度',
    description: '检查姓名 / 性别 / 生日 / 作息 / 饮食偏好五项，返回完成百分比与缺失项的中文名。',
  })
  async completeness(@CurrentUser() user: AuthUser): Promise<ProfileCompletenessDto> {
    return this.profilesService.completeness(user.id)
  }
}
