/**
 * common/guards/jwt-auth.guard.ts
 * 全局鉴权守卫（白名单原理）。
 *
 * - 默认所有接口都需要 Access Token
 * - @Public() 标注的接口放行
 * - Token 过期 → 20001（前端唯一允许触发「静默刷新」的错误码）
 * - 其余认证失败 → 2xxxx 系列 + HTTP 401
 * - 每次请求校验 tokenVersion 与账号状态：改密码 / 停用账号后旧令牌立即失效
 */

import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { JwtService } from '@nestjs/jwt'
import { ConfigService } from '@nestjs/config'
import type { Request } from 'express'
import { IS_PUBLIC_KEY } from '../decorators/public.decorator'
import { AuthException } from '../exceptions/business.exception'
import { ErrorCode } from '../constants/error-codes'
import type { AuthUser } from '../decorators/current-user.decorator'
import { PrismaService } from '../../database/prisma.service'

interface AccessPayload {
  /** userId */
  sub: string
  /** tokenVersion，改密码后递增使旧令牌失效 */
  ver: number
  iat?: number
  exp?: number
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ])
    if (isPublic) return true

    const req = context.switchToHttp().getRequest<Request>()
    const token = extractBearer(req.headers.authorization)
    if (!token) throw new AuthException(ErrorCode.TOKEN_MISSING)

    let payload: AccessPayload
    try {
      payload = await this.jwtService.verifyAsync<AccessPayload>(token, {
        secret: this.config.get<string>('auth.jwtSecret'),
      })
    } catch (e) {
      const name = (e as { name?: string }).name
      if (name === 'TokenExpiredError') {
        // ★ 只有这一类允许前端走单例刷新
        throw new AuthException(ErrorCode.TOKEN_EXPIRED)
      }
      throw new AuthException(ErrorCode.TOKEN_INVALID)
    }

    if (!payload.sub || typeof payload.ver !== 'number') {
      throw new AuthException(ErrorCode.TOKEN_INVALID)
    }

    // 轻量查询：确认账号仍然有效，且 tokenVersion 未被撤销
    const user = await this.prisma.user.findFirst({
      where: { id: payload.sub, deletedAt: null },
      select: { id: true, nickname: true, status: true, tokenVersion: true },
    })

    if (!user) throw new AuthException(ErrorCode.TOKEN_INVALID)
    if (user.status === 'disabled') throw new AuthException(ErrorCode.ACCOUNT_DISABLED)
    if (user.tokenVersion !== payload.ver) throw new AuthException(ErrorCode.TOKEN_INVALID)

    const authUser: AuthUser = {
      id: user.id,
      nickname: user.nickname,
      status: user.status,
      tokenVersion: user.tokenVersion,
    }
    ;(req as Request & { user: AuthUser }).user = authUser
    return true
  }
}

/** 解析 Authorization: Bearer xxx */
function extractBearer(header: string | undefined): string | null {
  if (!header) return null
  const [scheme, value] = header.split(' ')
  if (!scheme || scheme.toLowerCase() !== 'bearer' || !value) return null
  return value.trim() || null
}
