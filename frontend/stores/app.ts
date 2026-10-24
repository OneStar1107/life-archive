// stores/app.ts
// ══════════════════════════════════════════════════════════════
// 全局应用状态：主题、网络状态、隐私同意
// ══════════════════════════════════════════════════════════════

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { hasPrivacyConsent, setPrivacyConsent } from '@/core/storage/secure'
import { onNetworkChange, onThemeChange, onWindowResize, setPageShellBackground, windowWidth } from '@/core/platform'
import { emit } from '@/core/http/events'

export type ThemeMode = 'light' | 'dark' | 'follow-system'
export type NetworkType = 'wifi' | '2g' | '3g' | '4g' | '5g' | 'none' | 'unknown'

/** 主题模式在本地存储中的键 */
const THEME_KEY = 'theme_mode'
/** 当前窗口宽度，用于宽屏分档 */
const WIDTH_KEY = 'window_width'

export const useAppStore = defineStore('app', () => {
  // ── state ──
  const themeMode = ref<ThemeMode>('follow-system')
  /** 系统当前主题 */
  const systemTheme = ref<'light' | 'dark'>('light')
  const networkType = ref<NetworkType>('unknown')
  const isOnline = ref<boolean>(true)
  /** 隐私政策是否已同意。★ 未同意前不得调用任何设备信息 API */
  const privacyAccepted = ref<boolean>(false)
  const windowW = ref<number>(375)
  const isWide = ref<boolean>(false)
  const columnCount = ref<number>(1)

  // ── getters ──
  /** 实际生效的主题 */
  const effectiveTheme = computed<'light' | 'dark'>(() => {
    if (themeMode.value === 'follow-system') return systemTheme.value
    return themeMode.value
  })

  const isDark = computed<boolean>(() => effectiveTheme.value === 'dark')

  /** 是否需要展示顶部「网络不可用」横幅 */
  const showOfflineBanner = computed<boolean>(() => !isOnline.value)

  // ── actions ──

  /** 冷启动恢复 */
  function hydrate(): void {
    const saved = uni.getStorageSync(THEME_KEY)
    if (saved === 'light' || saved === 'dark' || saved === 'follow-system') {
      themeMode.value = saved
    }
    privacyAccepted.value = hasPrivacyConsent()
    systemTheme.value = currentSystemTheme()
    measure()
    // ★ 冷启动也要把主题落到「系统层」：导航栏色 + H5 外壳底色。
    //   之前只在 setTheme / 系统主题变化时调用，冷启动深色用户
    //   会先看到一屏白底（外壳没上色），dock 区域尤其明显。
    applyThemeToSystem(themeMode.value)
  }

  function measure(): void {
    const w = windowWidth()
    windowW.value = w
    isWide.value = w >= 600
    // 600 / 840 两档（04 号 T4）
    columnCount.value = w >= 840 ? 3 : w >= 600 ? 2 : 1
    uni.setStorageSync(WIDTH_KEY, w)
  }

  function currentSystemTheme(): 'light' | 'dark' {
    try {
      const info = uni.getSystemInfoSync()
      return info.theme === 'dark' ? 'dark' : 'light'
    } catch (e) {
      return 'light'
    }
  }

  /** 设置主题 */
  function setTheme(mode: ThemeMode): void {
    themeMode.value = mode
    uni.setStorageSync(THEME_KEY, mode)
    applyThemeToSystem(mode)
  }

  /** 循环切换：跟随系统 → 浅色 → 深色 → 跟随系统 */
  function cycleTheme(): void {
    if (themeMode.value === 'follow-system') setTheme('light')
    else if (themeMode.value === 'light') setTheme('dark')
    else setTheme('follow-system')
  }

  /**
   * 把主题写入系统 UI（状态栏、导航栏背景）。
   * ★ 遗漏这一步会导致深色模式下状态栏还是白底，
   *   这是 04 号 T3 点名的「最容易遗漏」项。
   */
  function applyThemeToSystem(mode: ThemeMode): void {
    const dark = mode === 'dark' || (mode === 'follow-system' && systemTheme.value === 'dark')
    // ★ 冷启动 hydrate 时页面还不存在，uni-h5 的 setNavigationBarColor
    //   会抛「page not found」（未捕获直接成为 PAGEERROR）。
    //   导航栏色只是锦上添花，失败静默即可；页面创建后主题切换会再调。
    try {
      uni.setNavigationBarColor({
        frontColor: dark ? '#ffffff' : '#000000',
        backgroundColor: dark ? '#081217' : '#F8FBFE',
        // ★ 只传运行时 API 真实存在的字段。
        //   依据 uni-app x 官方 setNavigationBarColor 文档：
        //   SetNavigationBarColorOptions 的字段是
        //   frontColor / backgroundColor / animation / success / fail / complete，
        //   **不含** backgroundColorTop / backgroundColorBottom。
        //   ★ 那两个字段属于 pages.json 的 globalStyle（iOS 回弹区 overscroll
        //   颜色），是「打包期静态配置」，和运行时 API 不是一个面，不能混用 ——
        //   它们仍在 pages.json globalStyle 里合法存在且必须保留，只是不该出现
        //   在 uni.setNavigationBarColor() 的入参里。
        // ★ 必须显式给 fail 回调：uni-app x 的这类 API 返回值是 Promise，
        //   失败时是「返回被 reject 的 Promise」而不是同步 throw，
        //   所以外层的 try/catch 抓不住，冷启动（页面尚未创建，uni-h5 返回
        //   setNavigationBarColor:fail page not found）会冒成一条未捕获拒绝。
        //   传了 fail 回调，框架内部就会消费这次拒绝，不再冒泡成 PAGEERROR。
        //   ★ 只吞错误、不改调用时机：页面已经创建时（用户在设置页切主题）
        //     调用照常成功，导航栏颜色照常改变，不受影响。
        fail: () => {
          // 页面尚未创建时的预期失败：静默忽略
        },
      })
    } catch (e) {
      // 同步 throw（例如 API 整体不存在）仍然兜住：忽略
    }
    // ★ H5 外壳底色跟随主题。色值必须与 theme.json 的 --color-bg 逐字一致：
    //   uni-h5 对 tabBar 页预留的原生栏空间是透明的，body 不上色的话
    //   深色主题下底部会透出白色画布（「dock 分层」根因之一）。
    setPageShellBackground(dark ? '#081217' : '#F8FBFE')
  }

  /** 同意隐私政策 */
  function acceptPrivacy(): void {
    privacyAccepted.value = true
    setPrivacyConsent(true)
  }

  /** 撤回同意（设置页提供） */
  function revokePrivacy(): void {
    privacyAccepted.value = false
    setPrivacyConsent(false)
  }

  /**
   * 绑定全局监听。
   * ★ 返回的清理函数必须在 App 卸载时调用，否则监听器泄漏
   *   （04 号禁止事项第 7 条）。
   */
  function bindListeners(): () => void {
    const offs: Array<() => void> = []

    offs.push(
      onThemeChange((theme: 'light' | 'dark') => {
        systemTheme.value = theme
        if (themeMode.value === 'follow-system') {
          applyThemeToSystem('follow-system')
        }
      }),
    )

    offs.push(
      onNetworkChange((result: { isConnected: boolean; type: string }) => {
        const wasOffline = !isOnline.value
        isOnline.value = result.isConnected
        networkType.value = result.type as NetworkType
        if (result.isConnected) {
          emit('net:online', { name: 'net:online', type: result.type })
        } else if (wasOffline) {
          emit('net:offline', { name: 'net:offline' })
        }
      }),
    )

    offs.push(
      onWindowResize(() => {
        // 折叠屏展开/折叠、横竖屏切换
        measure()
        applyThemeToSystem(themeMode.value)
      }),
    )

    return () => {
      for (const off of offs) {
        try {
          off()
        } catch (e) {
          // 忽略清理异常
        }
      }
    }
  }

  /** 手动刷新网络类型（进入前台时调用） */
  async function refreshNetworkType(): Promise<void> {
    try {
      const res = await uni.getNetworkType()
      networkType.value = res.networkType as NetworkType
      isOnline.value = res.networkType !== 'none'
    } catch (e) {
      networkType.value = 'unknown'
    }
  }

  return {
    // state
    themeMode,
    systemTheme,
    networkType,
    isOnline,
    privacyAccepted,
    windowWidth: windowW,
    isWide,
    columnCount,
    // getters
    effectiveTheme,
    isDark,
    showOfflineBanner,
    // actions
    hydrate,
    setTheme,
    cycleTheme,
    acceptPrivacy,
    revokePrivacy,
    bindListeners,
    measure,
    refreshNetworkType,
  }
})
