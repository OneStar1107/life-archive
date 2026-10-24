/**
 * common/decorators/public.decorator.ts
 * 标记无需登录即可访问的接口。
 *
 * 配合 JwtAuthGuard 使用：默认全部接口都需要鉴权，
 * 只有显式标注 @Public() 的才放行（白名单原理，默认安全）。
 */

import { SetMetadata, type CustomDecorator } from '@nestjs/common'

export const IS_PUBLIC_KEY = 'isPublic'
export const Public = (): CustomDecorator<string> => SetMetadata(IS_PUBLIC_KEY, true)
