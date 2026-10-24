// core/platform/index.ts
// ══════════════════════════════════════════════════════════════
// ★★★ 全工程唯一允许出现平台条件编译宏的文件 ★★★
// ══════════════════════════════════════════════════════════════
//
// 铁律（00 号第 ⑤ 条 / 03 号第 ⑨ 条）：
//   所有 `#ifdef` / `#ifndef` 只允许出现在本文件。
//   业务代码（pages / components / stores / services）一律禁止。
//   否则每加一个功能就要在三处打补丁，必然失控。
//
// ★ 平台宏必须写 `APP-HARMONY`，写成 `HARMONYOS` 编译不生效且不报错，
//   会导致安卓专属 API 被打进鸿蒙包，运行即崩。这是最高频事故。
//
// 每个导出函数都必须有「三分支 + 兜底」完整实现，缺任何一个平台都编译不过。

// #ifdef APP-HARMONY
const PLATFORM_NAME: string = 'harmony'
// #endif
// #ifdef APP-ANDROID
const PLATFORM_NAME: string = 'android'
// #endif
// #ifdef APP-IOS
const PLATFORM_NAME: string = 'ios'
// #endif
// #ifdef WEB
const PLATFORM_NAME: string = 'web'
// #endif

/** 兜底：未识别的编译目标按 web 处理，保证任何情况下都有值 */
export const PLATFORM: string = typeof PLATFORM_NAME === 'string' ? PLATFORM_NAME : 'web'

/** 是否为折叠屏 / 大屏形态（用窗口宽度判断，不依赖具体设备型号） */
const WIDE_BREAKPOINT: number = 600
const TABLET_BREAKPOINT: number = 840

// ────────────────────────────────────────────────────────────
// 窗口信息
// ────────────────────────────────────────────────────────────

/** 当前窗口宽度（px） */
export function windowWidth(): number {
  // #ifdef APP-HARMONY
  const info = uni.getWindowInfo()
  return info.windowWidth
  // #endif
  // #ifdef APP-ANDROID
  const info = uni.getWindowInfo()
  return info.windowWidth
  // #endif
  // #ifdef APP-IOS
  const info = uni.getWindowInfo()
  return info.windowWidth
  // #endif
  // 兜底：H5 与任何未覆盖的编译目标
  const info = uni.getWindowInfo()
  return info.windowWidth > 0 ? info.windowWidth : 375
}

/** 当前窗口高度（px） */
export function windowHeight(): number {
  const h = uni.getWindowInfo().windowHeight
  return h > 0 ? h : 667
}

/** 屏幕像素比 */
export function pixelRatio(): number {
  const dpr = uni.getWindowInfo().pixelRatio
  return dpr > 0 ? dpr : 2
}

// ────────────────────────────────────────────────────────────
// 安全区
// ────────────────────────────────────────────────────────────

/**
 * 状态栏高度（px）。
 * ★ 业务代码里自定义导航栏时用这个值补顶部，不要自己猜。
 */
export function statusBarHeight(): number {
  // #ifdef APP-HARMONY
  // uni-app x 4.52+ 提供原生 CSS 变量，优先使用
  const v = getCssVarPx('--status-bar-height')
  if (v > 0) return v
  return 0
  // #endif
  // #ifdef APP-ANDROID
  const v = getCssVarPx('--status-bar-height')
  if (v > 0) return v
  // Android 状态栏高度可从系统信息推断
  return uni.getSystemInfoSync().statusBarHeight
  // #endif
  // #ifdef APP-IOS
  const v = getCssVarPx('--status-bar-height')
  if (v > 0) return v
  return uni.getSystemInfoSync().statusBarHeight
  // #endif
  // 兜底
  const info = uni.getSystemInfoSync()
  return info.statusBarHeight > 0 ? info.statusBarHeight : 20
}

/**
 * 底部安全区高度（px）。
 * ★ 固定底栏必须叠加这个值，否则会被 Home Indicator 压住。
 */
