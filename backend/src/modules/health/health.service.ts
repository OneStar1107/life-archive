/**
 * modules/health/health.service.ts
 * 身体信号：只记录与呈现，不做绩效评价。
 *
 * 产品原则（见原型文案）：
 *   「身体的信号不是绩效表。我不催你早睡、不逼你达标，只是把状态照给你看。」
 * 因此本服务**不生成任何评价性文案**，narrative 只做客观陈述。
 */

import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../../database/prisma.service'
import { BusinessException } from '../../common/exceptions/business.exception'
import { ErrorCode } from '../../common/constants/error-codes'
import { assertOwnership } from '../../common/helpers/ownership.helper'
import { toPageResult, type PageResult } from '../../common/dto/result.dto'
import type {
  CreateHealthMetricDto,
  HealthMetricDto,
  OverviewDto,
  QueryHealthMetricDto,
  TrendDto,
  TrendPointDto,
} from './dto/health.dto'

const METRIC_SELECT = {
  id: true,
  metricType: true,
  value: true,
  unit: true,
  subjectiveState: true,
  note: true,
  source: true,
  measuredAt: true,
  createdAt: true,
} satisfies Prisma.HealthMetricSelect

type MetricRow = Prisma.HealthMetricGetPayload<{ select: typeof METRIC_SELECT }>

/** 各指标的展示名与合理区间（仅用于说明，不用于判定达标） */
const METRIC_META: Record<string, { label: string; unit: string; range: [number, number] }> = {
  sleep: { label: '睡眠', unit: '小时', range: [0, 24] },
  steps: { label: '步数', unit: '次', range: [0, 200000] },
  heart_rate: { label: '心率', unit: 'bpm', range: [20, 250] },
  duration: { label: '时长', unit: '分钟', range: [0, 1440] },
  mood_energy: { label: '状态', unit: '级', range: [1, 10] },
  weight: { label: '体重', unit: 'kg', range: [20, 400] },
}

@Injectable()
export class HealthService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string, query: QueryHealthMetricDto): Promise<PageResult<HealthMetricDto>> {
    const where: Prisma.HealthMetricWhereInput = { userId, deletedAt: null }
    if (query.metricType) where.metricType = query.metricType

