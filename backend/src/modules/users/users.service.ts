/**
 * modules/users/users.service.ts
 * 账号管理：资料读取与更新、授权同意、数据导出、账号注销。
 *
 * 合规背景：
 *   - 数据导出（exportData）是《个人信息保护法》赋予用户的权利，
 *     必须能自助获取自己的全部数据规模，故聚合所有业务表的记录数。
 *   - 账号注销（deleteAccount）在本项目里走**软删**：置 user.deletedAt 与
 *     status=disabled、吊销全部 refresh token、连带软删所有业务数据。
 *     物理清理由离线归档任务在保留期届满后执行，避免误删不可恢复。
 */

import { Injectable, Logger } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../../database/prisma.service'
import { BusinessException } from '../../common/exceptions/business.exception'
import { ErrorCode } from '../../common/constants/error-codes'
import type { AccountExportDto, ConsentDto, UpdateUserDto, UserProfileDto } from './dto/users.dto'

/** 出参 select：白名单，绝不 select *（尤其不带 passwordHash） */
const USER_SELECT = {
  id: true,
  nickname: true,
  avatarUrl: true,
  phone: true,
  email: true,
  createdAt: true,
} satisfies Prisma.UserSelect

type UserRow = Prisma.UserGetPayload<{ select: typeof USER_SELECT }>

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name)

  constructor(private readonly prisma: PrismaService) {}

  // ── 资料 ──────────────────────────────────────────────

  async detail(userId: string): Promise<UserProfileDto> {
    const row = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: USER_SELECT,
    })
    if (!row) throw new BusinessException(ErrorCode.USER_NOT_FOUND)
    return toUserProfileDto(row)
  }

  async update(userId: string, dto: UpdateUserDto): Promise<UserProfileDto> {
    // 只更新显式传入的字段
    const data: Prisma.UserUpdateInput = {}
    if (dto.nickname !== undefined) data.nickname = dto.nickname
    if (dto.avatarUrl !== undefined) data.avatarUrl = dto.avatarUrl

    try {
      const row = await this.prisma.user.update({
        where: { id: userId },
        data,
        select: USER_SELECT,
      })
      return toUserProfileDto(row)
    } catch (e) {
      // 昵称唯一约束冲突：给出可读文案，而不是 500
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new BusinessException(ErrorCode.ALREADY_EXISTS, '这个昵称已经被用过了')
      }
      throw e
    }
  }

  // ── 授权同意 ──────────────────────────────────────────

  /**
   * 记录隐私政策同意与数据来源授权。
   * privacyPolicyAccepted 必须为 true——不同意就过不去，这是合规硬门槛。
   */
  async acceptConsent(
    userId: string,
    dto: ConsentDto,
  ): Promise<{ privacyPolicyAcceptedAt: string }> {
    if (dto.privacyPolicyAccepted !== true) {
      throw new BusinessException(ErrorCode.CONSENT_REQUIRED)
    }

    // 资料可能尚未建立（注册后未填基本资料），这里 upsert 兜住
    await this.prisma.profile.upsert({
      where: { userId },
      create: { userId, dataSourceConsent: dto.dataSourceConsent ?? false },
      update: { dataSourceConsent: dto.dataSourceConsent ?? false },
      select: { id: true },
    })

    return { privacyPolicyAcceptedAt: new Date().toISOString() }
  }

  // ── 数据导出 ──────────────────────────────────────────

  /**
   * ★《个人信息保护法》要求：用户有权获取自己的全部数据。
   * 当前版本先返回各表记录数（让用户看清自己留下了多少），
   * downloadUrl 预留为 null，后续接入离线打包后填充。
   */
  async exportData(userId: string): Promise<AccountExportDto> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: USER_SELECT,
    })
    if (!user) throw new BusinessException(ErrorCode.USER_NOT_FOUND)

    // 所有带软删的业务表都按 deletedAt: null 统计
    const alive = { userId, deletedAt: null }

    const [
      feelings,
      memories,
      memoryRelations,
      healthMetrics,
      journeys,
      todos,
      insights,
      uploadedFiles,
      profiles,
    ] = await this.prisma.$transaction([
      this.prisma.feeling.count({ where: alive }),
      this.prisma.memory.count({ where: alive }),
      this.prisma.memoryRelation.count({ where: alive }),
      this.prisma.healthMetric.count({ where: alive }),
      this.prisma.journey.count({ where: alive }),
      this.prisma.todo.count({ where: alive }),
      this.prisma.insight.count({ where: alive }),
      this.prisma.uploadedFile.count({ where: alive }),
      this.prisma.profile.count({ where: alive }),
    ])

    return {
      exportedAt: new Date().toISOString(),
      user: toUserProfileDto(user),
      counts: {
        feelings,
        memories,
        memoryRelations,
        healthMetrics,
        journeys,
        todos,
        insights,
        uploadedFiles,
        profiles,
      },
      downloadUrl: null,
    }
  }

  // ── 账号注销 ──────────────────────────────────────────

  /**
   * 账号注销（不可逆）。
   * 全部动作放在一个事务里：任一步失败则整体回滚，
   * 避免出现「用户已禁用但数据还在」或反之的中间态。
   */
  async deleteAccount(userId: string): Promise<{ success: true }> {
    const existing = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: { id: true },
    })
    if (!existing) throw new BusinessException(ErrorCode.USER_NOT_FOUND)

    const now = new Date()
    const alive = { userId, deletedAt: null }

    await this.prisma.$transaction([
      // 1. 吊销全部 refresh token，Access Token 由 JWT 校验时读 status 拦下
      this.prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: now },
      }),
      // 2. 软删所有业务数据
      this.prisma.feeling.updateMany({ where: alive, data: { deletedAt: now } }),
      this.prisma.memory.updateMany({ where: alive, data: { deletedAt: now } }),
      this.prisma.memoryRelation.updateMany({ where: alive, data: { deletedAt: now } }),
      this.prisma.healthMetric.updateMany({ where: alive, data: { deletedAt: now } }),
      this.prisma.journey.updateMany({ where: alive, data: { deletedAt: now } }),
      this.prisma.todo.updateMany({ where: alive, data: { deletedAt: now } }),
      this.prisma.insight.updateMany({ where: alive, data: { deletedAt: now } }),
      this.prisma.uploadedFile.updateMany({ where: alive, data: { deletedAt: now } }),
      this.prisma.profile.updateMany({ where: alive, data: { deletedAt: now } }),
      // 3. 最后才禁用账号本身
      this.prisma.user.update({
        where: { id: userId },
        data: { deletedAt: now, status: 'disabled', tokenVersion: { increment: 1 } },
      }),
    ])

    this.logger.log(`账号已注销：${userId}`)
    return { success: true }
  }
}

// ── 出参映射与脱敏 ────────────────────────────────────

function toUserProfileDto(row: UserRow): UserProfileDto {
  return {
    id: row.id,
    nickname: row.nickname,
    avatarUrl: row.avatarUrl,
    phone: row.phone ? maskPhone(row.phone) : null,
    email: row.email ? maskEmail(row.email) : null,
    createdAt: row.createdAt.toISOString(),
  }
}

/** 13812348000 → 138****8000 */
function maskPhone(phone: string): string {
  if (phone.length < 7) return `${phone.slice(0, 1)}***`
  return `${phone.slice(0, 3)}****${phone.slice(-4)}`
}

/** abc@domain.com → a***@domain.com */
function maskEmail(email: string): string {
  const at = email.indexOf('@')
  if (at <= 0) return '***'
  const local = email.slice(0, at)
  const domain = email.slice(at)
  return `${local.slice(0, 1)}***${domain}`
}