export function safeAreaBottom(): number {
  // #ifdef APP-HARMONY
  const v = getCssVarPx('--uni-safe-area-inset-bottom')
  return v > 0 ? v : 0
  // #endif
  // #ifdef APP-ANDROID
  const v = getCssVarPx('--uni-safe-area-inset-bottom')
  if (v > 0) return v
  // Android 手势导航条
  return uni.getSystemInfoSync().safeAreaInsets?.bottom ?? 0
  // #endif
  // #ifdef APP-IOS
  const v = getCssVarPx('--uni-safe-area-inset-bottom')
  if (v > 0) return v
  // iOS 底部 Home Indicator
  const insets = uni.getSystemInfoSync().safeAreaInsets
  if (insets && insets.bottom > 0) return insets.bottom
  return 34
  // #endif
  // 兜底
  return 0
}

/** 顶部安全区高度（px） */
export function safeAreaTop(): number {
  const v = getCssVarPx('--uni-safe-area-inset-top')
  if (v > 0) return v
  return statusBarHeight()
}

/** 左侧安全区（刘海横屏时用） */
export function safeAreaLeft(): number {
  const v = getCssVarPx('--uni-safe-area-inset-left')
  return v > 0 ? v : 0
}

/** 右侧安全区 */
export function safeAreaRight(): number {
  const v = getCssVarPx('--uni-safe-area-inset-right')
  return v > 0 ? v : 0
}

// ────────────────────────────────────────────────────────────
// 设备形态
// ────────────────────────────────────────────────────────────

/** 是否为折叠屏（展开后接近方屏） */
export function isFoldable(): boolean {
  // 鸿蒙可通过屏幕形态常量判断
  // #ifdef APP-HARMONY
  const info = uni.getDeviceInfoSync()
  if (info.deviceType === 'foldable') return true
  // #endif
  // 兜底：三端通用判断——短边与长边之比接近 1，且宽度超过常规手机
  const w = windowWidth()
  const h = windowHeight()
  const shortSide = w < h ? w : h
  const longSide = w < h ? h : w
  const ratio = shortSide / longSide
  return ratio > 0.75 && longSide > WIDE_BREAKPOINT
}

/** 设备形态：phone | tablet | 2in1 | foldable */
export function deviceType(): string {
  // #ifdef APP-HARMONY
  const t = uni.getDeviceInfoSync().deviceType
  if (t === 'tablet' || t === '2in1' || t === 'tv' || t === 'foldable') return t
  // #endif
  // #ifdef APP-ANDROID
  const t = uni.getDeviceInfoSync().deviceType
  if (t === 'tablet' || t === '2in1' || t === 'tv') return t
  // #endif
  // #ifdef APP-IOS
  const t = uni.getDeviceInfoSync().deviceType
  if (t === 'tablet' || t === '2in1' || t === 'tv') return t
  // #endif
  // 兜底：按窗口宽度分档
  const w = windowWidth()
  if (w >= TABLET_BREAKPOINT) return 'tablet'
  if (w >= WIDE_BREAKPOINT) return 'foldable'
  return 'phone'
}

/** 是否为宽屏（列表需要切多列的判定依据） */
export function isWide(): boolean {
  return windowWidth() >= WIDE_BREAKPOINT
}

/** 宽屏档位：1 = 单列，2 = 双列，3 = 三列 */
export function columnCount(): number {
  const w = windowWidth()
  if (w >= TABLET_BREAKPOINT) return 3
  if (w >= WIDE_BREAKPOINT) return 2
  return 1
}

// ────────────────────────────────────────────────────────────
// 系统信息
// ────────────────────────────────────────────────────────────

/** 系统名：harmony | ios | android | web（运行时判断，非编译期） */
export function osName(): string {
  const n = uni.getDeviceInfoSync().osName
  return typeof n === 'string' && n.length > 0 ? n : 'unknown'
}

/** 系统版本号字符串 */
export function osVersionStr(): string {
  const v = uni.getDeviceInfoSync().osVersion
  return typeof v === 'string' && v.length > 0 ? v : '0.0'
}

/** 鸿蒙 SDK API 版本；非鸿蒙返回 0 */
export function osHarmonySdkApiVersion(): number {
  // #ifdef APP-HARMONY
  const v = uni.getDeviceInfoSync().osHarmonySDKAPIVersion
  return typeof v === 'number' ? v : 14
  // #endif
  return 0
}

/**
 * 统一的能力探测入口。
 * 任何高于兼容基线的能力，调用前都必须先过这里。
 */
