/**
 * modules/health/healthcheck.controller.ts
 * ══════════════════════════════════════════════════════════════
 * 容器健康检查（02 号 T6）
 * ══════════════════════════════════════════════════════════════
 *
 * /health/live  进程存活即 200，不查任何依赖
 * /health/ready 执行 SELECT 1 探库，DB 断开必须返回**非 200**
 *
 * 这两个接口用 rawResponse() 跳过统一包装，返回裸 JSON，
 * 方便 Docker / k8s / 负载均衡直接判定。
 */

import { Controller, Get, HttpStatus, Res } from '@nestjs/common'
import { ApiExcludeController, ApiOperation, ApiTags } from '@nestjs/swagger'
import type { Response } from 'express'
import { PrismaService } from '../../database/prisma.service'
import { Public } from '../../common/decorators/public.decorator'
import { rawResponse } from '../../common/interceptors/response.interceptor'
import { HealthResponse } from '../../common/dto/result.dto'
import { redisPing } from '../files/redis.util'

const startedAt = Date.now()
const VERSION = process.env['npm_package_version'] ?? '1.0.0'

@ApiTags('健康检查')
@ApiExcludeController()
@Controller('health')
export class HealthCheckController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get('live')
  @ApiOperation({ summary: '存活探针', description: '进程在跑就返回 200，不查任何依赖' })
  live(): HealthResponse {
    return rawResponse({
      status: 'ok' as const,
      checks: {},
      version: VERSION,
      startedAt: new Date(startedAt).toISOString(),
      uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
    })
  }

  @Public()
  @Get('ready')
  @ApiOperation({
    summary: '就绪探针',
    description: '执行 SELECT 1 探库。数据库断开时返回 503，供容器编排判定。',
  })
  async ready(@Res({ passthrough: false }) res: Response): Promise<HealthResponse> {
    const dbUp = await this.prisma.ping()
    const redisUp = await redisPing()

    const checks: HealthResponse['checks'] = {
      database: dbUp ? 'up' : 'down',
      redis: redisUp === null ? 'skipped' : redisUp ? 'up' : 'down',
    }

    // Redis 可选：未配置不算失败，配了但连不上算 degraded 但仍可服务
    const allUp = dbUp
    const degraded = !redisUp === false

    const body: HealthResponse = {
      status: !dbUp ? 'error' : degraded ? 'degraded' : 'ok',
      checks,
      version: VERSION,
      startedAt: new Date(startedAt).toISOString(),
      uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
    }

    // ★ DB 断开必须返回非 200，这是 02 号 T6 的硬性 DoD
    res.status(allUp ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE)
    return rawResponse(body)
  }
}
