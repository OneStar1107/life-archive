/**
 * common/decorators/current-user.decorator.ts
 * 从请求中取出当前登录用户。
 */

import { createParamDecorator, type ExecutionContext } from '@nestjs/common'
import type { Request } from 'express'

/** 挂在 request.user 上的最小用户信息（绝不含 passwordHash） */
export interface AuthUser {
  id: string
  nickname: string | null
  status: string
  tokenVersion: number
}

export const CurrentUser = createParamDecorator(
  (data: keyof AuthUser | undefined, ctx: ExecutionContext): AuthUser | string | null => {
    const req = ctx.switchToHttp().getRequest<Request & { user?: AuthUser }>()
    const user = req.user
    if (!user) return null
    if (!data) return user
    const value = user[data]
    // tokenVersion 是 number，与字符串返回类型不兼容，这里只暴露字符串字段
    return typeof value === 'string' ? value : null
  },
)