export function canUse(feature: string): boolean {
  const major = parseInt(osVersionStr().split('.')[0] ?? '0', 10)

  switch (feature) {
    case 'harmony_write_download':
      // 鸿蒙写下载目录需要 API 15+
      return PLATFORM !== 'harmony' || osHarmonySdkApiVersion() >= 15
    case 'foldable_hover':
      return isFoldable()
    case 'ios_haptics':
      return PLATFORM === 'ios' && major >= 13
    default:
      // 未知能力一律按不支持处理，宁可功能降级也不要崩
      return false
  }
}

/** 设备品牌与型号（仅用于日志与崩溃归类，不做逻辑分支） */
export function deviceBrand(): string {
  const b = uni.getDeviceInfoSync().brand
  return typeof b === 'string' ? b : 'unknown'
}

export function deviceModel(): string {
  const m = uni.getDeviceInfoSync().model
  return typeof m === 'string' ? m : 'unknown'
}

// ────────────────────────────────────────────────────────────
// 权限
// ────────────────────────────────────────────────────────────

/** 权限名规范：三端统一用业务语义名，内部映射到各平台权限 */
export type PermissionName = 'camera' | 'photo' | 'microphone' | 'location' | 'notification'

/**
 * 运行时申请权限。
 * @returns 是否已授权
 */
export function requestPermission(name: PermissionName): Promise<boolean> {
  // #ifdef APP-HARMONY
  // 鸿蒙权限名是 ohos.permission.*，且必须先在 module.json5 声明
  const map: Map<string, string> = new Map<string, string>([
    ['camera', 'ohos.permission.CAMERA'],
    ['photo', 'ohos.permission.READ_IMAGEVIDEO'],
    ['microphone', 'ohos.permission.MICROPHONE'],
    ['location', 'ohos.permission.APPROXIMATELY_LOCATION'],
    ['notification', 'ohos.permission.NOTIFICATION_CONTROLLER'],
  ])
  const perm = map.get(name)
  if (perm == null) return Promise.resolve(false)
  return new Promise<boolean>((resolve) => {
    // @ts-ignore 鸿蒙 API，编译到其他平台时该分支被条件编译剔除
    abilityAccessCtrl
      .createAbilityAccessCtrl()
      .requestPermissionsFromUser(uni.getContext() as common.UIAbilityContext, [perm])
      .then((result: object) => {
        const r = result as { authResults: number[] }
        resolve(r.authResults.length > 0 && r.authResults[0] === 0)
      })
      .catch(() => resolve(false))
  })
  // #endif

  // #ifdef APP-ANDROID
  // Android 6+ 需运行时动态申请
  const perms = androidPermissionMap(name)
  if (perms.length === 0) return Promise.resolve(false)
  const main = uni.getContext() as AndroidContext
  return new Promise<boolean>((resolve) => {
    main.requestPermissions(perms, (result) => {
      resolve(result.granted.length > 0)
    })
  })
  // #endif

  // #ifdef APP-IOS
  // iOS 权限需在 Info.plist 写 NS*UsageDescription
  const perms = iosPermissionMap(name)
  if (perms.length === 0) return Promise.resolve(false)
  return new Promise<boolean>((resolve) => {
    // @ts-ignore uni-app x 的 iOS 权限 API
    uni.authorize({ perms, success: () => resolve(true), fail: () => resolve(false) })
  })
  // #endif

  // 兜底：不支持运行时申请的编译目标一律视为未授权，功能降级
  return Promise.resolve(false)
}

/** 查询权限当前状态（不弹窗） */
export function checkPermission(name: PermissionName): boolean {
  // #ifdef APP-HARMONY
  const map: Map<string, string> = new Map<string, string>([
    ['camera', 'ohos.permission.CAMERA'],
    ['photo', 'ohos.permission.READ_IMAGEVIDEO'],
    ['microphone', 'ohos.permission.MICROPHONE'],
    ['location', 'ohos.permission.APPROXIMATELY_LOCATION'],
    ['notification', 'ohos.permission.NOTIFICATION_CONTROLLER'],
  ])
  const perm = map.get(name)
  if (perm == null) return false
  try {
    // @ts-ignore 鸿蒙 API
    const at = abilityAccessCtrl
      .createAbilityAccessCtrl()
      .checkAccessToken(uni.getContext() as common.UIAbilityContext, perm)
    return at === 0
  } catch (e) {
    return false
  }
  // #endif
  return false
}

