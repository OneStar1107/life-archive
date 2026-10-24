/**
 * frontend/fixtures/account.js
 * ══════════════════════════════════════════════════════════════
 * 测试账号配置（07 号 ⑦：测试账号走 fixtures 或环境变量）
 * ══════════════════════════════════════════════════════════════
 *
 * ┌─────────────────────────────────────────────────────────┐
 * │ ★★★ 这些账号只在本地 mock 环境存在 ★★★                  │
 * ├─────────────────────────────────────────────────────────┤
 * │                                                         │
 * │  本文件里的手机号与密码是**占位值**，不对应任何真实用户，   │
 * │  也不存在于任何生产或预发数据库。                        │
 * │                                                         │
 * │  它们唯一的用途：                                        │
 * │    1. 驱动需要登录态的 UI 用例走通流程；                  │
 * │    2. 在后端 e2e（backend/test/*.e2e-spec.ts）里被       │
 * │       注册接口真实创建出来，供 automator 登录使用。       │
 * │                                                         │
 * │  ⚠️ 严禁把真实账号密码写进本文件或任何测试文件            │
   *     （07 号禁止事项第 4 条 + DoD「测试代码中 grep 不到     │
 * │     任何真实账号密码」）。                              │
 * │     scripts/check-secrets.mjs 会在 CI 拦截。             │
 * │                                                         │
 * │  需要真实联调时，通过环境变量注入，不落库：                │
 * │    PowerShell: $env:QA_PHONE='...'; $env:QA_PASSWORD='...'│
 * └─────────────────────────────────────────────────────────┘
 *
 * ★ 为什么默认值可以「看起来像真的」：
 *   13800138000 是中国移动的官方客服号码，属于公开信息，
 *   用它做占位能通过手机号格式校验（1[3-9]xxxxxxxxx），
 *   又不会被误认为某个真人。密码同理，取一个满足后端
 *   PASSWORD_RULE（≥8 位且含字母与数字）的固定串。
 */

/** 读取环境变量，缺省时用安全占位值 */
function fromEnv(key, fallback) {
  const v = process.env[key]
  return v != null && v.length > 0 ? v : fallback
}

module.exports = {
  /**
   * 主测试账号：跑绝大多数 UI 用例（首页聚合、感受、记忆、健康、设置）。
   *
   * ★ 必须是「已同意隐私政策」状态 —— 路由守卫（core/router/guard.ts）
   *   在未同意时会把所有受保护页重定向到隐私页，
   *   UI 用例会全部卡在第一页。相关用例用 seedConsent() 显式设置。
   */
  primary: {
    phone: fromEnv('QA_PHONE', '13800138000'),
    password: fromEnv('QA_PASSWORD', 'QaPass2026'),
    nickname: '自动化测试用户',
  },

  /**
   * 第二个账号：用于「数据隔离」类用例。
   *
   * ★ 存在的理由：NOT_RESOURCE_OWNER（30003「只能操作自己的数据」）
   *   这条错误码必须用「另一个用户」才能验出来。
   *   同一个账号访问自己的数据永远成功，测不出越权。
   *   需求：docs/release/test-matrix.md 的错误态用例组。
   */
  secondary: {
    // ★ 13800138001 是夹具占位号（与 primary 只差末位，便于肉眼区分两个账号），
    //   在任何真实运营商体系里都不可能同时分配给两个真实用户。
    //   本地 mock 环境用它注册即可；真实联调时由 QA_PHONE_2 注入覆盖。
    phone: fromEnv('QA_PHONE_2', '13800138001'), // 夹具占位号码
    password: fromEnv('QA_PASSWORD_2', 'QaPass2026'),
    nickname: '隔离验证用户',
  },

  /**
   * 游客（未登录）状态。
   *
   * ★ 游客是一等公民（登录页 onSkip 直达首页），
   *   所以「未登录也能逛」必须有用例覆盖，
   *   不能只测登录后的路径。
   */
  guest: {
    phone: '',
    password: '',
  },

  /**
   * 故意错误的凭据：验证错误提示。
   *
   * ★ 用固定的错密码而不是随机串：随机串每次都不一样，
   *   一旦后端返回了不同的错误码（比如 20007 账号停用），
   *   用例失败会难以定位是「断言写错了」还是「后端行为变了」。
   */
  wrong: {
    phone: fromEnv('QA_PHONE', '13800138000'),
    password: 'WrongPass2026',
  },

  /**
   * 非法手机号：验证端上格式校验。
   *
   * ★ 端上校验（login.uvue 的 phoneError）只拦「明显不可能对」的，
   *   权威判定在后端 DTO。用例要能区分「端上拦住」与「后端拒绝」。
   */
  invalidPhone: {
    phone: '12345',
    password: 'QaPass2026',
  },

  /** 弱密码：验证 passwordError 提示（少于 8 位） */
  weakPassword: {
    phone: '13800138000',
    password: '123',
  },

  /**
   * 登录态注入用的 storage 键。
   *
   * ★ 必须与 core/storage/secure.ts 的键名逐字一致，
   *   否则「已登录」前置条件不成立，用例会在第一屏就被守卫重定向。
   *   secure.ts 用的是 uni.setStorageSync 写令牌
   *   （明文写 storage 是刻意的：App 端沙盒存储已由系统加密）。
   */
  storageKeys: {
    accessToken: 'access_token',
    refreshToken: 'refresh_token',
    userInfo: 'user_info',
    privacyConsent: 'privacy_consent_accepted',
  },

  /**
   * 伪造令牌：验证 401 刷新与「10 个并发 401 只触发 1 次 refresh」。
   *
   * ★ 伪造值是**测试意图的一部分**，不是泄漏：
   *   要验证「令牌无效时被拒绝」，就必须给一个形状合法的假令牌。
   *   三个 base64url 段对应 JWT 的 header.payload.signature，
   *   payload 里写的是 forged-test-user，明示这不是真实用户。
   *   scripts/check-secrets.mjs 对含「伪造 / 测试」字样的行放行。
   */
  forgedTokens: {
    // ↓ 行尾的「伪造」二字不是装饰：check-secrets.mjs 按行匹配豁免词，
    //   注释写在上一行不生效。这是「假令牌是测试意图的一部分」的正式标记。
    access: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJmb3JnZWQtdGVzdC11c2VyIn0.ZmFrZS1zaWduYXR1cmUtZm9yLXRlc3Qtb25seQ', // 伪造
    refresh: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJmb3JnZWQtdGVzdC11c2VyIn0.ZmFrZS1yZWZyZXNoLXNpZ25hdHVyZS1mb3ItdGVzdA', // 伪造
  },
}
