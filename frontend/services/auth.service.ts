// services/auth.service.ts
// ══════════════════════════════════════════════════════════════
// 认证：注册 / 登录 / 刷新 / 登出 / 改密 / 当前用户
// ══════════════════════════════════════════════════════════════
//
// 对应 backend/src/modules/auth/auth.controller.ts（@Controller('auth')）
//
// ★★★ 铁律：登录 / 注册 / 刷新必须同时置 auth: false 与 skipAuthRefresh: true ★★★
//   auth: false           —— 未登录时本地没有 token，附带 Authorization 只会让后端先判 401
//   skipAuthRefresh: true —— 刷新接口自己收到 401 时若再触发刷新，
//                            会走 handleTokenExpired → refreshToken → doRefresh → 401，
//                            形成无限递归直到栈溢出。
//   漏掉任何一个，未登录时打开 App 就会把整个请求内核打进死循环。

import { get, post } from '@/core/http/request'
import type { AuthResult, MeResult, TokenPairResult } from './types'

/** 登录 / 注册 / 刷新共用的免鉴权配置 */
const ANON = { auth: false, skipAuthRefresh: true }

export const authService = {
  /**
   * 登录。
   * @param params phone 与 password 必填（后端也接受 email + password）
   */
  login(params: { phone: string; password: string }): Promise<AuthResult> {
    return post<AuthResult>('/auth/login', params, ANON)
  },

  /** 注册。成功后后端会自动建空资料，端上可直接进「你」Tab */
  register(params: { phone: string; password: string; nickname?: string }): Promise<AuthResult> {
    return post<AuthResult>('/auth/register', params, ANON)
  },

  /**
   * 刷新令牌（轮换式）。
   * ★ 每次都会颁发新的 Refresh 并作废旧的，调用方必须整体替换本地令牌对。
   */
  refresh(refreshToken: string): Promise<TokenPairResult> {
    return post<TokenPairResult>('/auth/refresh', { refreshToken }, ANON)
  },

  /** 登出。失败也要清本地，因此调用方（stores/auth.ts）自己包了 try/catch */
  logout(): Promise<{ success: boolean }> {
    return post<{ success: boolean }>('/auth/logout', {}, { skipAuthRefresh: true })
  },

  /** 改密。后端会登出所有设备，当前设备返回新令牌对（走 HTTP 200 + 统一包装） */
  changePassword(params: {
    oldPassword: string
    newPassword: string
  }): Promise<{ success: boolean }> {
    return post<{ success: boolean }>('/auth/change-password', params)
  },

  /** 当前登录用户。手机号与邮箱已脱敏 */
  me(): Promise<MeResult> {
    return get<MeResult>('/auth/me')
  },
}

export default authService
