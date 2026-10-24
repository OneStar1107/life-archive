/**
 * modules/health/health.controller.ts
 */

import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger'
import { HealthService } from './health.service'
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator'
import { PageResult } from '../../common/dto/result.dto'
import {
  CreateHealthMetricDto,
  HealthMetricDto,
  METRIC_TYPES,
  OverviewDto,
  QueryHealthMetricDto,
  TrendDto,
} from './dto/health.dto'

@ApiTags('健康')
@ApiBearerAuth()
@Controller('health/metrics')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @ApiOperation({ summary: '身体信号列表', description: '支持指标类型与日期区间过滤' })
  async list(
    @CurrentUser() user: AuthUser,
    @Query() query: QueryHealthMetricDto,
  ): Promise<PageResult<HealthMetricDto>> {
    return this.healthService.list(user.id, query)
  }

  @Get('overview')
  @ApiOperation({
    summary: '最近概览',
    description: '★ 只呈现数字与陈述，不做「达标 / 未达标」判断',
  })
  @ApiQuery({ name: 'days', required: false, description: '统计天数，默认 7' })
  async overview(
    @CurrentUser() user: AuthUser,
    @Query('days') days?: string,
  ): Promise<OverviewDto> {
    return this.healthService.overview(user.id, days ? Number(days) : 7)
  }

  @Get('trend')
  @ApiOperation({ summary: '单指标趋势' })
  @ApiQuery({ name: 'metricType', required: true, enum: METRIC_TYPES })
  @ApiQuery({ name: 'days', required: false, description: '默认 30' })
  async trend(
    @CurrentUser() user: AuthUser,
    @Query('metricType') metricType: string,
    @Query('days') days?: string,
  ): Promise<TrendDto> {
    return this.healthService.trend(user.id, metricType, days ? Number(days) : 30)
  }

  @Get(':id')
  @ApiOperation({ summary: '身体信号详情' })
  async detail(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<HealthMetricDto> {
    return this.healthService.detail(user.id, id)
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '记录一次身体信号' })
  async create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateHealthMetricDto,
  ): Promise<HealthMetricDto> {
    return this.healthService.create(user.id, dto)
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '删除身体信号（软删除）' })
  async remove(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<{ success: true }> {
    return this.healthService.remove(user.id, id)
  }
}
