/**
 * modules/feelings/feelings.controller.ts
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
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger'
import { FeelingsService } from './feelings.service'
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator'
import { PageResult } from '../../common/dto/result.dto'
import {
  CreateFeelingDto,
  FeelingDto,
  FeelingStatDto,
  QueryFeelingDto,
  RefineSuggestionDto,
  UpdateFeelingDto,
} from './dto/feelings.dto'

@ApiTags('感受')
@ApiBearerAuth()
@Controller('feelings')
export class FeelingsController {
  constructor(private readonly feelingsService: FeelingsService) {}

  @Get()
  @ApiOperation({ summary: '感受记录列表', description: '支持极性过滤、关键词搜索、日期区间' })
  async list(
    @CurrentUser() user: AuthUser,
    @Query() query: QueryFeelingDto,
  ): Promise<PageResult<FeelingDto>> {
    return this.feelingsService.list(user.id, query)
  }

  @Get('daily-stat')
  @ApiOperation({
    summary: '某天的感受统计',
    description: '首页「今天过得怎么样？」用。只做陈述，不做评价。',
  })
  @ApiQuery({ name: 'date', required: false, description: 'YYYY-MM-DD，默认今天' })
  async dailyStat(
    @CurrentUser() user: AuthUser,
    @Query('date') date?: string,
  ): Promise<FeelingStatDto> {
    return this.feelingsService.dailyStat(user.id, date)
  }

  @Get('refine')
  @ApiOperation({
    summary: '情绪粒度建议',
    description: '把「难受」精确到「憋屈 / 不甘 / 被忽视」。基于本地 RULER 词表，不调用大模型。',
  })
  @ApiQuery({ name: 'rawLabel', required: true, description: '用户的原话' })
  @ApiQuery({ name: 'polarity', required: false, enum: ['positive', 'neutral', 'negative'] })
  refine(
    @Query('rawLabel') rawLabel: string,
    @Query('polarity') polarity?: string,
  ): RefineSuggestionDto {
    return this.feelingsService.refine(rawLabel ?? '', polarity)
  }

  @Get(':id')
  @ApiOperation({ summary: '感受详情' })
  async detail(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<FeelingDto> {
    return this.feelingsService.detail(user.id, id)
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '记录一次感受' })
  async create(@CurrentUser() user: AuthUser, @Body() dto: CreateFeelingDto): Promise<FeelingDto> {
    return this.feelingsService.create(user.id, dto)
  }

  @Patch(':id')
  @ApiOperation({ summary: '更新感受' })
  async update(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateFeelingDto,
  ): Promise<FeelingDto> {
    return this.feelingsService.update(user.id, id, dto)
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '删除感受（软删除）' })
  async remove(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<{ success: true }> {
    return this.feelingsService.remove(user.id, id)
  }
}
