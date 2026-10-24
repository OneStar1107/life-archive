/**
 * config/validation.ts
 * 环境变量 Joi 校验。★ 缺任一必需项立即退出，不留到运行时才发现 undefined。
 */

import * as Joi from 'joi'

/** 密码最小强度：8 位 + 字母 + 数字 */
const PASSWORD_RULE = /^(?=.*[A-Za-z])(?=.*\d)[\S]{8,72}$/

/** 弱口令黑名单：出现即视为未设置 */
const WEAK_SECRETS = [
  'secret',
  'password',
  'changeme',
  'replace_me',
  'your_secret',
  '123456',
  'test',
]

export const envValidationSchema = Joi.object({
  // ── 运行环境 ──
  NODE_ENV: Joi.string()
    .valid('development', 'staging', 'production', 'test')
    .default('development')
    .messages({ 'any.only': 'NODE_ENV 只能是 development / staging / production / test' }),

  PORT: Joi.number().port().default(3000),

  CORS_ORIGINS: Joi.string()
    .default('http://localhost:5173')
    .messages({ 'string.base': 'CORS_ORIGINS 必须是逗号分隔的来源列表' }),

  // ── 数据库 ──
  DATABASE_URL: Joi.string()
    .required()
    .pattern(/^postgres(ql)?:\/\//)
    .messages({
      'any.required': '缺少必需环境变量 DATABASE_URL',
      'string.pattern.base': 'DATABASE_URL 必须是 postgresql:// 开头',
    }),

  PRISMA_LOG_LEVEL: Joi.string().valid('query', 'info', 'warn', 'error').default('warn'),

  REDIS_URL: Joi.string()
    .allow('')
    .default('')
    .pattern(/^$|^redis(s)?:\/\//)
    .messages({ 'string.pattern.base': 'REDIS_URL 必须是 redis:// 开头（留空表示不使用）' }),

  // ── JWT ──
  JWT_SECRET: Joi.string()
    .required()
    .min(32)
    .custom((value: string, helpers: Joi.CustomHelpers) => {
      const lower = value.toLowerCase()
      if (WEAK_SECRETS.some((w) => lower.includes(w))) {
        return helpers.error('any.invalid')
      }
      return value
    })
    .messages({
      'any.required': '缺少必需环境变量 JWT_SECRET',
      'string.min': 'JWT_SECRET 长度必须 ≥32 字符',
      'any.invalid': 'JWT_SECRET 过于简单或仍是占位值，请替换为随机字符串',
    }),

  JWT_REFRESH_SECRET: Joi.string()
    .required()
    .min(32)
    .invalid(Joi.ref('JWT_SECRET'))
    .custom((value: string, helpers: Joi.CustomHelpers) => {
      const lower = value.toLowerCase()
      if (WEAK_SECRETS.some((w) => lower.includes(w))) {
        return helpers.error('any.invalid')
      }
      return value
    })
    .messages({
      'any.required': '缺少必需环境变量 JWT_REFRESH_SECRET',
      'string.min': 'JWT_REFRESH_SECRET 长度必须 ≥32 字符',
      'any.invalid': 'JWT_REFRESH_SECRET 过于简单、仍是占位值，或与 JWT_SECRET 相同',
    }),

  ACCESS_TTL: Joi.number()
    .integer()
    .min(60)
    // ★ 02 号禁止事项第 6 条：Access Token 有效期不得超过 30 分钟
    .max(1800)
    .default(900)
    .messages({ 'number.max': 'ACCESS_TTL 不得超过 1800 秒（30 分钟），这是安全硬上限' }),

  REFRESH_TTL: Joi.number().integer().min(3600).max(2592000).default(604800),

  BCRYPT_COST: Joi.number().integer().min(12).max(15).default(12).messages({
    'number.min': 'BCRYPT_COST 不得低于 12',
  }),

  // ── 限流 ──
  THROTTLE_TTL: Joi.number().integer().min(1).default(60),
  THROTTLE_LIMIT: Joi.number().integer().min(1).default(120),
  THROTTLE_AUTH_TTL: Joi.number().integer().min(1).default(60),
  THROTTLE_AUTH_LIMIT: Joi.number().integer().min(1).max(20).default(5),

  // ── 上传 ──
  UPLOAD_ROOT: Joi.string()
    .required()
    .pattern(/^[A-Za-z]:[\\/]|^\//)
    .messages({
      'any.required': '缺少必需环境变量 UPLOAD_ROOT',
      'string.pattern.base': 'UPLOAD_ROOT 必须是绝对路径，且禁止设在项目目录内',
    }),

  UPLOAD_MAX_SIZE: Joi.number().integer().min(1024).default(10485760),
  UPLOAD_MIME_WHITELIST: Joi.string()
    .required()
    .messages({ 'any.required': '缺少必需环境变量 UPLOAD_MIME_WHITELIST' }),

  // ── 业务常量 ──
  APP_NAME: Joi.string().required().messages({ 'any.required': '缺少必需环境变量 APP_NAME' }),

  APP_BUNDLE_ID: Joi.string()
    .required()
    .pattern(/^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*){2,}$/)
    .messages({
      'any.required': '缺少必需环境变量 APP_BUNDLE_ID',
      'string.pattern.base': 'APP_BUNDLE_ID 必须 ≥3 段、每段以字母开头（鸿蒙命名规则）',
    }),

  // ★ 主体名称允许含中文，禁止含占位标记
  APP_ENTITY_NAME: Joi.string()
    .required()
    .custom((value: string, helpers: Joi.CustomHelpers) => {
      if (value.includes('待补充') || value.includes('TODO')) {
        return helpers.message({
          custom:
            'APP_ENTITY_NAME 仍是占位值「待补充」。请填入营业执照主体全称后重启（软著/备案/商店须同一主体）',
        })
      }
      return value
    })
    .messages({ 'any.required': '缺少必需环境变量 APP_ENTITY_NAME' }),

  API_BASE_URL: Joi.string()
    .required()
    .uri({ scheme: ['https', 'http'] })
    .messages({ 'any.required': '缺少必需环境变量 API_BASE_URL' }),

  PRIVACY_POLICY_URL: Joi.string()
    .required()
    .uri({ scheme: ['https'] })
    .messages({
      'any.required': '缺少必需环境变量 PRIVACY_POLICY_URL',
      'string.uri': 'PRIVACY_POLICY_URL 必须是 https 地址（三端商店硬要求）',
    }),

  SUPPORT_EMAIL: Joi.string()
    .email()
    .default('support@lifearchive.cn')
    .messages({ 'string.email': 'SUPPORT_EMAIL 格式有误' }),

  // ── 日志 ──
  LOG_LEVEL: Joi.string().valid('fatal', 'error', 'warn', 'info', 'debug', 'trace').default('info'),
  LOG_DEPLOY_ENV: Joi.string().valid('local', 'docker', 'k8s').default('local'),
})

/**
 * 生产环境额外硬性检查：这些项在 dev 可以放宽，在 prod 必须拦下。
 */
export function assertProductionSafety(env: NodeJS.ProcessEnv): void {
  if (env['NODE_ENV'] !== 'production') return

  const problems: string[] = []

  if (env['CORS_ORIGINS']?.includes('*')) {
    problems.push('CORS_ORIGINS 不得为 *')
  }
  if (env['API_BASE_URL']?.startsWith('http://')) {
    problems.push('生产环境 API_BASE_URL 必须使用 https')
  }
  // 强制 HTTPS
  if (!env['API_BASE_URL']?.startsWith('https://')) {
    problems.push('生产环境必须强制 HTTPS')
  }

  if (problems.length > 0) {
    throw new Error(`生产环境配置不安全，已拒绝启动：\n  - ${problems.join('\n  - ')}`)
  }
}

export { PASSWORD_RULE }
