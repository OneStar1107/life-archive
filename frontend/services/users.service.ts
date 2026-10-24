// services/users.service.ts
// ══════════════════════════════════════════════════════════════
// 账号管理：我的资料 / 更新 / 授权同意 / 数据导出 / 注销
// ══════════════════════════════════════════════════════════════
//
// 对应 backend/src/modules/users/users.controller.ts
// （@Controller('users')）
//
// 路由核对清单：
//   GET    /users/me          我的资料（手机号与邮箱已脱敏）
//   PATCH  /users/me          更新我的资料
//   POST   /users/me/consent  提交授权同意
//   GET    /users/me/export   导出我的数据
//   DELETE /users/me          注销账号
//
// ★ 路由统一挂在 '/me' 下：本项目是「单用户自治」模型，
//   后端**刻意不提供**按 id 查询他人资料的入口。端上也不要试图拼 /users/{id}。
// ★ deleteAccount 用 del()（HTTP DELETE）而不是 post()。

import { del, get, patch, post } from '@/core/http/request'
import type {
  AccountExport,
  ConsentInput,
  ConsentResult,
  UpdateUserInput,
  UserProfile,
} from './types'

export const usersService = {
  /** 我的资料。phone / email 永远脱敏 */
  detail(): Promise<UserProfile> {
    return get<UserProfile>('/users/me')
  },

  /** 更新我的资料。只更新显式传入的字段；昵称重复返回 40002 */
  update(data: UpdateUserInput): Promise<UserProfile> {
    return patch<UserProfile>('/users/me', data)
  },

  /**
   * 提交授权同意。
   * ★ privacyPolicyAccepted 必须为 true，否则后端返回 30006。
   *   首次启动时必须先过这一关，否则后续数据源导入全部被拒。
   */
  acceptConsent(data: ConsentInput): Promise<ConsentResult> {
    return post<ConsentResult>('/users/me/consent', data)
  },

  /**
   * 导出我的数据（《个人信息保护法》的数据可携带权）。
   * downloadUrl 当前版本为 null，后续接入离线打包后填充。
   */
  exportData(): Promise<AccountExport> {
    return get<AccountExport>('/users/me/export')
  },

  /**
   * 注销账号。★ 不可逆。
   * 账号禁用、全部令牌失效、所有业务数据软删除。
   * @throws { HttpError} 失败时不要清本地登录态，让用户能看到后端给的原因
   */
  deleteAccount(): Promise<{ success: boolean }> {
    return del<{ success: boolean }>('/users/me')
  },
}

export default usersService
