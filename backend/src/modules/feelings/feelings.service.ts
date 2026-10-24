/**
 * modules/feelings/feelings.service.ts
 * 感受记录 + 情绪粒度建议 + 每日统计。
 */

import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../../database/prisma.service'
import { BusinessException } from '../../common/exceptions/business.exception'
import { ErrorCode } from '../../common/constants/error-codes'
import { assertOwnership } from '../../common/helpers/ownership.helper'
import { toPageResult, type PageResult } from '../../common/dto/result.dto'
import { suggestRefinements } from '../../common/constants/emotion-dictionary'
import type {
  CreateFeelingDto,
  EmotionWordDto,
  FeelingDto,
  FeelingStatDto,
  QueryFeelingDto,
  RefineSuggestionDto,
  UpdateFeelingDto,
} from './dto/feelings.dto'

const FEELING_SELECT = {
  id: true,
  rawLabel: true,
  refinedLabel: true,
  intensity: true,
  polarity: true,
  content: true,
  trigger: true,
  source: true,
  happenedAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.FeelingSelect

type FeelingRow = Prisma.FeelingGetPayload<{ select: typeof FEELING_SELECT }>

@Injectable()
export class FeelingsService {
  constructor(private readonly prisma: PrismaService) {}

  // ── 查询 ──────────────────────────────────────────────

  async list(userId: string, query: QueryFeelingDto): Promise<PageResult<FeelingDto>> {
    const where: Prisma.FeelingWhereInput = { userId, deletedAt: null }

    if (query.polarity) where.polarity = query.polarity

    if (query.keyword) {
      where.OR = [
        { rawLabel: { contains: query.keyword, mode: 'insensitive' } },
        { refinedLabel: { contains: query.keyword, mode: 'insensitive' } },
        { content: { contains: query.keyword, mode: 'insensitive' } },
      ]
    }

    const from = query.from ? new Date(query.from) : null
    const to = query.to ? new Date(query.to) : null
    if (from && !Number.isNaN(from.getTime())) {
      where.happenedAt = { ...(where.happenedAt as object), gte: from }
    }
    if (to && !Number.isNaN(to.getTime())) {
      where.happenedAt = { ...(where.happenedAt as object), lte: to }
    }

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.feeling.findMany({
        where,
        select: FEELING_SELECT,
        orderBy: { happenedAt: 'desc' },
        skip: query.skip,
        take: query.take,
      }),
      this.prisma.feeling.count({ where }),
    ])

    return toPageResult(rows.map(toFeelingDto), total, query.page, query.pageSize)
  }

  async detail(userId: string, id: string): Promise<FeelingDto> {
    const row = await this.prisma.feeling.findFirst({
      where: { id, deletedAt: null },
      select: { ...FEELING_SELECT, userId: true },
    })
    assertOwnership(row, userId, ErrorCode.FEELING_NOT_FOUND)
    return toFeelingDto(row as FeelingRow)
  }

  // ── 写入 ──────────────────────────────────────────────

  async create(userId: string, dto: CreateFeelingDto): Promise<FeelingDto> {
    // 若用户没填精粒度词，尝试从词表推荐一个最贴近的
    let refined = dto.refinedLabel ?? null
    let polarity = dto.polarity ?? null

    if (!refined) {
      const suggestions = suggestRefinements(dto.rawLabel, dto.polarity)
      if (suggestions.length > 0) {
        refined = suggestions[0]!.refined
        polarity = polarity ?? suggestions[0]!.polarity
      }
    }
    if (!polarity) {
      polarity = derivePolarity(dto.rawLabel, dto.content)
    }

    const row = await this.prisma.feeling.create({
      data: {
        userId,
        rawLabel: dto.rawLabel,
        refinedLabel: refined,
        intensity: dto.intensity ?? 5,
        polarity: polarity as 'positive' | 'neutral' | 'negative',
        content: dto.content ?? null,
        trigger: dto.trigger ?? null,
        happenedAt: dto.happenedAt ? new Date(dto.happenedAt) : new Date(),
      },
      select: FEELING_SELECT,
    })
    return toFeelingDto(row)
  }

  async update(userId: string, id: string, dto: UpdateFeelingDto): Promise<FeelingDto> {
    const existing = await this.prisma.feeling.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, userId: true },
    })
    assertOwnership(existing, userId, ErrorCode.FEELING_NOT_FOUND)

    const data: Prisma.FeelingUpdateInput = {}
    if (dto.refinedLabel !== undefined) data.refinedLabel = dto.refinedLabel
    if (dto.intensity !== undefined) data.intensity = dto.intensity
    if (dto.polarity !== undefined) data.polarity = dto.polarity
    if (dto.content !== undefined) data.content = dto.content
    if (dto.trigger !== undefined) data.trigger = dto.trigger
    if (dto.happenedAt !== undefined) data.happenedAt = new Date(dto.happenedAt)

    const row = await this.prisma.feeling.update({ where: { id }, data, select: FEELING_SELECT })
    return toFeelingDto(row)
  }

  async remove(userId: string, id: string): Promise<{ success: true }> {
    const existing = await this.prisma.feeling.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, userId: true },
    })
    assertOwnership(existing, userId, ErrorCode.FEELING_NOT_FOUND)
    await this.prisma.feeling.update({ where: { id }, data: { deletedAt: new Date() } })
    return { success: true }
  }

  // ── 情绪粒度训练 ─────────────────────────────────────

  /** 依据原话给出更精确的说法候选 */
  refine(rawLabel: string, polarity?: string): RefineSuggestionDto {
    const candidates = suggestRefinements(rawLabel, polarity)
    return {
      rawLabel,
      candidates: candidates.map((c) => ({ raw: c.raw, refined: c.refined, polarity: c.polarity })),
    }
  }

  // ── 统计 ──────────────────────────────────────────────

  /**
   * 某天的感受统计。首页「今天过得怎么样？」用。
   * 只做陈述，不做评价——产品原则：身体的信号不是绩效表。
   */
  async dailyStat(userId: string, date?: string): Promise<FeelingStatDto> {
    const day = date ? new Date(date) : new Date()
    if (Number.isNaN(day.getTime())) {
      throw new BusinessException(ErrorCode.DATE_RANGE_INVALID, '日期格式有误')
    }

    // 取当天 [00:00, 23:59:59.999] 的范围，按服务器本地时区
    const start = new Date(day)
    start.setHours(0, 0, 0, 0)
    const end = new Date(day)
    end.setHours(23, 59, 59, 999)

    const rows = await this.prisma.feeling.findMany({
      where: {
        userId,
        deletedAt: null,
        happenedAt: { gte: start, lte: end },
      },
      select: { polarity: true, intensity: true, refinedLabel: true, rawLabel: true },
    })

    if (rows.length === 0) {
      return {
        date: formatDate(start),
        count: 0,
        dominantPolarity: null,
        averageIntensity: null,
        words: [],
      }
    }

    const polarityCount = new Map<string, number>()
    let intensitySum = 0
    const wordCount = new Map<string, { count: number; polarity: string; raw: string }>()

    for (const r of rows) {
      polarityCount.set(r.polarity, (polarityCount.get(r.polarity) ?? 0) + 1)
      intensitySum += r.intensity
      const key = r.refinedLabel ?? r.rawLabel
      const prev = wordCount.get(key)
      if (prev) prev.count += 1
      else {
        wordCount.set(key, { count: 1, polarity: r.polarity, raw: r.rawLabel })
      }
    }

    let dominant: string | null = null
    let max = -1
    for (const [k, v] of polarityCount) {
      if (v > max) {
        max = v
        dominant = k
      }
    }

    const words: EmotionWordDto[] = [...wordCount.entries()]
      .sort((a, b) => b[1].count - a[1].count)
      .map(([refined, v]) => ({ raw: v.raw, refined, polarity: v.polarity }))

    return {
      date: formatDate(start),
      count: rows.length,
      dominantPolarity: dominant,
      averageIntensity: Math.round((intensitySum / rows.length) * 10) / 10,
      words,
    }
  }
}

// ── 出参映射 ──────────────────────────────────────────

function toFeelingDto(row: FeelingRow): FeelingDto {
  return {
    id: row.id,
    rawLabel: row.rawLabel,
    refinedLabel: row.refinedLabel,
    intensity: row.intensity,
    polarity: row.polarity,
    content: row.content,
    trigger: row.trigger,
    source: row.source,
    happenedAt: row.happenedAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

/** 从原话与内容里粗略推断极性（词表命中优先） */
function derivePolarity(rawLabel: string, content?: string): 'positive' | 'neutral' | 'negative' {
  const s = suggestRefinements(rawLabel)
  if (s.length > 0) return s[0]!.polarity

  const text = `${rawLabel} ${content ?? ''}`
  const negative = ['难过', '生气', '焦虑', '累', '痛苦', '烦', '孤独', '怕', '崩溃', '受不了']
  const positive = ['开心', '好', '爱', '感谢', '顺利', '成功', '轻松', '期待']
  if (negative.some((w) => text.includes(w))) return 'negative'
  if (positive.some((w) => text.includes(w))) return 'positive'
  return 'neutral'
}

function formatDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
