/**
 * modules/profiles/profiles.service.ts
 * 「你」Tab：基本资料 / 性格 / 边界。
 *
 * 一个用户至多一条 Profile（schema 上 userId 唯一），
 * 因此读取是「取或 404」，写入是「upsert 语义」——
 * 首次进入 App 直接 PATCH 即可建档，不必先 POST。
 *
 * 铁律：
 *   1. 缺字段（undefined）= 保留原值；显式传 null = 清空该字段。
 *   2. quietHours 库里是 Json，出参必须做形状校验后再返回，
 *      脏数据一律降级为 null，不把异常抛给端上。
 *   3. 禁止 throw new Error()，业务失败一律 BusinessException(code)。
 *   4. 查询一律 select 白名单，禁止 select *。
 */

import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../../database/prisma.service'
import { ErrorCode } from '../../common/constants/error-codes'
import { assertOwnership } from '../../common/helpers/ownership.helper'
import type {
  ProfileCompletenessDto,
  ProfileDto,
  QuietHoursItemDto,
  UpdateProfileDto,
} from './dto/profiles.dto'

/** 出参 select：白名单，绝不 select * */
const PROFILE_SELECT = {
  id: true,
  realName: true,
  gender: true,
  birthday: true,
  bloodType: true,
  heightCm: true,
  weightKg: true,
  sleepPattern: true,
  dietPreference: true,
  mbti: true,
  readableTopics: true,
  offLimitTopics: true,
  quietHours: true,
  dataSourceConsent: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.ProfileSelect

type ProfileRow = Prisma.ProfileGetPayload<{ select: typeof PROFILE_SELECT }>

/**
 * 局部补丁类型：同时兼容 create 与 update，
 * 这样一次组装就能走「有则改、无则建」两条路径。
 */
type ProfilePatch = Omit<
  Prisma.ProfileUncheckedCreateInput,
  'id' | 'userId' | 'createdAt' | 'updatedAt' | 'deletedAt'
>

/** 完整度检查项：字段 → 中文名（顺序即前端展示顺序） */
const COMPLETENESS_ITEMS: { field: keyof ProfileRow; label: string }[] = [
  { field: 'realName', label: '姓名' },
  { field: 'gender', label: '性别' },
  { field: 'birthday', label: '生日' },
  { field: 'sleepPattern', label: '作息' },
  { field: 'dietPreference', label: '饮食偏好' },
]

@Injectable()
export class ProfilesService {
  constructor(private readonly prisma: PrismaService) {}

  // ── 读取 ──────────────────────────────────────────────

  /** 读取资料；尚未建档时返回 40010，前端据此引导用户先填 basics */
  async get(userId: string): Promise<ProfileDto> {
    const row = await this.prisma.profile.findFirst({
      where: { userId, deletedAt: null },
      select: { ...PROFILE_SELECT, userId: true },
    })
    assertOwnership(row, userId, ErrorCode.PROFILE_NOT_FOUND)
    return toProfileDto(row as ProfileRow)
  }

  /**
   * 更新资料，upsert 语义。
   * 未传的字段保留原值；显式传 null 的字段被清空；
   * 若此前是软删除状态，本次写入会顺带恢复该行。
   */
  async update(userId: string, dto: UpdateProfileDto): Promise<ProfileDto> {
    const existing = await this.prisma.profile.findFirst({
      where: { userId },
      select: { id: true, userId: true },
    })
    if (existing) assertOwnership(existing, userId, ErrorCode.PROFILE_NOT_FOUND)

    // 只放显式传入的字段，其余交给 Prisma 保留原值
    const patch: ProfilePatch = {}
    if (dto.realName !== undefined) patch.realName = dto.realName
    if (dto.gender !== undefined) patch.gender = dto.gender
    if (dto.birthday !== undefined) patch.birthday = dto.birthday ? new Date(dto.birthday) : null
    if (dto.bloodType !== undefined) patch.bloodType = dto.bloodType
    if (dto.heightCm !== undefined) patch.heightCm = dto.heightCm
    if (dto.weightKg !== undefined) patch.weightKg = dto.weightKg
    if (dto.sleepPattern !== undefined) patch.sleepPattern = dto.sleepPattern
    if (dto.dietPreference !== undefined) patch.dietPreference = dto.dietPreference
    if (dto.mbti !== undefined) patch.mbti = dto.mbti
    if (dto.readableTopics !== undefined) patch.readableTopics = dto.readableTopics
    if (dto.offLimitTopics !== undefined) patch.offLimitTopics = dto.offLimitTopics
    if (dto.quietHours !== undefined) patch.quietHours = toQuietHoursInput(dto.quietHours)
    if (dto.dataSourceConsent !== undefined) patch.dataSourceConsent = dto.dataSourceConsent

    const row = existing
      ? await this.prisma.profile.update({
          where: { id: existing.id },
          // 软删除过的资料重新编辑即恢复
          data: { ...patch, deletedAt: null },
          select: PROFILE_SELECT,
        })
      : await this.prisma.profile.create({
          data: { userId, ...patch },
          select: PROFILE_SELECT,
        })

    return toProfileDto(row)
  }

  /** 资料完整度：驱动「你」Tab 的补齐引导 */
  async completeness(userId: string): Promise<ProfileCompletenessDto> {
    const row = await this.prisma.profile.findFirst({
      where: { userId, deletedAt: null },
      select: { ...PROFILE_SELECT, userId: true },
    })
    const owned = assertOwnership(row, userId, ErrorCode.PROFILE_NOT_FOUND)

    const missing = COMPLETENESS_ITEMS.filter((item) => isBlank(owned[item.field])).map(
      (item) => item.label,
    )
    const total = COMPLETENESS_ITEMS.length
    const completed = total - missing.length

    return {
      completed,
      total,
      percent: total === 0 ? 0 : Math.round((completed / total) * 100),
      missing,
    }
  }
}

// ── 出参映射 ──────────────────────────────────────────

function toProfileDto(row: ProfileRow): ProfileDto {
  return {
    id: row.id,
    realName: row.realName,
    gender: row.gender,
    birthday: row.birthday ? row.birthday.toISOString().slice(0, 10) : null,
    bloodType: row.bloodType,
    heightCm: row.heightCm,
    weightKg: row.weightKg,
    sleepPattern: row.sleepPattern,
    dietPreference: row.dietPreference,
    mbti: row.mbti,
    readableTopics: row.readableTopics,
    offLimitTopics: row.offLimitTopics,
    quietHours: parseQuietHours(row.quietHours),
    dataSourceConsent: row.dataSourceConsent,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

// ── 工具 ──────────────────────────────────────────────

/** Json 字段 → 结构化时段；形状不合法时降级为 null，不抛异常 */
function parseQuietHours(value: Prisma.JsonValue | null): QuietHoursItemDto[] | null {
  if (!Array.isArray(value) || value.length === 0) return null

  const items: QuietHoursItemDto[] = []
  for (const raw of value) {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) continue
    const entry = raw as Record<string, unknown>
    const start = typeof entry.start === 'string' ? entry.start : null
    const end = typeof entry.end === 'string' ? entry.end : null
    // 脏数据整条丢弃：宁可少一个时段，也不要给端上错的时间
    if (!start || !end) continue
    items.push({ start, end })
  }
  return items.length > 0 ? items : null
}

/** 入参 → Json 字段；空数组与 null 统一落成 SQL NULL */
function toQuietHoursInput(
  value: QuietHoursItemDto[] | null | undefined,
): Prisma.InputJsonValue | typeof Prisma.DbNull {
  if (!value || value.length === 0) return Prisma.DbNull
  return value.map((item) => ({ start: item.start, end: item.end })) as Prisma.InputJsonValue
}

/** 完整度判定：空字符串、纯空白数组都算「未填」 */
function isBlank(value: unknown): boolean {
  if (value === null || value === undefined) return true
  if (typeof value === 'string') return value.trim() === ''
  if (Array.isArray(value)) return value.length === 0
  return false
}
