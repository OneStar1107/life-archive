/**
 * modules/memories/memories.service.ts
 * 记忆节点 + 图谱关联 + 时间轴双时间戳。
 *
 * 全部方法都强制校验 userId 归属。
 */

import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../../database/prisma.service'
import { BusinessException } from '../../common/exceptions/business.exception'
import { ErrorCode } from '../../common/constants/error-codes'
import { assertOwnership } from '../../common/helpers/ownership.helper'
import { toPageResult, type PageResult } from '../../common/dto/result.dto'
import type {
  CreateMemoryDto,
  CreateRelationDto,
  GraphDto,
  MemoryDto,
  PatchMemoryDto,
  QueryMemoryDto,
  RelationDto,
  TimelineDto,
} from './dto/memories.dto'

/** 出参 select：白名单，绝不 select * */
const MEMORY_SELECT = {
  id: true,
  title: true,
  description: true,
  tags: true,
  people: true,
  location: true,
  graphX: true,
  graphY: true,
  icon: true,
  colorToken: true,
  feelingId: true,
  weight: true,
  source: true,
  pastSelfView: true,
  presentSelfView: true,
  pastViewedAt: true,
  presentViewedAt: true,
  occurredAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.MemorySelect

type MemoryRow = Prisma.MemoryGetPayload<{ select: typeof MEMORY_SELECT }>

@Injectable()
export class MemoriesService {
  constructor(private readonly prisma: PrismaService) {}

  // ── 查询 ──────────────────────────────────────────────

  async list(userId: string, query: QueryMemoryDto): Promise<PageResult<MemoryDto>> {
    const where: Prisma.MemoryWhereInput = {
      userId,
      deletedAt: null,
    }

    if (query.keyword) {
      where.OR = [
        { title: { contains: query.keyword, mode: 'insensitive' } },
        { description: { contains: query.keyword, mode: 'insensitive' } },
        { people: { has: query.keyword } },
      ]
    }
    if (query.tags?.length) {
      // PostgreSQL 数组字段：要求包含全部指定标签
      where.AND = query.tags.map((t) => ({ tags: { has: t } }))
    }
    if (query.person) {
      where.people = { has: query.person }
    }
    if (query.hasTimeline) {
      where.AND = [
        ...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []),
        { pastSelfView: { not: null } },
        { presentSelfView: { not: null } },
      ]
    }

    const sortBy = query.sortBy ?? 'createdAt'
    const orderBy: Prisma.MemoryOrderByWithRelationInput =
      sortBy === 'weight'
        ? { weight: query.sortOrder ?? 'desc' }
        : { [sortBy]: query.sortOrder ?? 'desc' }

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.memory.findMany({
        where,
        select: MEMORY_SELECT,
        orderBy,
        skip: query.skip,
        take: query.take,
      }),
      this.prisma.memory.count({ where }),
    ])

    return toPageResult(rows.map(toMemoryDto), total, query.page, query.pageSize)
  }

  async detail(userId: string, id: string): Promise<MemoryDto> {
    const row = await this.prisma.memory.findFirst({
      where: { id, deletedAt: null },
      select: { ...MEMORY_SELECT, userId: true },
    })
    assertOwnership(row, userId, ErrorCode.MEMORY_NOT_FOUND)
    return toMemoryDto(row as MemoryRow)
  }

  // ── 写入 ──────────────────────────────────────────────

  async create(userId: string, dto: CreateMemoryDto): Promise<MemoryDto> {
    // 关联的感受必须属于同一用户
    if (dto.feelingId) {
      const feeling = await this.prisma.feeling.findFirst({
        where: { id: dto.feelingId, userId, deletedAt: null },
        select: { id: true },
      })
      if (!feeling) throw new BusinessException(ErrorCode.FEELING_NOT_FOUND)
    }

    const row = await this.prisma.memory.create({
      data: {
        userId,
        title: dto.title,
        description: dto.description ?? null,
        tags: dto.tags ?? [],
        people: dto.people ?? [],
        location: dto.location ?? null,
        graphX: dto.graphX ?? null,
        graphY: dto.graphY ?? null,
        icon: dto.icon ?? null,
        colorToken: dto.colorToken ?? null,
        feelingId: dto.feelingId ?? null,
        weight: dto.weight ?? 50,
        occurredAt: dto.occurredAt ? new Date(dto.occurredAt) : new Date(),
      },
      select: MEMORY_SELECT,
    })
    return toMemoryDto(row)
  }

  async update(userId: string, id: string, dto: PatchMemoryDto): Promise<MemoryDto> {
    const existing = await this.prisma.memory.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, userId: true },
    })
    assertOwnership(existing, userId, ErrorCode.MEMORY_NOT_FOUND)

    if (dto.feelingId) {
      const feeling = await this.prisma.feeling.findFirst({
        where: { id: dto.feelingId, userId, deletedAt: null },
        select: { id: true },
      })
      if (!feeling) throw new BusinessException(ErrorCode.FEELING_NOT_FOUND)
    }

    // 只更新显式传入的字段
    const data: Prisma.MemoryUpdateInput = {}
    if (dto.title !== undefined) data.title = dto.title
    if (dto.description !== undefined) data.description = dto.description
    if (dto.tags !== undefined) data.tags = dto.tags
    if (dto.people !== undefined) data.people = dto.people
    if (dto.location !== undefined) data.location = dto.location
    if (dto.graphX !== undefined) data.graphX = dto.graphX
    if (dto.graphY !== undefined) data.graphY = dto.graphY
    if (dto.icon !== undefined) data.icon = dto.icon
    if (dto.colorToken !== undefined) data.colorToken = dto.colorToken
    if (dto.weight !== undefined) data.weight = dto.weight
    if (dto.occurredAt !== undefined) data.occurredAt = new Date(dto.occurredAt)
    if (dto.pastSelfView !== undefined) {
      data.pastSelfView = dto.pastSelfView
      // 首次写下「当时的我」时记录时间
      if (!existing) data.pastViewedAt = new Date()
    }
    if (dto.presentSelfView !== undefined) {
      data.presentSelfView = dto.presentSelfView
      data.presentViewedAt = new Date()
    }
    if (dto.feelingId !== undefined) {
      data.feeling = dto.feelingId ? { connect: { id: dto.feelingId } } : { disconnect: true }
    }

    const row = await this.prisma.memory.update({ where: { id }, data, select: MEMORY_SELECT })
    return toMemoryDto(row)
  }

  /** 软删除：置 deletedAt，不物理删除（保留用户数据可恢复性） */
  async remove(userId: string, id: string): Promise<{ success: true }> {
    const existing = await this.prisma.memory.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, userId: true },
    })
    assertOwnership(existing, userId, ErrorCode.MEMORY_NOT_FOUND)

    await this.prisma.$transaction([
      this.prisma.memory.update({ where: { id }, data: { deletedAt: new Date() } }),
      // 连带软删相关关联
      this.prisma.memoryRelation.updateMany({
        where: {
          userId,
          deletedAt: null,
          OR: [{ sourceId: id }, { targetId: id }],
        },
        data: { deletedAt: new Date() },
      }),
    ])
    return { success: true }
  }

  // ── 图谱关联 ──────────────────────────────────────────

  async addRelation(userId: string, dto: CreateRelationDto): Promise<RelationDto> {
    if (dto.sourceId === dto.targetId) {
      throw new BusinessException(ErrorCode.RELATION_SELF_LOOP)
    }

    // 两个端点都必须属于当前用户
    const [source, target] = await Promise.all([
      this.prisma.memory.findFirst({
        where: { id: dto.sourceId, userId, deletedAt: null },
        select: { id: true },
      }),
      this.prisma.memory.findFirst({
        where: { id: dto.targetId, userId, deletedAt: null },
        select: { id: true },
      }),
    ])
    if (!source) throw new BusinessException(ErrorCode.MEMORY_NOT_FOUND)
    if (!target) throw new BusinessException(ErrorCode.MEMORY_NOT_FOUND)

    // 反向边已存在时，视为同一条关系
    const reverse = await this.prisma.memoryRelation.findFirst({
      where: { userId, deletedAt: null, sourceId: dto.targetId, targetId: dto.sourceId },
      select: { id: true },
    })
    if (reverse) throw new BusinessException(ErrorCode.RELATION_EXISTS)

    const existing = await this.prisma.memoryRelation.findFirst({
      where: {
        userId,
        deletedAt: null,
        sourceId: dto.sourceId,
        targetId: dto.targetId,
        kind: dto.kind,
      },
      select: { id: true },
    })
    if (existing) throw new BusinessException(ErrorCode.RELATION_EXISTS)

    const row = await this.prisma.memoryRelation.create({
      data: {
        userId,
        sourceId: dto.sourceId,
        targetId: dto.targetId,
        kind: dto.kind,
        strength: dto.strength ?? 50,
        note: dto.note ?? null,
      },
      select: {
        id: true,
        sourceId: true,
        targetId: true,
        kind: true,
        strength: true,
        note: true,
        discovered: true,
        createdAt: true,
      },
    })
    return toRelationDto(row)
  }

  async listRelations(userId: string, memoryId: string): Promise<RelationDto[]> {
    const memory = await this.prisma.memory.findFirst({
      where: { id: memoryId, userId, deletedAt: null },
      select: { id: true },
    })
    if (!memory) throw new BusinessException(ErrorCode.MEMORY_NOT_FOUND)

    const rows = await this.prisma.memoryRelation.findMany({
      where: {
        userId,
        deletedAt: null,
        OR: [{ sourceId: memoryId }, { targetId: memoryId }],
      },
      select: {
        id: true,
        sourceId: true,
        targetId: true,
        kind: true,
        strength: true,
        note: true,
        discovered: true,
        createdAt: true,
      },
      orderBy: { strength: 'desc' },
    })
    return rows.map(toRelationDto)
  }

  async removeRelation(userId: string, relationId: string): Promise<{ success: true }> {
    const row = await this.prisma.memoryRelation.findFirst({
      where: { id: relationId, deletedAt: null },
      select: { id: true, userId: true },
    })
    assertOwnership(row, userId, ErrorCode.NOT_FOUND)
    await this.prisma.memoryRelation.update({
      where: { id: relationId },
      data: { deletedAt: new Date() },
    })
    return { success: true }
  }

  // ── 图谱 / 时间轴 ─────────────────────────────────────

  /**
   * 记忆图谱：节点 + 边。
   * 节点数上限 500，防止图谱接口在大数据量下超时。
   */
  async graph(userId: string, limit = 200): Promise<GraphDto> {
    const capped = Math.min(Math.max(limit, 1), 500)

    const [memories, edges] = await Promise.all([
      this.prisma.memory.findMany({
        where: { userId, deletedAt: null },
        select: {
          id: true,
          title: true,
          icon: true,
          colorToken: true,
          weight: true,
          graphX: true,
          graphY: true,
        },
        orderBy: { weight: 'desc' },
        take: capped,
      }),
      this.prisma.memoryRelation.findMany({
        where: { userId, deletedAt: null },
        select: { id: true, sourceId: true, targetId: true, kind: true, strength: true },
        take: capped * 4,
      }),
    ])

    const nodeIds = new Set(memories.map((m) => m.id))

    // 度数统计，节点大小 = 权重 + 连接数
    const degree = new Map<string, number>()
    for (const e of edges) {
      if (nodeIds.has(e.sourceId)) degree.set(e.sourceId, (degree.get(e.sourceId) ?? 0) + 1)
      if (nodeIds.has(e.targetId)) degree.set(e.targetId, (degree.get(e.targetId) ?? 0) + 1)
    }

    return {
      nodes: memories.map((m) => ({
        id: m.id,
        title: m.title,
        icon: m.icon,
        colorToken: m.colorToken,
        weight: m.weight,
        graphX: m.graphX,
        graphY: m.graphY,
        degree: degree.get(m.id) ?? 0,
      })),
      // 只保留两端都在节点集合里的边，避免前端渲染悬空连线
      edges: edges
        .filter((e) => nodeIds.has(e.sourceId) && nodeIds.has(e.targetId))
        .map((e) => ({
          id: e.id,
          sourceId: e.sourceId,
          targetId: e.targetId,
          kind: e.kind,
          strength: e.strength,
        })),
    }
  }

  /**
   * 记忆时间轴：「当时的我 vs 现在的我」。
   * 这是本产品的差异化功能——竞品普遍只有单时间戳。
   */
  async timeline(userId: string, limit = 300): Promise<TimelineDto> {
    const capped = Math.min(Math.max(limit, 1), 500)
    const rows = await this.prisma.memory.findMany({
      where: { userId, deletedAt: null },
      select: {
        id: true,
        title: true,
        icon: true,
        colorToken: true,
        occurredAt: true,
        pastSelfView: true,
        presentSelfView: true,
        pastViewedAt: true,
        presentViewedAt: true,
      },
      orderBy: { occurredAt: 'desc' },
      take: capped,
    })

    const entries = rows.map((r) => ({
      memoryId: r.id,
      title: r.title,
      icon: r.icon,
      colorToken: r.colorToken,
      occurredAt: r.occurredAt.toISOString(),
      pastSelfView: r.pastSelfView,
      presentSelfView: r.presentSelfView,
      pastViewedAt: r.pastViewedAt?.toISOString() ?? null,
      presentViewedAt: r.presentViewedAt?.toISOString() ?? null,
      hasShift:
        Boolean(r.pastSelfView) &&
        Boolean(r.presentSelfView) &&
        r.pastSelfView !== r.presentSelfView,
    }))

    return {
      entries,
      shiftedCount: entries.filter((e) => e.hasShift).length,
      earliest: rows.length > 0 ? rows[rows.length - 1]!.occurredAt.toISOString() : null,
      latest: rows.length > 0 ? rows[0]!.occurredAt.toISOString() : null,
    }
  }
}

// ── 出参映射 ──────────────────────────────────────────

function toMemoryDto(row: MemoryRow): MemoryDto {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    tags: row.tags,
    people: row.people,
    location: row.location,
    graphX: row.graphX,
    graphY: row.graphY,
    icon: row.icon,
    colorToken: row.colorToken,
    feelingId: row.feelingId,
    weight: row.weight,
    source: row.source,
    pastSelfView: row.pastSelfView,
    presentSelfView: row.presentSelfView,
    pastViewedAt: row.pastViewedAt?.toISOString() ?? null,
    presentViewedAt: row.presentViewedAt?.toISOString() ?? null,
    occurredAt: row.occurredAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

function toRelationDto(row: {
  id: string
  sourceId: string
  targetId: string
  kind: string
  strength: number
  note: string | null
  discovered: boolean
  createdAt: Date
}): RelationDto {
  return {
    id: row.id,
    sourceId: row.sourceId,
    targetId: row.targetId,
    kind: row.kind,
    strength: row.strength,
    note: row.note,
    discovered: row.discovered,
    createdAt: row.createdAt.toISOString(),
  }
}
