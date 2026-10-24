/**
 * config/configuration.ts
 * 集中读取环境变量。所有模块一律从这里取配置，禁止直接读 process.env。
 */

import { registerAs } from '@nestjs/config'

export const appConfig = registerAs('app', () => {
  const env = process.env
  const nodeEnv = env['NODE_ENV'] ?? 'development'
  return {
    name: env['APP_NAME'] ?? '人生档案',
    bundleId: env['APP_BUNDLE_ID'] ?? 'com.lifearchive.app',
    entityName: env['APP_ENTITY_NAME'] ?? '',
    apiBaseUrl: env['API_BASE_URL'] ?? '',
    privacyPolicyUrl: env['PRIVACY_POLICY_URL'] ?? '',
    supportEmail: env['SUPPORT_EMAIL'] ?? 'support@lifearchive.cn',
    nodeEnv,
    isProd: nodeEnv === 'production',
    isTest: nodeEnv === 'test',
    port: Number(env['PORT'] ?? 3000),
    corsOrigins: (env['CORS_ORIGINS'] ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  }
})

export const databaseConfig = registerAs('database', () => ({
  url: process.env['DATABASE_URL'] ?? '',
  logLevel: (process.env['PRISMA_LOG_LEVEL'] ?? 'warn') as 'query' | 'info' | 'warn' | 'error',
  redisUrl: process.env['REDIS_URL'] ?? '',
}))

export const authConfig = registerAs('auth', () => ({
  jwtSecret: process.env['JWT_SECRET'] ?? '',
  jwtRefreshSecret: process.env['JWT_REFRESH_SECRET'] ?? '',
  accessTtl: Number(process.env['ACCESS_TTL'] ?? 900),
  refreshTtl: Number(process.env['REFRESH_TTL'] ?? 604800),
  bcryptCost: Number(process.env['BCRYPT_COST'] ?? 12),
}))

export const throttleConfig = registerAs('throttle', () => ({
  ttl: Number(process.env['THROTTLE_TTL'] ?? 60),
  limit: Number(process.env['THROTTLE_LIMIT'] ?? 120),
  authTtl: Number(process.env['THROTTLE_AUTH_TTL'] ?? 60),
  authLimit: Number(process.env['THROTTLE_AUTH_LIMIT'] ?? 5),
}))

export const uploadConfig = registerAs('upload', () => ({
  root: process.env['UPLOAD_ROOT'] ?? '',
  maxSize: Number(process.env['UPLOAD_MAX_SIZE'] ?? 10485760),
  mimeWhitelist: (process.env['UPLOAD_MIME_WHITELIST'] ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
}))

export const logConfig = registerAs('log', () => ({
  level: process.env['LOG_LEVEL'] ?? 'info',
  deployEnv: process.env['LOG_DEPLOY_ENV'] ?? 'local',
}))

export const configurations = [
  appConfig,
  databaseConfig,
  authConfig,
  throttleConfig,
  uploadConfig,
  logConfig,
]
