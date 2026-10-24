/**
 * modules/profiles/profiles.module.ts
 * 资料模块：基本资料 / 性格 / 边界。
 */

import { Module } from '@nestjs/common'
import { ProfilesController } from './profiles.controller'
import { ProfilesService } from './profiles.service'
@Module({
  controllers: [ProfilesController],
  providers: [ProfilesService],
  exports: [ProfilesService],
})
export class ProfilesModule {}
