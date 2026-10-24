/**
 * modules/users/users.module.ts
 * 账号模块：资料维护 / 隐私同意 / 数据导出 / 账号注销。
 *
 * 导入 AuthModule 以复用 TokenService：注销账号时必须吊销全部令牌。
 */

import { Module } from '@nestjs/common'
import { UsersController } from './users.controller'
import { UsersService } from './users.service'
import { AuthModule } from '../auth/auth.module'
@Module({
  imports: [AuthModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