/** 打开系统设置页，让用户手动授权 */
export function openAppSettings(): void {
  // #ifdef APP-ANDROID
  // @ts-ignore uni-app x 的原生桥
  uni.getNativePlugin('Context')?.requestPermission()
  return
  // #endif
  // #ifdef APP-IOS
  // ★ 禁止使用 plus.*（uni-app x 不支持），用 uni 的通用 API
  uni.openAppAuthorizeSetting()
  return
  // #endif
  // #ifdef APP-HARMONY
  // @ts-ignore 鸿蒙 API
  const ctx = uni.getContext() as common.UIAbilityContext
  abilityAccessCtrl
    .createAbilityAccessCtrl()
    .openAppSettingsDetails(ctx.startAbilityInfo.bundleName, 0)
  return
  // #endif
  // 兜底：不支持直接跳转，提示用户手动去系统设置
}

// ────────────────────────────────────────────────────────────
// 网络
// ────────────────────────────────────────────────────────────

/** 网络类型：wifi | 2g | 3g | 4g | 5g | none | unknown */
export function networkType(): string {
  const t = uni.getNetworkTypeSync()
  return typeof t === 'string' ? t : 'unknown'
}

/** 打开系统网络设置 */
export function openNetworkSettings(): void {
  // #ifdef APP-ANDROID || APP-IOS
  // @ts-ignore
  uni.openNetworkSettings()
  return
  // #endif
  // 鸿蒙与兜底：不支持直接跳转，提示用户手动设置
}

// ────────────────────────────────────────────────────────────
// 生命周期辅助
// ────────────────────────────────────────────────────────────

/**
 * 监听窗口尺寸变化（折叠屏展开/折叠、横竖屏切换）。
 * ★ 返回的取消函数必须在页面卸载时调用，否则监听器泄漏。
 *
 * ★ 签名只暴露 () => void：现有使用方（stores/app.ts、pages/memory/index.uvue）
 *   都不消费尺寸参数。handler 故意写成零参函数 —— TS/uts 允许参数少于目标
 *   回调签名，这样完全不依赖 uni API 的回调结果类型名（OnWindowResize* 在
 *   本机 @dcloudio/uni-app-x 类型库中不存在，写内联对象类型会在 uts/Kotlin
 *   严格类型检查下与官方签名不匹配 → Android 编译失败，H5 因 esbuild 不查
 *   类型而侥幸通过，见 onNetworkChange 的同款教训）。
 */
export function onWindowResize(callback: () => void): () => void {
  const handler = (): void => {
    callback()
  }
  uni.onWindowResize(handler)
  return () => {
    uni.offWindowResize(handler)
  }
}

/**
 * 监听网络状态变化。
 *
 * ★ handler 的参数类型必须写官方全局类型 OnNetworkStatusChangeCallbackResult
 *   （字段 isConnected: boolean + networkType: string），并在此处映射为
 *   platform 层的 { isConnected, type } 语义类型。
 *   教训：曾写内联 { isConnected: boolean; type: string } 直接传给
 *   uni.onNetworkStatusChange —— 字段名对不上官方 networkType，H5 的
 *   esbuild 不做类型检查侥幸通过，Android 的 uts 编译器（Kotlin）严格
 *   类型检查直接编译失败（App.uvue 报错，行号落在调用方）。
 *   官方示例即裸用该全局类型名，无需 import。
 */
export function onNetworkChange(
  callback: (result: { isConnected: boolean; type: string }) => void,
): () => void {
  const handler = (res: OnNetworkStatusChangeCallbackResult) => {
    callback({ isConnected: res.isConnected, type: res.networkType })
  }
  uni.onNetworkStatusChange(handler)
  return () => {
    uni.offNetworkStatusChange(handler)
  }
}

/** 监听深色模式切换 */
export function onThemeChange(callback: (theme: 'light' | 'dark') => void): () => void {
  // ★ 同 onNetworkChange 的教训：参数类型用官方全局类型，不用内联对象类型
  const handler = (res: OnThemeChangeCallbackResult) => {
    callback(res.theme)
  }
  uni.onThemeChange(handler)
  return () => {
    uni.offThemeChange(handler)
  }
}

