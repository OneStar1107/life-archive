/**
 * database/database.module.ts
 * 全局数据库模块：提供 PrismaService 单例，供所有模块（含根级全局守卫）共享。
 *
 * ★ 必须 @Global —— JwtAuthGuard 在 AppModule 以 APP_GUARD 全局注册，
 *   只有全局模块导出的 PrismaService 才能被根级守卫注入。
 */

import { Global, Module } from '@nestjs/common'
import { PrismaService } from './prisma.service'

@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class DatabaseModule {}
