/**
 * modules/feelings/feelings.module.ts
 */

import { Module } from '@nestjs/common'
import { FeelingsController } from './feelings.controller'
import { FeelingsService } from './feelings.service'

@Module({
  controllers: [FeelingsController],
  providers: [FeelingsService],
  exports: [FeelingsService],
})
export class FeelingsModule {}
