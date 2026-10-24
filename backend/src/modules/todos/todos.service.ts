/**
 * modules/todos/todos.service.ts
 * 待办 · 时间与你。
 */

import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../../database/prisma.service'
import { BusinessException } from '../../common/exceptions/business.exception'
import { ErrorCode } from '../../common/constants/error-codes'
import { assertOwnership } from '../../common/helpers/ownership.helper'
import { toPageResult, type PageResult } from '../../common/dto/result.dto'
import type {
  CreateTodoDto,
  TodoDto,
  TodoGroupDto,
  QueryTodoDto,
  UpdateTodoDto,
} from './dto/todos.dto'

const TODO_SELECT = {
  id: true,
  title: true,
  note: true,
  kind: true,
  status: true,
  dueAt: true,
  completedAt: true,
  repeatRule: true,
  people: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.TodoSelect

type TodoRow = Prisma.TodoGetPayload<{ select: typeof TODO_SELECT }>

@Injectable()
export class TodosService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string, query: QueryTodoDto): Promise<PageResult<TodoDto>> {
    const where: Prisma.TodoWhereInput = { userId, deletedAt: null }
    if (query.status) where.status = query.status
    if (query.kind) where.kind = query.kind
    if (query.person) where.people = { has: query.person }

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.todo.findMany({
        where,
        select: TODO_SELECT,
        orderBy: [{ status: 'asc' }, { dueAt: 'asc' }],
        skip: query.skip,
        take: query.take,
      }),
      this.prisma.todo.count({ where }),
    ])

    return toPageResult(rows.map(toTodoDto), total, query.page, query.pageSize)
  }

  async detail(userId: string, id: string): Promise<TodoDto> {
    const row = await this.prisma.todo.findFirst({
      where: { id, deletedAt: null },
      select: { ...TODO_SELECT, userId: true },
    })
    assertOwnership(row, userId, ErrorCode.TODO_NOT_FOUND)
    return toTodoDto(row as TodoRow)
  }

  async create(userId: string, dto: CreateTodoDto): Promise<TodoDto> {
    const row = await this.prisma.todo.create({
      data: {
        userId,
        title: dto.title,
        note: dto.note ?? null,
        kind: dto.kind ?? 'task',
        repeatRule: dto.repeatRule ?? 'none',
        dueAt: dto.dueAt ? new Date(dto.dueAt) : null,
        people: dto.people ?? [],
      },
      select: TODO_SELECT,
    })
    return toTodoDto(row)
  }

  async update(userId: string, id: string, dto: UpdateTodoDto): Promise<TodoDto> {
    const existing = assertOwnership(
      await this.prisma.todo.findFirst({
        where: { id, deletedAt: null },
        select: { id: true, userId: true, status: true },
      }),
      userId,
      ErrorCode.TODO_NOT_FOUND,
    )

    // 已完成的事项再标完成 → 给出明确反馈，而不是静默成功
    if (dto.status === 'done' && existing.status === 'done') {
      throw new BusinessException(ErrorCode.TODO_ALREADY_DONE)
    }

    const data: Prisma.TodoUpdateInput = {}
    if (dto.title !== undefined) data.title = dto.title
    if (dto.note !== undefined) data.note = dto.note
    if (dto.kind !== undefined) data.kind = dto.kind
    if (dto.repeatRule !== undefined) data.repeatRule = dto.repeatRule
    if (dto.people !== undefined) data.people = dto.people
    if (dto.dueAt !== undefined) data.dueAt = dto.dueAt ? new Date(dto.dueAt) : null
    if (dto.status !== undefined) {
      data.status = dto.status
      data.completedAt = dto.status === 'done' ? new Date() : null
    }

    const row = await this.prisma.todo.update({ where: { id }, data, select: TODO_SELECT })
    return toTodoDto(row)
  }

  /** 标记完成 / 取消完成 */
  async toggle(userId: string, id: string): Promise<TodoDto> {
    const existing = assertOwnership(
      await this.prisma.todo.findFirst({
        where: { id, deletedAt: null },
        select: { id: true, userId: true, status: true },
      }),
      userId,
      ErrorCode.TODO_NOT_FOUND,
    )

    const nowDone = existing.status !== 'done'
    const row = await this.prisma.todo.update({
      where: { id },
      data: { status: nowDone ? 'done' : 'pending', completedAt: nowDone ? new Date() : null },
      select: TODO_SELECT,
    })
    return toTodoDto(row)
  }

  async remove(userId: string, id: string): Promise<{ success: true }> {
    const existing = await this.prisma.todo.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, userId: true },
    })
    assertOwnership(existing, userId, ErrorCode.TODO_NOT_FOUND)
    await this.prisma.todo.update({ where: { id }, data: { deletedAt: new Date() } })
    return { success: true }
  }

  /** 首页用：按时间分组 */
  async grouped(userId: string): Promise<TodoGroupDto> {
    const now = new Date()
    const endOfToday = new Date(now)
    endOfToday.setHours(23, 59, 59, 999)
    const endOfWeek = new Date(now)
    endOfWeek.setDate(endOfWeek.getDate() + 7)

    const rows = await this.prisma.todo.findMany({
      where: { userId, deletedAt: null },
      select: TODO_SELECT,
      orderBy: { dueAt: 'asc' },
      take: 500,
    })

    const today: TodoDto[] = []
    const upcoming: TodoDto[] = []
    const overdue: TodoDto[] = []
    const completed: TodoDto[] = []

    for (const r of rows) {
      const dto = toTodoDto(r)
      if (r.status === 'done') {
        completed.push(dto)
        continue
      }
      if (r.status === 'archived') continue

      if (!r.dueAt) {
        upcoming.push(dto)
        continue
      }
      if (r.dueAt.getTime() < now.getTime()) overdue.push(dto)
      else if (r.dueAt.getTime() <= endOfToday.getTime()) today.push(dto)
      else if (r.dueAt.getTime() <= endOfWeek.getTime()) upcoming.push(dto)
    }

    return {
      today,
      upcoming,
      overdue,
      completed: completed.slice(0, 20),
    }
  }
}

function toTodoDto(row: TodoRow): TodoDto {
  return {
    id: row.id,
    title: row.title,
    note: row.note,
    kind: row.kind,
    status: row.status,
    dueAt: row.dueAt?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
    repeatRule: row.repeatRule,
    people: row.people,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}
