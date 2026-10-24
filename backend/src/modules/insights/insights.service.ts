/**
 * modules/insights/insights.service.ts
 * 洞察：我是怎么一点点认识你的。
 *
 * 洞察由离线分析任务写入，本服务只负责「读」与「用户的回应」，
 * 不负责生成洞察内容。
 *
 * 产品铁律（见原型文案）：
 *   1. 洞察是观察，不是命令——已读之后不再重复提醒（unreadOnly 只看未读）。
 *   2. 采纳只能一次，重复采纳返回 50007，让前端能给出明确反馈而不是静默成功。
 *   3. 标记已读必须幂等：用户在列表页已经点过的情况下不应报错。
 *
 * 其余铁律（全模块通用）：
 *   - 每个方法先 assertOwnership 校验归属
 *   - 查询一律 select 白名单，禁止 include / select *
 *   - 软删除用 deletedAt，禁止物理删除
 *   - 禁止 throw new Error()，业务失败一律 BusinessException(code)
 */

import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../../database/prisma.service'
import { BusinessException } from '../../common/exceptions/business.exception'
import { ErrorCode } from '../../common/constants/error-codes'
import { assertOwnership } from '../../common/helpers/ownership.helper'
import { toPageResult, type PageResult } from '../../common/dto/result.dto'
import {
  INSIGHT_FEEDBACKS,
  INSIGHT_KINDS,
  type InsightDto,
  type InsightStatsDto,
  type QueryInsightDto,
} from './dto/insights.dto'

/** 出参 select：白名单，绝不 select * */
const INSIGHT_SELECT = {
  id: true,
  kind: true,
  title: true,
  body: true,
  confidence: true,
  evidenceMemoryIds: true,
  evidenceFeelingIds: true,
  readAt: true,
  adoptedAt: true,
  feedback: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.InsightSelect

type InsightRow = Prisma.InsightGetPayload<{ select: typeof INSIGHT_SELECT }>

@Injectable()
export class InsightsService {
  constructor(private readonly prisma: PrismaService) {}

  // ── 查询 ──────────────────────────────────────────────

  async list(userId: string, query: QueryInsightDto): Promise<PageResult<InsightDto>> {
    const where: Prisma.InsightWhereInput = {
      userId,
      deletedAt: null,
    }

    if (query.kind) where.kind = query.kind
    if (query.unreadOnly) where.readAt = null
    if (query.feedback) where.feedback = query.feedback

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.insight.findMany({
        where,
        select: INSIGHT_SELECT,
        // 最新的洞察排前面：洞察的价值随时间衰减
        orderBy: { createdAt: 'desc' },
        skip: query.skip,
        take: query.take,
      }),
      this.prisma.insight.count({ where }),
    ])

    return toPageResult(
      rows.map((r) => this.toDto(r)),
      total,
      query.page,
      query.pageSize,
    )
  }

  async detail(userId: string, id: string): Promise<InsightDto> {
    const row = await this.prisma.insight.findFirst({
      where: { id, deletedAt: null },
      select: { ...INSIGHT_SELECT, userId: true },
    })
    assertOwnership(row, userId, ErrorCode.INSIGHT_NOT_FOUND)
    return this.toDto(row as InsightRow)
  }

  /** 洞察看板：总数 / 未读 / 已采纳 / 按类型分布 */
  async stats(userId: string): Promise<InsightStatsDto> {
    const base: Prisma.InsightWhereInput = { userId, deletedAt: null }

    // 只取统计所需的三个字段，避免把正文拉进内存
    const [rows, unread, adopted] = await this.prisma.$transaction([
      this.prisma.insight.findMany({
        where: base,
        select: { kind: true, readAt: true },
      }),
      this.prisma.insight.count({ where: { ...base, readAt: null } }),
      this.prisma.insight.count({ where: { ...base, adoptedAt: { not: null } } }),
    ])

    // 五种类型全部出现，未产生的记 0，前端不必为缺失键做兜底
    const byKind: Record<string, number> = {}
    for (const k of INSIGHT_KINDS) byKind[k] = 0
    for (const r of rows) {
      byKind[r.kind] = (byKind[r.kind] ?? 0) + 1
    }

    return { total: rows.length, unread, adopted, byKind }
  }

  // ── 写入 ──────────────────────────────────────────────

  /** 标记已读。幂等：重复标记直接返回当前状态，不报错也不改写 readAt。 */
  async markRead(userId: string, id: string): Promise<InsightDto> {
    const existing = await this.prisma.insight.findFirst({
      where: { id, deletedAt: null },
      select: { ...INSIGHT_SELECT, userId: true },
    })
    // assertOwnership 的返回值已做非空收窄
    const owned = assertOwnership(existing, userId, ErrorCode.INSIGHT_NOT_FOUND)
    if (owned.readAt) return this.toDto(owned as InsightRow)

    const row = await this.prisma.insight.update({
      where: { id },
      data: { readAt: new Date() },
      select: INSIGHT_SELECT,
    })
    return this.toDto(row)
  }

  /** 用户反馈：like / dislike / none（none 表示撤销反馈） */
  async setFeedback(userId: string, id: string, feedback?: string): Promise<InsightDto> {
    if (!feedback || !(INSIGHT_FEEDBACKS as readonly string[]).includes(feedback)) {
      throw new BusinessException(ErrorCode.PARAM_INVALID, '反馈只能是喜欢、不喜欢，或撤销反馈')
    }

    const existing = await this.prisma.insight.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, userId: true, readAt: true },
    })
    const owned = assertOwnership(existing, userId, ErrorCode.INSIGHT_NOT_FOUND)

    const row = await this.prisma.insight.update({
      where: { id },
      // 给出反馈也算看过这条洞察
      data: { feedback, readAt: owned.readAt ?? new Date() },
      select: INSIGHT_SELECT,
    })
    return this.toDto(row)
  }

  /** 采纳洞察。只能一次，重复采纳返回 50007。 */
  async adopt(userId: string, id: string): Promise<InsightDto> {
    const existing = await this.prisma.insight.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, userId: true, adoptedAt: true },
    })
    const owned = assertOwnership(existing, userId, ErrorCode.INSIGHT_NOT_FOUND)

    if (owned.adoptedAt) throw new BusinessException(ErrorCode.INSIGHT_ALREADY_ADOPTED)

    const row = await this.prisma.insight.update({
      where: { id },
      data: { adoptedAt: new Date(), readAt: new Date() },
      select: INSIGHT_SELECT,
    })
    return this.toDto(row)
  }

  /** 软删除：置 deletedAt，不物理删除（洞察可能被后续分析引用） */
  async remove(userId: string, id: string): Promise<{ success: true }> {
    const existing = await this.prisma.insight.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, userId: true },
    })
    assertOwnership(existing, userId, ErrorCode.INSIGHT_NOT_FOUND)

    await this.prisma.insight.update({ where: { id }, data: { deletedAt: new Date() } })
    return { success: true }
  }

  // ── 出参映射 ──────────────────────────────────────────

  /** Prisma 行 → DTO：日期统一 ISO 8601 字符串 */
  private toDto(row: InsightRow): InsightDto {
    return {
      id: row.id,
      kind: row.kind,
      title: row.title,
      body: row.body,
      confidence: row.confidence,
      evidenceMemoryIds: row.evidenceMemoryIds,
      evidenceFeelingIds: row.evidenceFeelingIds,
      readAt: row.readAt?.toISOString() ?? null,
      adoptedAt: row.adoptedAt?.toISOString() ?? null,
      feedback: row.feedback,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }
  }
}
