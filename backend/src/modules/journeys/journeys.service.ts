/**
 * modules/journeys/journeys.service.ts
 * 旅途：去过的地方 / 常驻城市 / 时间轴分段。
 */

import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../../database/prisma.service'
import { BusinessException } from '../../common/exceptions/business.exception'
import { ErrorCode } from '../../common/constants/error-codes'
import { assertOwnership } from '../../common/helpers/ownership.helper'
import { toPageResult, type PageResult } from '../../common/dto/result.dto'
import type {
  CreateJourneyDto,
  JourneyDto,
  MapPointDto,
  QueryJourneyDto,
  TimelineSegmentDto,
  UpdateJourneyDto,
} from './dto/journeys.dto'

const JOURNEY_SELECT = {
  id: true,
  place: true,
  isResident: true,
  latitude: true,
  longitude: true,
  coverUrl: true,
  startedAt: true,
  endedAt: true,
  note: true,
  memoryIds: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.JourneySelect

type JourneyRow = Prisma.JourneyGetPayload<{ select: typeof JOURNEY_SELECT }>

@Injectable()
export class JourneysService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string, query: QueryJourneyDto): Promise<PageResult<JourneyDto>> {
    const where: Prisma.JourneyWhereInput = { userId, deletedAt: null }
    if (query.isResident !== undefined) where.isResident = query.isResident

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.journey.findMany({
        where,
        select: JOURNEY_SELECT,
        orderBy: [{ isResident: 'desc' }, { startedAt: 'desc' }],
        skip: query.skip,
        take: query.take,
      }),
      this.prisma.journey.count({ where }),
    ])

    return toPageResult(rows.map(toJourneyDto), total, query.page, query.pageSize)
  }

  async detail(userId: string, id: string): Promise<JourneyDto> {
    const row = await this.prisma.journey.findFirst({
      where: { id, deletedAt: null },
      select: { ...JOURNEY_SELECT, userId: true },
    })
    assertOwnership(row, userId, ErrorCode.JOURNEY_NOT_FOUND)
    return toJourneyDto(row as JourneyRow)
  }

  async create(userId: string, dto: CreateJourneyDto): Promise<JourneyDto> {
    const range = this.resolveRange(dto.startedAt, dto.endedAt, dto.isResident)
    await this.assertMemoriesOwned(userId, dto.memoryIds)

    const row = await this.prisma.journey.create({
      data: {
        userId,
        place: dto.place,
        isResident: dto.isResident ?? false,
        latitude: dto.latitude ?? null,
        longitude: dto.longitude ?? null,
        coverUrl: dto.coverUrl ?? null,
        startedAt: range.startedAt,
        endedAt: range.endedAt,
        note: dto.note ?? null,
        memoryIds: dto.memoryIds ?? [],
      },
      select: JOURNEY_SELECT,
    })
    return toJourneyDto(row)
  }

  async update(userId: string, id: string, dto: UpdateJourneyDto): Promise<JourneyDto> {
    const found = await this.prisma.journey.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, userId: true, startedAt: true, endedAt: true, isResident: true },
    })
    // ★ 必须用返回值，strict 模式下原变量仍是 T | null
    const existing = assertOwnership(found, userId, ErrorCode.JOURNEY_NOT_FOUND)

    if (dto.memoryIds) await this.assertMemoriesOwned(userId, dto.memoryIds)

    const data: Prisma.JourneyUpdateInput = {}
    if (dto.place !== undefined) data.place = dto.place
    if (dto.isResident !== undefined) data.isResident = dto.isResident
    if (dto.latitude !== undefined) data.latitude = dto.latitude
    if (dto.longitude !== undefined) data.longitude = dto.longitude
    if (dto.coverUrl !== undefined) data.coverUrl = dto.coverUrl
    if (dto.note !== undefined) data.note = dto.note
    if (dto.memoryIds !== undefined) data.memoryIds = dto.memoryIds

    // 起止日期任意一个变化，都要重新做区间校验
    if (dto.startedAt !== undefined || dto.endedAt !== undefined || dto.isResident !== undefined) {
      const range = this.resolveRange(
        dto.startedAt ?? existing.startedAt?.toISOString(),
        dto.endedAt ?? existing.endedAt?.toISOString(),
        dto.isResident ?? existing.isResident,
      )
      data.startedAt = range.startedAt
      data.endedAt = range.endedAt
      if (dto.isResident !== undefined) data.isResident = dto.isResident
    }

    const row = await this.prisma.journey.update({ where: { id }, data, select: JOURNEY_SELECT })
    return toJourneyDto(row)
  }

  async remove(userId: string, id: string): Promise<{ success: true }> {
    const existing = await this.prisma.journey.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, userId: true },
    })
    assertOwnership(existing, userId, ErrorCode.JOURNEY_NOT_FOUND)
    await this.prisma.journey.update({ where: { id }, data: { deletedAt: new Date() } })
    return { success: true }
  }

  // ── 地图点位 ──────────────────────────────────────────

  async mapPoints(userId: string): Promise<MapPointDto[]> {
    const rows = await this.prisma.journey.findMany({
      where: { userId, deletedAt: null },
      select: {
        id: true,
        place: true,
        latitude: true,
        longitude: true,
        isResident: true,
        startedAt: true,
        endedAt: true,
        note: true,
      },
      orderBy: { startedAt: 'desc' },
      take: 500,
    })
    return rows.map((r) => ({
      id: r.id,
      place: r.place,
      latitude: r.latitude,
      longitude: r.longitude,
      isResident: r.isResident,
      startedAt: r.startedAt?.toISOString() ?? null,
      endedAt: r.endedAt?.toISOString() ?? null,
      note: r.note,
    }))
  }

  // ── 时间轴分段 ────────────────────────────────────────

  async timeline(userId: string): Promise<TimelineSegmentDto[]> {
    const rows = await this.prisma.journey.findMany({
      where: { userId, deletedAt: null },
      select: {
        id: true,
        place: true,
        isResident: true,
        startedAt: true,
        endedAt: true,
        note: true,
      },
      orderBy: { startedAt: 'asc' },
      take: 300,
    })

    return rows.map((r) => ({
      id: r.id,
      place: r.place,
      isResident: r.isResident,
      startedAt: r.startedAt?.toISOString() ?? null,
      endedAt: r.endedAt?.toISOString() ?? null,
      days: daysBetween(r.startedAt, r.endedAt),
      note: r.note,
    }))
  }

  // ── 内部 ──────────────────────────────────────────────

  private resolveRange(
    startedAt: string | undefined | null,
    endedAt: string | undefined | null,
    isResident?: boolean,
  ): { startedAt: Date | null; endedAt: Date | null } {
    const s = startedAt ? new Date(startedAt) : null
    const e = endedAt ? new Date(endedAt) : null

    if (s && Number.isNaN(s.getTime())) {
      throw new BusinessException(ErrorCode.JOURNEY_DATE_INVALID, '开始日期格式有误')
    }
    if (e && Number.isNaN(e.getTime())) {
      throw new BusinessException(ErrorCode.JOURNEY_DATE_INVALID, '结束日期格式有误')
    }
    if (s && e && e.getTime() < s.getTime()) {
      throw new BusinessException(ErrorCode.JOURNEY_DATE_INVALID, '旅途的结束时间不能早于开始时间')
    }
    // 常驻城市不应该有结束时间
    if (isResident === true) return { startedAt: s, endedAt: null }
    return { startedAt: s, endedAt: e }
  }

  private async assertMemoriesOwned(userId: string, memoryIds?: string[]): Promise<void> {
    if (!memoryIds || memoryIds.length === 0) return
    const count = await this.prisma.memory.count({
      where: { id: { in: memoryIds }, userId, deletedAt: null },
    })
    if (count !== memoryIds.length) {
      throw new BusinessException(ErrorCode.MEMORY_NOT_FOUND, '关联的记忆里有不存在的条目')
    }
  }
}

function toJourneyDto(row: JourneyRow): JourneyDto {
  return {
    id: row.id,
    place: row.place,
    isResident: row.isResident,
    latitude: row.latitude,
    longitude: row.longitude,
    coverUrl: row.coverUrl,
    startedAt: row.startedAt?.toISOString() ?? null,
    endedAt: row.endedAt?.toISOString() ?? null,
    note: row.note,
    memoryIds: row.memoryIds,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

function daysBetween(start: Date | null, end: Date | null): number | null {
  if (!start || !end) return null
  return Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400_000))
}
