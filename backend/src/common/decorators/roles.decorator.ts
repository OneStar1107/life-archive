/**
 * common/decorators/roles.decorator.ts
 * 角色标注 + 资源归属校验装饰器说明。
 *
 * 说明：本项目是「单用户自治」模型（每个用户只能访问自己的数据），
 * 因此不设管理员角色体系，资源归属由 Service 层强制校验 userId。
 * 这里保留装饰器是为了将来接入运营后台时不必重构。
 */

import { SetMetadata, type CustomDecorator } from '@nestjs/common'

export const ROLES_KEY = 'roles'
export type Role = 'user' | 'operator' | 'admin'

export const Roles = (...roles: Role[]): CustomDecorator<string> => SetMetadata(ROLES_KEY, roles)
