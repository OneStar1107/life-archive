/**
 * modules/auth/auth.service.ts
 * 注册 / 登录 / 刷新 / 登出 / 改密。
 *
 * 铁律：抛 BusinessException / AuthException，禁止裸 throw new Error()。
 */

import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import * as bcrypt from 'bcryptjs'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../../database/prisma.service'
import { TokenService } from './token.service'
import { AuthException, BusinessException } from '../../common/exceptions/business.exception'
import { ErrorCode } from '../../common/constants/error-codes'
import type { AuthUser } from '../../common/decorators/current-user.decorator'
import type { ChangePasswordDto, LoginDto, RegisterDto } from './dto/auth-request.dto'
import type { AuthResultDto, RefreshResultDto, TokenPair } from './dto/auth-response.dto'

export interface RequestMeta {
  userAgent?: string
  ip?: string
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly tokenService: TokenService,
    private readonly config: ConfigService,
  ) {}

  // ── 注册 ──────────────────────────────────────────────

  async register(dto: RegisterDto, meta: RequestMeta): Promise<AuthResultDto> {
    const hasPhone = Boolean(dto.phone)
    const hasEmail = Boolean(dto.email)
    if (!hasPhone && !hasEmail) {
      throw new BusinessException(ErrorCode.CREDENTIALS_INCOMPLETE)
    }

    // 1. 预检重复，给出可读文案
    if (hasPhone) {
      const exists = await this.prisma.user.findUnique({
        where: { phone: dto.phone! },
        select: { id: true },
      })
      if (exists) throw new BusinessException(ErrorCode.ALREADY_EXISTS, '这个手机号已经注册过了')
    }
    if (hasEmail) {
      const exists = await this.prisma.user.findUnique({
        where: { email: dto.email! },
        select: { id: true },
      })
      if (exists) throw new BusinessException(ErrorCode.ALREADY_EXISTS, '这个邮箱已经注册过了')
    }

    // 2. 加盐哈希（cost ≥ 12，启动时已校验）
    const cost = this.config.get<number>('auth.bcryptCost') ?? 12
    const passwordHash = await bcrypt.hash(dto.password, cost)

    // 3. 建用户 + 建空资料（一次事务）
    let userId: string
    try {
      const user = await this.prisma.$transaction(async (tx) => {
        const created = await tx.user.create({
          data: {
            phone: dto.phone,
            email: dto.email,
            passwordHash,
            nickname: dto.nickname ?? null,
            status: 'active',
          },
          select: { id: true, nickname: true, avatarUrl: true, tokenVersion: true },
        })
        await tx.profile.create({ data: { userId: created.id } })
        return created
      })
      userId = user.id
      this.logger.log(`新用户注册：${dto.nickname ?? dto.phone ?? dto.email}`)
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        this.prisma.translateP2002(String(e.meta?.['target'] ?? ''))
      }
      throw e
    }

    // 4. 签发令牌
    const tokens = await this.tokenService.issuePair(userId, 1, meta)
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { id: true, nickname: true, avatarUrl: true },
    })

    return { tokens, user }
  }

  // ── 登录 ──────────────────────────────────────────────

  async login(dto: LoginDto, meta: RequestMeta): Promise<AuthResultDto> {
    if (!dto.phone && !dto.email) {
      throw new BusinessException(ErrorCode.CREDENTIALS_INCOMPLETE)
    }

    const user = await this.prisma.user.findFirst({
      where: dto.phone ? { phone: dto.phone } : { email: dto.email! },
      select: {
        id: true,
        nickname: true,
        avatarUrl: true,
        passwordHash: true,
        status: true,
        tokenVersion: true,
        deletedAt: true,
      },
    })

    // ★ 用户不存在与密码错误返回同一个错误码，避免账号枚举
    if (!user || user.deletedAt !== null) {
      // 即便用户不存在也跑一次 bcrypt，抹平时间差
      await bcrypt.compare(dto.password, DUMMY_HASH)
      throw new AuthException(ErrorCode.PASSWORD_INCORRECT)
    }

    const ok = await bcrypt.compare(dto.password, user.passwordHash)
    if (!ok) throw new AuthException(ErrorCode.PASSWORD_INCORRECT)

    if (user.status === 'disabled') throw new AuthException(ErrorCode.ACCOUNT_DISABLED)
    if (user.status === 'pending') {
      throw new BusinessException(ErrorCode.SMS_CODE_INVALID, '账号尚未激活')
    }

    // 记录登录痕迹
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date(), lastLoginIp: meta.ip ?? null },
    })

    const tokens = await this.tokenService.issuePair(user.id, user.tokenVersion, meta)

    return {
      tokens,
      user: { id: user.id, nickname: user.nickname, avatarUrl: user.avatarUrl },
    }
  }

  // ── 刷新 ──────────────────────────────────────────────

  async refresh(refreshToken: string, meta: RequestMeta): Promise<RefreshResultDto> {
    const tokens = await this.tokenService.rotate(refreshToken, meta)
    return { tokens }
  }

  // ── 登出 ──────────────────────────────────────────────

  async logout(userId: string, refreshToken?: string): Promise<{ success: true }> {
    await this.tokenService.logout(refreshToken, userId)
    return { success: true }
  }

  // ── 改密 ──────────────────────────────────────────────

  /**
   * 改密后：递增 tokenVersion + 吊销该用户全部令牌。
   * 这会让所有设备都被登出——这是正确的安全默认。
   */
  async changePassword(
    user: AuthUser,
    dto: ChangePasswordDto,
    meta: RequestMeta,
  ): Promise<{ success: true; tokens: TokenPair }> {
    const row = await this.prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { passwordHash: true, tokenVersion: true },
    })

    const ok = await bcrypt.compare(dto.oldPassword, row.passwordHash)
    if (!ok) {
      throw new BusinessException(ErrorCode.PASSWORD_INCORRECT, '原密码不正确')
    }

    if (await bcrypt.compare(dto.newPassword, row.passwordHash)) {
      throw new BusinessException(ErrorCode.PASSWORD_WEAK, '新密码不能与原密码相同')
    }

    const cost = this.config.get<number>('auth.bcryptCost') ?? 12
    const newHash = await bcrypt.hash(dto.newPassword, cost)

    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: newHash },
    })
    // 递增版本号并吊销全部旧令牌
    await this.tokenService.revokeAllForUser(user.id)

    // 用新版本号给当前设备发一对新令牌，避免用户被立刻踢出
    const tokens = await this.tokenService.issuePair(user.id, row.tokenVersion + 1, meta)
    this.logger.log(`用户 ${user.id} 修改了密码，已重置全部会话`)
    return { success: true, tokens }
  }

  // ── 当前用户 ──────────────────────────────────────────

  async me(userId: string): Promise<{
    id: string
    nickname: string | null
    avatarUrl: string | null
    phone: string | null
    email: string | null
    createdAt: Date
  }> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: {
        id: true,
        nickname: true,
        avatarUrl: true,
        phone: true,
        email: true,
        createdAt: true,
      },
    })
    if (!user) throw new AuthException(ErrorCode.TOKEN_INVALID)

    // 手机号/邮箱脱敏：138****8000
    return {
      ...user,
      phone: maskPhone(user.phone),
      email: maskEmail(user.email),
    }
  }
}

/**
 * 哑哈希：用户不存在时也跑一次 bcrypt，抹平「存在/不存在」的响应时间差，
 * 防止通过时间侧信道枚举账号。
 */
const DUMMY_HASH = '$2b$12$C6UzMDM.H6dfI/f/IKcEeO1sJ2eGk6HQNnVY3Z0nFqO0h0VqD0hBq'

function maskPhone(phone: string | null): string | null {
  if (!phone || phone.length < 7) return phone
  return `${phone.slice(0, 3)}****${phone.slice(-4)}`
}

function maskEmail(email: string | null): string | null {
  if (!email) return null
  const at = email.indexOf('@')
  if (at <= 0) return email
  const name = email.slice(0, at)
  const domain = email.slice(at)
  const head = name.slice(0, 1)
  return `${head}${'*'.repeat(Math.max(name.length - 1, 1))}${domain}`
}
