/**
 * modules/journeys/journeys.controller.ts
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
  Patch,
  Post,
  Query,
} from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { JourneysService } from './journeys.service'
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator'
import { PageResult } from '../../common/dto/result.dto'
import {
  CreateJourneyDto,
  JourneyDto,
  MapPointDto,
  QueryJourneyDto,
  TimelineSegmentDto,
  UpdateJourneyDto,
} from './dto/journeys.dto'

@ApiTags('旅途')
@ApiBearerAuth()
@Controller('journeys')
export class JourneysController {
  constructor(private readonly journeysService: JourneysService) {}

  @Get()
  @ApiOperation({ summary: '旅途列表', description: '常驻城市优先展示' })
  async list(
    @CurrentUser() user: AuthUser,
    @Query() query: QueryJourneyDto,
  ): Promise<PageResult<JourneyDto>> {
    return this.journeysService.list(user.id, query)
  }

  @Get('map-points')
  @ApiOperation({ summary: '地图点位', description: '有经纬度的旅途，用于渲染地图' })
  async mapPoints(@CurrentUser() user: AuthUser): Promise<MapPointDto[]> {
    return this.journeysService.mapPoints(user.id)
  }

  @Get('timeline')
  @ApiOperation({ summary: '旅途时间轴', description: '按时间正序的分段，含停留天数' })
  async timeline(@CurrentUser() user: AuthUser): Promise<TimelineSegmentDto[]> {
    return this.journeysService.timeline(user.id)
  }

  @Get(':id')
  @ApiOperation({ summary: '旅途详情' })
  async detail(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<JourneyDto> {
    return this.journeysService.detail(user.id, id)
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '新增一段旅途' })
  async create(@CurrentUser() user: AuthUser, @Body() dto: CreateJourneyDto): Promise<JourneyDto> {
    return this.journeysService.create(user.id, dto)
  }

  @Patch(':id')
  @ApiOperation({ summary: '更新旅途', description: '常驻城市会被强制清空结束时间' })
  async update(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateJourneyDto,
  ): Promise<JourneyDto> {
    return this.journeysService.update(user.id, id, dto)
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '删除旅途（软删除）' })
  async remove(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<{ success: true }> {
    return this.journeysService.remove(user.id, id)
  }
}
