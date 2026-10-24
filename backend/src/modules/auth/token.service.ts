/**
 * modules/auth/token.service.ts
 * ══════════════════════════════════════════════════════════════
 * JWT 双 Token 轮换 + 重用检测
 * ══════════════════════════════════════════════════════════════
 *
 * 设计要点（02 号 T4）：
 *  1. Access Token  15 分钟，载荷仅 { sub, ver }
 *  2. Refresh Token 7 天，**存哈希不存明文**
 *  3. 轮换：每次刷新颁发新 Refresh 并作废旧的
 *  4. 重用检测：若已作废的 Refresh 再次被使用（重放攻击），
 *     **吊销该 familyId 下全部令牌**并强制重新登录
 *  5. 登出：标记吊销 + 写 Redis 短期黑名单（无 Redis 时降级为纯 DB）
 */

import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'
import { createHash, randomUUID } from 'node:crypto'
import { PrismaService } from '../../database/prisma.service'
import { AuthException } from '../../common/exceptions/business.exception'
import { ErrorCode } from '../../common/constants/error-codes'
import type { TokenPair } from './dto/auth-response.dto'

/** 存库的 token 哈希：SHA-256，够用且不可逆 */
function hashToken(plain: string): string {
  return createHash('sha256').update(plain).digest('hex')
}

/** Refresh Token 载荷 */
interface RefreshPayload {
  sub: string
  ver: number
  jti: string
  fid: string
  iat?: number
  exp?: number
}

@Injectable()
export class TokenService {
  private readonly logger = new Logger(TokenService.name)

