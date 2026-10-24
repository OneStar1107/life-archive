/**
 * modules/memories/memories.module.ts
 * 记忆模块：节点 / 图谱关联 / 时间轴。
 */

import { Module } from '@nestjs/common'
import { MemoriesController } from './memories.controller'
import { MemoriesService } from './memories.service'
@Module({
  controllers: [MemoriesController],
  providers: [MemoriesService],
  exports: [MemoriesService],
})
export class MemoriesModule {}
