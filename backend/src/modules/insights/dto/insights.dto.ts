/**
 * modules/insights/dto/insights.dto.ts
 * 洞察的入参与出参。
 *
 * 洞察是「系统对用户的观察」，不是命令：
 *   1. kind 决定洞察的呈现样式（见 schema 的 InsightKind 注释）
 *   2. confidence 0~100 是系统自己的把握，不是对用户的评价
 *   3. readAt / adoptedAt / feedback 记录用户对这条洞察的反应，
 *      前端据此决定是否再提醒——已读不再打扰。
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Transform } from 'class-transformer'
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator'
import { PageDto } from '../../../common/dto/page.dto'

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value

/** 与 schema.prisma 的 InsightKind 一一对应 */
export const INSIGHT_KINDS = [
  'connection',
  'emotion_granularity',
  'belief_conflict',
  'timeline_diff',
  'self_distance',
] as const

/** 用户反馈：喜欢 / 不喜欢 / 中性（null 表示还没反馈过） */
export const INSIGHT_FEEDBACKS = ['like', 'dislike', 'none'] as const

// ── 出参 ──────────────────────────────────────────────

export class InsightDto {
  @ApiProperty() id!: string
  @ApiProperty({
    enum: INSIGHT_KINDS,
    description:
      'connection 潜在联系 / emotion_granularity 情绪粒度 / belief_conflict 信念矛盾 / timeline_diff 时间轴对照 / self_distance 自我距离化',
  })
  kind!: string
  @ApiProperty({ description: '洞察标题' }) title!: string
  @ApiProperty({ description: '洞察正文' }) body!: string
  @ApiProperty({ description: '系统置信度 0~100，不是对用户的评价' }) confidence!: number
  @ApiProperty({ isArray: true, type: String, description: '依据的记忆节点 ID' })
  evidenceMemoryIds!: string[]
  @ApiProperty({ isArray: true, type: String, description: '依据的感受 ID' })
  evidenceFeelingIds!: string[]
  @ApiProperty({ nullable: true, description: '已读时间，null 表示未读' }) readAt!: string | null
  @ApiProperty({ nullable: true, description: '采纳时间，null 表示未采纳' }) adoptedAt!:
    string | null
  @ApiProperty({ nullable: true, enum: [...INSIGHT_FEEDBACKS, null], description: '用户反馈' })
  feedback!: string | null
  @ApiProperty() createdAt!: string
  @ApiProperty() updatedAt!: string
}

export class InsightStatsDto {
  @ApiProperty({ description: '洞察总数（不含已软删）' }) total!: number
  @ApiProperty({ description: '未读数量' }) unread!: number
  @ApiProperty({ description: '已采纳数量' }) adopted!: number
  @ApiProperty({
    description: '按类型分组的数量，key 为 InsightKind',
    example: { connection: 3, belief_conflict: 1 },
  })
  byKind!: Record<string, number>
}

// ── 入参 ──────────────────────────────────────────────

export class QueryInsightDto extends PageDto {
  @ApiPropertyOptional({ enum: INSIGHT_KINDS, description: '按洞察类型过滤' })
  @IsOptional()
  @IsEnum(INSIGHT_KINDS)
  kind?: (typeof INSIGHT_KINDS)[number]

  @ApiPropertyOptional({ description: '只看未读的（首页红点用）' })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => value === 'true' || value === true)
  unreadOnly?: boolean

  @ApiPropertyOptional({ enum: INSIGHT_FEEDBACKS, description: '按用户反馈过滤' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(16)
  feedback?: string
}

/** 反馈入参：只有 feedback 一个字段，采纳走独立路由 */
export class UpdateInsightDto {
  @ApiPropertyOptional({
    enum: INSIGHT_FEEDBACKS,
    description: '喜欢 / 不喜欢 / none（撤销反馈）',
  })
  @IsOptional()
  @Transform(trim)
  @IsEnum(INSIGHT_FEEDBACKS, { message: 'feedback 只能是 like / dislike / none' })
  feedback?: (typeof INSIGHT_FEEDBACKS)[number]
}
