/**
 * modules/insights/insights.controller.ts
 * 洞察的读取与用户回应。
 *
 * 说明：控制器**只返回业务数据**，Result<T> 包装由 ResponseInterceptor 统一完成，
 * 本文件里不出现 new Result(...)。业务失败一律以 BusinessException 抛出，
 * 由 all-exception.filter.ts 翻译。
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
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger'
import { InsightsService } from './insights.service'
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator'
import { type PageResult } from '../../common/dto/result.dto'
// QueryInsightDto / UpdateInsightDto 被 @Query() / @Body() 使用：
// emitDecoratorMetadata 需要它们的「值」引用，type-only 导入会在编译后被擦除，
// 实测 design:paramtypes 退化成 Function（不是 DTO 类），ValidationPipe 白名单为空
// → 任何查询参数都报 "property X should not exist"。
// InsightDto / InsightStatsDto 仅作返回类型，保持 type-only。
import {
  type InsightDto,
  type InsightStatsDto,
  QueryInsightDto,
  UpdateInsightDto,
} from './dto/insights.dto'

@ApiTags('insights')
@ApiBearerAuth()
@Controller('insights')
export class InsightsController {
  constructor(private readonly insightsService: InsightsService) {}

  // ── 查询 ──────────────────────────────────────────────

  @Get()
  @ApiOperation({
    summary: '洞察列表',
    description:
      '按创建时间倒序。支持按类型过滤；unreadOnly=true 只看未读（首页红点用）；feedback 按用户反馈过滤。',
  })
  async list(
    @CurrentUser() user: AuthUser,
    @Query() query: QueryInsightDto,
  ): Promise<PageResult<InsightDto>> {
    return this.insightsService.list(user.id, query)
  }

  @Get('stats')
  @ApiOperation({
    summary: '洞察统计',
    description:
      '返回总数、未读数、已采纳数与按类型的分布。byKind 始终包含全部五种类型，未产生的记 0。',
  })
  async stats(@CurrentUser() user: AuthUser): Promise<InsightStatsDto> {
    return this.insightsService.stats(user.id)
  }

  @Get(':id')
  @ApiOperation({ summary: '洞察详情', description: '包含依据的记忆与感受 ID，供前端串联上下文。' })
  @ApiParam({ name: 'id', format: 'uuid' })
  async detail(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<InsightDto> {
    return this.insightsService.detail(user.id, id)
  }

  // ── 用户的回应 ────────────────────────────────────────

  @Post(':id/read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '标记洞察已读',
    description: '幂等操作：重复标记直接返回当前状态，不报错也不改写首次已读时间。',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  async markRead(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<InsightDto> {
    return this.insightsService.markRead(user.id, id)
  }

  @Post(':id/feedback')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '提交洞察反馈',
    description: 'feedback 取值 like / dislike / none（none 表示撤销反馈）。给出反馈即视为已读。',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  async setFeedback(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateInsightDto,
  ): Promise<InsightDto> {
    return this.insightsService.setFeedback(user.id, id, dto.feedback)
  }

  @Post(':id/adopt')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '采纳洞察',
    description: '只能采纳一次，重复采纳返回 50007。采纳即视为已读。',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  async adopt(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<InsightDto> {
    return this.insightsService.adopt(user.id, id)
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '删除洞察', description: '软删除（置 deletedAt），不物理删除。' })
  @ApiParam({ name: 'id', format: 'uuid' })
  async remove(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<{ success: true }> {
    return this.insightsService.remove(user.id, id)
  }
}
