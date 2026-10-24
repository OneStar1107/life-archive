// services/profiles.service.ts
// ══════════════════════════════════════════════════════════════
// 「你」Tab：基本资料 / 性格 / 边界
// ══════════════════════════════════════════════════════════════
//
// 对应 backend/src/modules/profiles/profiles.controller.ts
// （@Controller('profiles')）
//
// 路由核对清单：
//   GET   /profiles             获取资料
//   PATCH /profiles             更新资料（upsert 语义，路由上**没有** id）
//   GET   /profiles/completeness 资料完整度
//
// ★ 两个坑：
//   1. PATCH '/profiles' 不带 id——资料是单用户的，按 userId 定位。
//      写成 `/profiles/${id}` 会命中不到任何路由。
//   2. 尚未建档时 GET 返回 40010（资料尚未建立）。
//      这是**空态**而不是错误，端上要展示引导填写的表单，不要弹 toast。

import { get, patch } from '@/core/http/request'
import type { Profile, ProfileCompleteness, UpdateProfileInput } from './types'

export const profilesService = {
  /**
   * 获取「你」的资料。
   * @throws { HttpError} code 40010 表示尚未建档，端上转成空态引导
   */
  get(): Promise<Profile> {
    return get<Profile>('/profiles')
  },

  /**
   * 更新资料。upsert 语义：首次进入可直接 PATCH 建档。
   * ★ 不传的字段保留原值；显式传 null 的字段被清空。
   * ★ offLimitTopics 是用户划出的禁区，AI 生成任何内容前都要先读它。
   */
  update(data: UpdateProfileInput): Promise<Profile> {
    return patch<Profile>('/profiles', data)
  },

  /**
   * 资料完整度。
   * 检查姓名 / 性别 / 生日 / 作息 / 饮食偏好五项。
   * ★ missing 直接是中文名（如 ['性别', '生日']），可原样展示，不要再翻译一遍。
   */
  completeness(): Promise<ProfileCompleteness> {
    return get<ProfileCompleteness>('/profiles/completeness')
  },
}

export default profilesService