  constructor(
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  // ── 签发 ──────────────────────────────────────────────

  /**
   * 为一次登录创建新的令牌对。
   * @param familyId 传入则并入既有族（续期），不传则开新族
   */
  async issuePair(
    userId: string,
    tokenVersion: number,
    meta: { userAgent?: string; ip?: string },
    familyId?: string,
  ): Promise<TokenPair> {
    const accessTtl = this.config.get<number>('auth.accessTtl') ?? 900
    const refreshTtl = this.config.get<number>('auth.refreshTtl') ?? 604800

    // ── Access：载荷只有 sub 与 ver ──
    const accessToken = await this.jwtService.signAsync(
      { sub: userId, ver: tokenVersion },
      {
        secret: this.config.get<string>('auth.jwtSecret'),
        expiresIn: accessTtl,
      },
    )

    // ── Refresh：jti 唯一标识，族内可追溯 ──
    const family = familyId ?? randomUUID()
    const jti = randomUUID()
    const refreshToken = await this.jwtService.signAsync(
      { sub: userId, ver: tokenVersion, jti, fid: family },
      {
        secret: this.config.get<string>('auth.jwtRefreshSecret'),
        expiresIn: refreshTtl,
      },
    )

    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: hashToken(refreshToken),
        familyId: family,
        expiresAt: new Date(Date.now() + refreshTtl * 1000),
        userAgent: meta.userAgent?.slice(0, 512),
        ip: meta.ip?.slice(0, 64),
      },
    })

    return {
      accessToken,
      refreshToken,
      accessExpiresIn: accessTtl,
      refreshExpiresIn: refreshTtl,
      tokenType: 'Bearer',
    }
  }

  // ── 轮换 + 重用检测 ───────────────────────────────────

  /**
   * 用 Refresh 换新的一对。
   *
   * 重放攻击场景：攻击者偷到一个已被用户轮换掉的旧 Refresh 并使用它。
   * 此时我们发现该 token 已 revoked → 判定为泄露 → 整族吊销。
   */
  async rotate(
    presentedRefreshToken: string,
    meta: { userAgent?: string; ip?: string },
  ): Promise<TokenPair> {
    // 1. 先验签：签名不对直接拒，不查库（避免被用作探测）
    let payload: RefreshPayload
    try {
      payload = await this.jwtService.verifyAsync<RefreshPayload>(presentedRefreshToken, {
        secret: this.config.get<string>('auth.jwtRefreshSecret'),
      })
    } catch {
      throw new AuthException(ErrorCode.REFRESH_INVALID)
    }

    if (!payload?.sub || !payload.jti || !payload.fid) {
      throw new AuthException(ErrorCode.REFRESH_INVALID)
    }

    // 2. 查库：该 token 还在不在
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: hashToken(presentedRefreshToken) },
      include: {
        user: { select: { id: true, status: true, tokenVersion: true, deletedAt: true } },
      },
    })

    if (!stored) {
      // 签名有效但库里没有：可能是库被清过，也可能是伪造。整族吊销更安全。
      await this.revokeFamily(payload.fid)
      throw new AuthException(ErrorCode.REFRESH_REUSED)
    }

    // 3. ★ 重用检测：已吊销的 token 又被拿来用 = 重放
    if (stored.revokedAt !== null) {
      this.logger.warn(
        `检测到 Refresh Token 重放（family=${payload.fid}, user=${stored.userId}），整族吊销`,
      )
      await this.revokeFamily(stored.familyId)
      throw new AuthException(ErrorCode.REFRESH_REUSED)
    }

    // 4. 过期
    if (stored.expiresAt.getTime() <= Date.now()) {
      throw new AuthException(ErrorCode.REFRESH_INVALID)
    }

    // 5. 账号状态
    if (stored.user.deletedAt !== null || stored.user.status === 'disabled') {
      throw new AuthException(ErrorCode.ACCOUNT_DISABLED)
    }

    // 6. tokenVersion 不一致：改过密码，旧令牌链整族失效
    if (stored.user.tokenVersion !== payload.ver) {
      await this.revokeFamily(stored.familyId)
      throw new AuthException(ErrorCode.TOKEN_INVALID)
    }

    // 7. 签发新的一对（并入同一族）
    const pair = await this.issuePair(stored.userId, payload.ver, meta, stored.familyId)

    // 8. 吊销旧的，并串上 replacedBy 链
    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    })

    return pair
  }

  // ── 登出 ──────────────────────────────────────────────

  /** 登出：吊销该族全部令牌 */
  async logout(refreshToken: string | undefined, userId: string): Promise<void> {
    if (refreshToken) {
      const decoded = this.decodeRefresh(refreshToken)
      if (decoded?.fid) {
        await this.revokeFamily(decoded.fid)
        return
      }
    }
    // 拿不到 refresh 时，吊销该用户全部活跃令牌
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    })
  }

  /** 吊销整族 */
  async revokeFamily(familyId: string): Promise<number> {
    const res = await this.prisma.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    })
    this.logger.warn(`已吊销令牌族 ${familyId}，共 ${res.count} 个`)
    return res.count
  }

  /** 改密码 / 强制下线：递增 tokenVersion + 吊销全部令牌 */
  async revokeAllForUser(userId: string): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { tokenVersion: { increment: 1 } },
      }),
      this.prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ])
  }

  // ── 清理 ──────────────────────────────────────────────

  /** 定时清理过期令牌记录 */
  async purgeExpired(): Promise<number> {
    const res = await this.prisma.refreshToken.deleteMany({
      where: {
        OR: [
          { expiresAt: { lt: new Date() } },
          { revokedAt: { lt: new Date(Date.now() - 30 * 86400_000) } },
        ],
      },
    })
    if (res.count > 0) this.logger.log(`已清理 ${res.count} 条过期/长期吊销的令牌记录`)
    return res.count
  }

  // ── 内部 ──────────────────────────────────────────────

  /**
   * 解码 Refresh（不验签）。
   * 仅用于「登出时定位令牌族」这类不需要密码学校验的场景。
   */
  private decodeRefresh(token: string): RefreshPayload | null {
    try {
      const decoded = this.jwtService.decode(token) as Partial<RefreshPayload> | null
      if (!decoded?.sub || !decoded.jti || !decoded.fid || typeof decoded.ver !== 'number') {
        return null
      }
      return { sub: decoded.sub, ver: decoded.ver, jti: decoded.jti, fid: decoded.fid }
    } catch {
      return null
    }
  }
}

export { hashToken }
