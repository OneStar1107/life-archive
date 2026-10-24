/**
 * modules/memories/memories.controller.ts
 * 记忆节点 / 图谱 / 时间轴。
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
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger'
import { MemoriesService } from './memories.service'
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator'
import { PageResult } from '../../common/dto/result.dto'
import {
  CreateMemoryDto,
  CreateRelationDto,
  GraphDto,
  MemoryDto,
  PatchMemoryDto,
  QueryMemoryDto,
  RelationDto,
  TimelineDto,
} from './dto/memories.dto'

@ApiTags('记忆')
@ApiBearerAuth()
@Controller('memories')
export class MemoriesController {
  constructor(private readonly memoriesService: MemoriesService) {}

  // ── 节点 ──────────────────────────────────────────────

  @Get()
  @ApiOperation({
    summary: '记忆节点列表',
    description: '支持关键词、标签、人物过滤；hasTimeline 只看有过视角转变的',
  })
  async list(
    @CurrentUser() user: AuthUser,
    @Query() query: QueryMemoryDto,
  ): Promise<PageResult<MemoryDto>> {
    return this.memoriesService.list(user.id, query)
  }

  @Get('graph')
  @ApiOperation({ summary: '记忆图谱', description: '返回节点与边。节点上限 500，边上限 2000' })
  async graph(@CurrentUser() user: AuthUser): Promise<GraphDto> {
    return this.memoriesService.graph(user.id)
  }

  @Get('timeline')
  @ApiOperation({
    summary: '记忆时间轴',
    description: '★「当时的我 vs 现在的我」双时间戳对照，这是本产品的差异化能力',
  })
  async timeline(@CurrentUser() user: AuthUser): Promise<TimelineDto> {
    return this.memoriesService.timeline(user.id)
  }

  @Get(':id')
  @ApiOperation({ summary: '记忆节点详情' })
  @ApiParam({ name: 'id', format: 'uuid' })
  async detail(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<MemoryDto> {
    return this.memoriesService.detail(user.id, id)
  }

  @Get(':id/relations')
  @ApiOperation({ summary: '某节点的全部关联（出边 + 入边）' })
  async relations(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<RelationDto[]> {
    return this.memoriesService.listRelations(user.id, id)
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '新建记忆节点' })
  async create(@CurrentUser() user: AuthUser, @Body() dto: CreateMemoryDto): Promise<MemoryDto> {
    return this.memoriesService.create(user.id, dto)
  }

  @Patch(':id')
  @ApiOperation({
    summary: '更新记忆节点',
    description: '只更新显式传入的字段。写入 pastSelfView / presentSelfView 会自动记录审视时间。',
  })
  async update(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: PatchMemoryDto,
  ): Promise<MemoryDto> {
    return this.memoriesService.update(user.id, id, dto)
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '删除记忆节点', description: '软删除，同时软删其关联' })
  async remove(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<{ success: true }> {
    return this.memoriesService.remove(user.id, id)
  }

  // ── 关联 ──────────────────────────────────────────────

  @Post('relations')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '建立记忆关联', description: '禁止自环；重复关联返回 40013' })
  async addRelation(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateRelationDto,
  ): Promise<RelationDto> {
    return this.memoriesService.addRelation(user.id, dto)
  }

  @Delete('relations/:relationId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '删除记忆关联' })
  async removeRelation(
    @CurrentUser() user: AuthUser,
    @Param('relationId', new ParseUUIDPipe({ version: '4' })) relationId: string,
  ): Promise<{ success: true }> {
    return this.memoriesService.removeRelation(user.id, relationId)
  }
}