/**
 * 给页面外壳上底色（H5 专用兜底）。
 *
 * ★ 为什么需要：uni-h5 对 tabBar 页**即使 custom:true** 也按原生 tabBar
 *   高度预留底部空间 —— uni-page-wrapper 被压短 --tab-bar-height，
 *   uni-page-body::after 再垫一块同高占位；而原生栏本体已被全局样式
 *   display:none 隐藏。三者叠加出一段「无主」的透明区，body 背景也是
 *   透明（var(--background-color-content) 无人定义）→ 透出白色画布。
 *   浅色主题白上贴白看不见；深色主题下就是底部刺眼白带，自定义
 *   tabBar 半透明底盖在上面整体发白 —— 用户报的「底部分层」根因。
 *
 * body 的背景色会向整个画布传播，能兜住所有透明露白的场景。
 * 仅 H5 存在 document；App / 小程序 / 鸿蒙的页面自绘全屏，无此问题。
 */
export function setPageShellBackground(color: string): void {
  // #ifdef WEB
  if (typeof document !== 'undefined' && document.body != null) {
    document.body.style.backgroundColor = color
  }
  // #endif
  // #ifndef WEB
  // 非 H5 端：页面自绘全屏，不存在「外壳」透色，无需处理
  // #endif
}

// ────────────────────────────────────────────────────────────
// 内部工具
// ────────────────────────────────────────────────────────────

/**
 * 读取原生 CSS 变量的像素值。
 * uni-app x 4.52+ 提供 --uni-safe-area-inset-* 与 --status-bar-height，
 * 原生层算得比 Web 兼容写法准，优先用它们。
 */
function getCssVarPx(name: string): number {
  try {
    // @ts-ignore uts 的全局对象在部分平台不存在
    const v = uni.getWindowInfo().safeAreaInsets
    if (v == null) return 0
    // uni.getWindowInfo 不直接暴露 CSS 变量，退回 safeAreaInsets
    if (name === '--status-bar-height' || name === '--uni-safe-area-inset-top') return v.top
    if (name === '--uni-safe-area-inset-bottom') return v.bottom
    if (name === '--uni-safe-area-inset-left') return v.left
    if (name === '--uni-safe-area-inset-right') return v.right
    return 0
  } catch (e) {
    return 0
  }
}

/** Android 权限映射（运行时申请用） */
function androidPermissionMap(name: string): string[] {
  const map: Map<string, string[]> = new Map<string, string[]>([
    ['camera', ['android.permission.CAMERA']],
    ['photo', ['android.permission.READ_EXTERNAL_STORAGE', 'android.permission.WRITE_EXTERNAL_STORAGE']],
    ['microphone', ['android.permission.RECORD_AUDIO']],
    ['location', ['android.permission.ACCESS_FINE_LOCATION']],
    ['notification', ['android.permission.POST_NOTIFICATIONS']],
  ])
  const v = map.get(name)
  return v ?? []
}

/** iOS 权限映射（uni.authorize 的 perms 名称） */
function iosPermissionMap(name: string): string[] {
  const map: Map<string, string[]> = new Map<string, string[]>([
    ['camera', ['scope.camera']],
    ['photo', ['scope.writePhotosAlbum']],
    ['microphone', ['scope.record']],
    ['location', ['scope.userLocation']],
    ['notification', []],
  ])
  const v = map.get(name)
  return v ?? []
}

export default {
  PLATFORM,
  windowWidth,
  windowHeight,
  pixelRatio,
  statusBarHeight,
  safeAreaBottom,
  safeAreaTop,
  safeAreaLeft,
  safeAreaRight,
  isFoldable,
  deviceType,
  isWide,
  columnCount,
  osName,
  osVersionStr,
  osHarmonySdkApiVersion,
  canUse,
  deviceBrand,
  deviceModel,
  requestPermission,
  checkPermission,
  openAppSettings,
  networkType,
  openNetworkSettings,
  onWindowResize,
  onNetworkChange,
  onThemeChange,
  setPageShellBackground,
}