    const from = query.from ? new Date(query.from) : null
    const to = query.to ? new Date(query.to) : null
    if (from && to && from.getTime() > to.getTime()) {
      throw new BusinessException(ErrorCode.DATE_RANGE_INVALID, '开始日期不能晚于结束日期')
    }
    if (from && !Number.isNaN(from.getTime())) {
      where.measuredAt = { ...(where.measuredAt as object), gte: from }
    }
    if (to && !Number.isNaN(to.getTime())) {
      where.measuredAt = { ...(where.measuredAt as object), lte: to }
    }

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.healthMetric.findMany({
        where,
        select: METRIC_SELECT,
        orderBy: { measuredAt: 'desc' },
        skip: query.skip,
        take: query.take,
      }),
      this.prisma.healthMetric.count({ where }),
    ])

    return toPageResult(rows.map(toMetricDto), total, query.page, query.pageSize)
  }

  async detail(userId: string, id: string): Promise<HealthMetricDto> {
    const row = await this.prisma.healthMetric.findFirst({
      where: { id, deletedAt: null },
      select: { ...METRIC_SELECT, userId: true },
    })
    assertOwnership(row, userId, ErrorCode.HEALTH_METRIC_NOT_FOUND)
    return toMetricDto(row as MetricRow)
  }

  async create(userId: string, dto: CreateHealthMetricDto): Promise<HealthMetricDto> {
    const meta = METRIC_META[dto.metricType]
    if (meta) {
      const [lo, hi] = meta.range
      if (dto.value < lo || dto.value > hi) {
        throw new BusinessException(
          ErrorCode.HEALTH_METRIC_VALUE_INVALID,
          `${meta.label}的数值应该在 ${lo} 到 ${hi} ${meta.unit}之间，你填的是 ${dto.value}`,
        )
      }
    }

    const row = await this.prisma.healthMetric.create({
      data: {
        userId,
        metricType: dto.metricType,
        value: dto.value,
        unit: dto.unit,
        subjectiveState: dto.subjectiveState ?? null,
        note: dto.note ?? null,
        measuredAt: dto.measuredAt ? new Date(dto.measuredAt) : new Date(),
      },
      select: METRIC_SELECT,
    })
    return toMetricDto(row)
  }

  async remove(userId: string, id: string): Promise<{ success: true }> {
    const existing = await this.prisma.healthMetric.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, userId: true },
    })
    assertOwnership(existing, userId, ErrorCode.HEALTH_METRIC_NOT_FOUND)
    await this.prisma.healthMetric.update({ where: { id }, data: { deletedAt: new Date() } })
    return { success: true }
  }

  // ── 趋势 ──────────────────────────────────────────────

  async trend(userId: string, metricType: string, days = 30): Promise<TrendDto> {
    const meta = METRIC_META[metricType]
    if (!meta) throw new BusinessException(ErrorCode.PARAM_INVALID, '未知的指标类型')

    const capped = Math.min(Math.max(days, 1), 365)
    const from = new Date()
    from.setDate(from.getDate() - capped)
    from.setHours(0, 0, 0, 0)

    const rows = await this.prisma.healthMetric.findMany({
      where: {
        userId,
        deletedAt: null,
        metricType,
        measuredAt: { gte: from },
      },
      select: { value: true, measuredAt: true, subjectiveState: true },
      orderBy: { measuredAt: 'asc' },
      take: 1000,
    })

    const points: TrendPointDto[] = rows.map((r) => ({
      date: formatDate(r.measuredAt),
      value: r.value,
      subjectiveState: r.subjectiveState,
    }))

    const values = rows.map((r) => r.value)
    const average = values.length > 0 ? round1(sum(values) / values.length) : null
    const min = values.length > 0 ? Math.min(...values) : null
    const max = values.length > 0 ? Math.max(...values) : null

    return {
      metricType,
      unit: meta.unit,
      points,
      average,
      min,
      max,
      narrative: buildNarrative(meta.label, meta.unit, average, min, max, points.length, capped),
    }
  }

  async overview(userId: string, days = 7): Promise<OverviewDto> {
    const capped = Math.min(Math.max(days, 1), 90)

    const trends: TrendDto[] = []
    // 只展示用户实际记录过的指标类型，不硬塞全部
    const types = await this.prisma.healthMetric.findMany({
      where: { userId, deletedAt: null },
      select: { metricType: true },
      distinct: ['metricType'],
    })

    for (const t of types) {
      trends.push(await this.trend(userId, t.metricType, capped))
    }

    const streakDays = await this.calcStreak(userId)

    return {
      trends,
      streakDays,
      summary: buildSummary(trends, streakDays),
    }
  }

  // ── 内部 ──────────────────────────────────────────────

  /** 连续记录天数：从今天（或昨天）往前数 */
  private async calcStreak(userId: string): Promise<number> {
    const rows = await this.prisma.healthMetric.findMany({
      where: { userId, deletedAt: null },
      select: { measuredAt: true },
      orderBy: { measuredAt: 'desc' },
      take: 400,
    })
    if (rows.length === 0) return 0

    const days = new Set(rows.map((r) => formatDate(r.measuredAt)))
    const cursor = new Date()
    // 今天没记也不算断，从昨天开始算
    if (!days.has(formatDate(cursor))) cursor.setDate(cursor.getDate() - 1)

    let streak = 0
    // 上限 400 天，防止死循环
    for (let i = 0; i < 400; i++) {
      if (!days.has(formatDate(cursor))) break
      streak += 1
      cursor.setDate(cursor.getDate() - 1)
    }
    return streak
  }
}

// ── 文案生成（纯陈述，无评价）──────────────────────────

/** 数值格式化：整数原样、非整数保留 1 位小数，消除 7.800000000000001 这类浮点噪声 */
function fmtNum(v: number | null): string {
  if (v == null) return '—'
  return Number.isInteger(v) ? v.toString() : v.toFixed(1)
}

function buildNarrative(
  label: string,
  unit: string,
  average: number | null,
  min: number | null,
  max: number | null,
  pointCount: number,
  windowDays: number,
): string {
  if (pointCount === 0 || average === null) {
    return `最近 ${windowDays} 天还没有${label}记录。`
  }
  return (
    `最近 ${windowDays} 天里记了 ${pointCount} 次${label}，` +
    `平均 ${fmtNum(average)}${unit}，最低 ${fmtNum(min)}${unit}，最高 ${fmtNum(max)}${unit}。`
  )
}

function buildSummary(trends: TrendDto[], streakDays: number): string {
  if (trends.length === 0) {
    return '还没有记录。这里的数字只是照给你看，不是打分。'
  }
  const parts = trends.map((t) => {
    const meta = METRIC_META[t.metricType]
    return t.average !== null
      ? `${meta?.label ?? t.metricType}平均 ${t.average}${t.unit}`
      : `${meta?.label ?? t.metricType}暂无数据`
  })
  const streak = streakDays > 0 ? `已经连续记了 ${streakDays} 天。` : ''
  return `${parts.join('，')}。${streak}这些都是记录，不是评价。`
}

// ── 工具 ──────────────────────────────────────────────

function toMetricDto(row: MetricRow): HealthMetricDto {
  return {
    id: row.id,
    metricType: row.metricType,
    value: row.value,
    unit: row.unit,
    subjectiveState: row.subjectiveState,
    note: row.note,
    source: row.source,
    measuredAt: row.measuredAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  }
}

function formatDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

function sum(arr: number[]): number {
  return arr.reduce((a, b) => a + b, 0)
}
