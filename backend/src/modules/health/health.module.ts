/**
 * modules/health/health.module.ts
 * 健康模块：身体的信号（/health/metrics） + 容器探针（/health/live、/health/ready）
 */

import { Module } from '@nestjs/common'
import { HealthController } from './health.controller'
import { HealthCheckController } from './healthcheck.controller'
import { HealthService } from './health.service'

@Module({
  controllers: [HealthController, HealthCheckController],
  providers: [HealthService],
  exports: [HealthService],
})
export class HealthModule {}
