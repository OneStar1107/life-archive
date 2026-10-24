/**
 * modules/insights/insights.module.ts
 * 洞察模块：我是怎么一点点认识你的。
 */

import { Module } from '@nestjs/common'
import { InsightsController } from './insights.controller'
import { InsightsService } from './insights.service'
@Module({
  controllers: [InsightsController],
  providers: [InsightsService],
  exports: [InsightsService],
})
export class InsightsModule {}
