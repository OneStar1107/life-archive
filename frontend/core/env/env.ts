// core/env/env.ts
// ══════════════════════════════════════════════════════════════
// 环境配置：dev / staging / prod 三套
// ══════════════════════════════════════════════════════════════
//
// 铁律（03 号 T8 / 05 号禁止事项第 1 条）：
//   baseURL 由本文件统一注入，**页面与服务禁止硬编码 URL 或 IP**。

/** 编译模式。由 HBuilderX / uni-app x 的编译环境决定 */
export type EnvMode = 'development' | 'production'

/**
 * 取当前编译模式。
 * ★ 开发/生产判定用 process.env.NODE_ENV（uts 官方支持，hello-uni-app-x 同款写法，
 *   H5 下由 vite define 静态替换，原生端由 uts 编译器处理）。
 *   注意：`#ifdef DEBUG` 不是合法宏（编译器 DEFAULT_KEYS 白名单里没有 DEBUG），
 *   写了等于没写、静默失效 —— 已踩坑，勿再用条件编译判 dev。
 */
function currentMode(): EnvMode {
  return process.env.NODE_ENV === 'development' ? 'development' : 'production'
}

export const MODE: EnvMode = currentMode()

/** 是否为开发模式 */
export const IS_DEV: boolean = MODE === 'development'

// ────────────────────────────────────────────────────────────
// 后端地址
// ────────────────────────────────────────────────────────────
//
// ⚠️ TODO(待补充)：以下地址为占位值。
//    上线前需替换为已完成 ICP 备案的真实域名，
//    并同步更新 docs/project/占位符取值表.md 与隐私政策。

const DEV_BASE_URL: string = 'http://192.168.1.124:3000'
// ★ H5 开发走「同源相对路径 + manifest.json 的 h5.devServer.proxy 代理」。
//   BASE_URL 留空 → 请求变成 /auth/... /feelings/... 这样的同源相对地址，
//   由 manifest.json 里配置的代理转发到后端 :3000，
//   从根本上绕开「浏览器 XHR 跨源到 :3000 偶发失败」的怪象
//   （实测：fetch 到 3000 通、XHR 到 3000 挂、curl 到 3000 通）。
//   ★ 代理配置在 manifest.json 的 h5.devServer.proxy（uni 官方支持位），
//     不要用根目录 vite.config.ts —— 会导致 uni 的 /main 入口解析失效（白屏，已踩坑）。
//   原生三端（iOS/Android/Harmony）仍直连本机后端，不经由代理。
//   ★ H5 的条件编译宏是 WEB（编译器白名单里没有 APP-WEB，写了等于没写）。
// #ifdef WEB
const H5_DEV_BASE_URL: string = ''
// #endif

const STAGING_BASE_URL: string = 'https://staging-api.lifearchive.cn'
const PROD_BASE_URL: string = 'https://api.lifearchive.cn'

/** 当前生效的 baseURL（不带尾部斜杠） */
export const BASE_URL: string = ((): string => {
  if (IS_DEV) {
    // #ifdef WEB
    return H5_DEV_BASE_URL
    // #endif
    return DEV_BASE_URL
  }
  // 预发环境通过构建参数切换，正式包一律走 PROD
  return PROD_BASE_URL
})()

/** 预发地址单独导出，供 QA 包显式指定 */
export const STAGING_URL: string = STAGING_BASE_URL

// ────────────────────────────────────────────────────────────
// 网络参数
// ────────────────────────────────────────────────────────────

/** 超时 15 秒（05 号 T1：uni.request 默认 60s 太长，用户会以为 App 死了） */
export const TIMEOUT: number = 15000

/** 幂等 GET 的最大重试次数（05 号 T5） */
export const MAX_RETRY: number = 2

/** 退避基数：500ms → 1500ms */
export const RETRY_BASE_DELAY: number = 500

/** 搜索防抖间隔 */
export const SEARCH_DEBOUNCE: number = 300

// ────────────────────────────────────────────────────────────
// 合规常量
// ────────────────────────────────────────────────────────────

/**
 * ★ 隐私政策地址。
 * TODO(待补充)：需部署为**独立可访问的 https 网页**。
 * 不能是 App 内文本或图片，否则三端商店都会驳回。
 */
export const PRIVACY_POLICY_URL: string = 'https://www.lifearchive.cn/privacy'

/** 客服邮箱 */
export const SUPPORT_EMAIL: string = 'support@lifearchive.cn'

/**
 * 心理援助热线。
 * 依据产品原则：号码不主动展示，由用户决定是否拨打（防滥用）。
 */
export const CRISIS_HOTLINE: string = '400-161-9995'

/** 是否已在本地同意隐私政策 */
export const PRIVACY_CONSENT_KEY: string = 'privacy_consent_accepted'

export default {
  MODE,
  IS_DEV,
  BASE_URL,
  STAGING_URL,
  TIMEOUT,
  MAX_RETRY,
  RETRY_BASE_DELAY,
  SEARCH_DEBOUNCE,
  PRIVACY_POLICY_URL,
  SUPPORT_EMAIL,
  CRISIS_HOTLINE,
  PRIVACY_CONSENT_KEY,
}
