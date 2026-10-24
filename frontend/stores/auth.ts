// stores/auth.ts
// ══════════════════════════════════════════════════════════════
// 鉴权状态
// ══════════════════════════════════════════════════════════════
//
// actions：login / logout / refresh / hydrate（冷启动恢复）

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { authService } from '@/services/auth.service'
import { clearAuthState, getAccessToken, getUserInfo, removeUserInfo, setAccessToken, setRefreshToken, setUserInfo } from '@/core/storage/secure'
import { refreshToken as doRefresh } from '@/core/http/refresh'
import { on } from '@/core/http/events'
import { CODE } from '@/core/http/error-code'

/** 用户概要 */
export type AuthUser = {
  id: string
  nickname: string | null
  avatarUrl: string | null
}

export const useAuthStore = defineStore('auth', () => {
  // ── state ──
  const accessToken = ref<string>('')
  const refreshToken = ref<string>('')
  const user = ref<AuthUser | null>(null)
  /** 是否已完成冷启动恢复，路由守卫要等它完成才能放行 */
  const hydrated = ref<boolean>(false)
  /** 正在跳转登录，防止重复跳转 */
  const redirecting = ref<boolean>(false)

  // ── getters ──
  const isLoggedIn = computed<boolean>(() => accessToken.value.length > 0)
  const displayName = computed<string>(() => user.value?.nickname ?? '还没有名字')
  const avatar = computed<string>(() => user.value?.avatarUrl ?? '')

  /**
   * 冷启动恢复。
   * 从安全存储读回凭证，避免每次启动都要重新登录。
   */
  function hydrate(): void {
    if (hydrated.value) return

    const at = getAccessToken()
    if (at.length > 0) {
      accessToken.value = at
      const raw = getUserInfo()
      if (raw.length > 0) {
        try {
          user.value = JSON.parse(raw) as AuthUser
        } catch (e) {
          // 缓存坏了就当没登录，不阻断启动
          user.value = null
        }
      }
    }

    // 无论成败都要置位，否则路由守卫会一直等
    hydrated.value = true
  }

  /** 登录 */
  async function login(phone: string, password: string): Promise<void> {
    const res = await authService.login({ phone, password })
    applyTokens(res.tokens)
    applyUser(res.user)
  }

  /** 注册后直接登录 */
  async function register(
    phone: string,
    password: string,
    nickname?: string,
  ): Promise<void> {
    const res = await authService.register({ phone, password, nickname })
    applyTokens(res.tokens)
    applyUser(res.user)
  }

  /** 静默刷新 */
  async function refresh(): Promise<boolean> {
    const token = await doRefresh()
    if (token.length === 0) {
      logoutLocal()
      return false
    }
    accessToken.value = token
    return true
  }

  /** 登出（调后端 + 清本地） */
  async function logout(): Promise<void> {
    try {
      await authService.logout()
    } catch (e) {
      // 后端失败也要清本地，否则用户会卡在「已登录」的死状态
    }
    logoutLocal()
  }

  /** 拉取最新用户信息 */
  async function fetchMe(): Promise<void> {
    const me = await authService.me()
    applyUser(me)
  }

  function logoutLocal(): void {
    clearAuthState()
    removeUserInfo()
    accessToken.value = ''
    refreshToken.value = ''
    user.value = null
  }

  function applyTokens(tokens: { accessToken: string; refreshToken: string }): void {
    accessToken.value = tokens.accessToken
    refreshToken.value = tokens.refreshToken
    setAccessToken(tokens.accessToken)
    setRefreshToken(tokens.refreshToken)
  }

  function applyUser(u: AuthUser): void {
    user.value = u
    setUserInfo(JSON.stringify(u))
  }

  /** 更新昵称（资料页改完同步过来） */
  function patchUser(patch: Partial<AuthUser>): void {
    if (user.value == null) return
    user.value = { ...user.value, ...patch }
    setUserInfo(JSON.stringify(user.value))
  }

  /**
   * 订阅网络层的「登录态失效」事件。
   * ★ 这是拦截器**不能**自己做跳转的原因：
   *   跳转是 UI 决策，交给 store 与 App 统一处理。
   */
  function bindExpiryListener(onNeedLogin: () => void): void {
    on('auth:expired', (payload: unknown) => {
      const p = payload as { code: number }
      // 重复触发 10 次只处理一次，避免反复弹登录
      if (redirecting.value) return

      if (p.code === CODE.TOKEN_EXPIRED) {
        // 还能刷，先试一次
        refresh()
          .then((ok) => {
            if (!ok) {
              redirecting.value = true
              onNeedLogin()
            }
          })
          .catch(() => {
            redirecting.value = true
            onNeedLogin()
          })
        return
      }

      redirecting.value = true
      logoutLocal()
      onNeedLogin()
    })
  }

  /** 跳转完成后解锁，允许下次再跳 */
  function unlockRedirect(): void {
    redirecting.value = false
  }

  return {
    // state
    accessToken,
    refreshToken,
    user,
    hydrated,
    redirecting,
    // getters
    isLoggedIn,
    displayName,
    avatar,
    // actions
    hydrate,
    login,
    register,
    refresh,
    logout,
    logoutLocal,
    fetchMe,
    patchUser,
    bindExpiryListener,
    unlockRedirect,
  }
})
