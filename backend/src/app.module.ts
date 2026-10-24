/**
 * app.module.ts
 * ══════════════════════════════════════════════════════════════
 * 人生档案 · 冰川记忆 —— 应用根模块
 * ══════════════════════════════════════════════════════════════
 *
 * 全局装配：配置校验 → 日志 → 限流 → 管道 → 拦截器 → 过滤器 → 守卫。
 * 全局件全部挂在 APP_GUARD / APP_INTERCEPTOR / APP_FILTER 上，
 * 业务模块不再重复声明，避免漏配。
 */

import { Module, ValidationPipe } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core'
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler'
import { LoggerModule } from 'nestjs-pino'

import { configurations } from './config/configuration'
import { assertProductionSafety, envValidationSchema } from './config/validation'
import { DatabaseModule } from './database/database.module'

import { JwtAuthGuard } from './common/guards/jwt-auth.guard'
import { ResponseInterceptor } from './common/interceptors/response.interceptor'
import { LoggingInterceptor } from './common/interceptors/logging.interceptor'
import { AllExceptionFilter } from './common/filters/all-exception.filter'
import { RedactService } from './common/services/redact.service'

import { AuthModule } from './modules/auth/auth.module'
import { UsersModule } from './modules/users/users.module'
import { ProfilesModule } from './modules/profiles/profiles.module'
import { FeelingsModule } from './modules/feelings/feelings.module'
import { MemoriesModule } from './modules/memories/memories.module'
import { HealthModule } from './modules/health/health.module'
import { JourneysModule } from './modules/journeys/journeys.module'
import { TodosModule } from './modules/todos/todos.module'
import { InsightsModule } from './modules/insights/insights.module'
import { FilesModule } from './modules/files/files.module'

/**
 * pino redact 配置（02 号 T8）。
 * ★ 日志中不允许出现任何明文 token / 密码。
 */
const pinoRedactPaths = [
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
  '*.password',
  '*.passwordHash',
  '*.password_hash',
  '*.token',
  '*.tokenHash',
  '*.token_hash',
  '*.accessToken',
  '*.refreshToken',
  '*.authorization',
  '*.secret',
  '*.jwtSecret',
  '*.apiKey',
  '*.idCard',
  '*.phone',
  '*.email',
  'body.password',
  'body.oldPassword',
  'body.newPassword',
  'body.refreshToken',
]

@Module({
  imports: [
    // ── 数据库：全局单例 PrismaService ──
    DatabaseModule,

    // ── 配置：启动即校验，缺失立刻退出 ──
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath: ['.env.local', '.env'],
      load: configurations,
      validationSchema: envValidationSchema,
      validationOptions: {
        // 校验失败时打印全部错误，而不是只报第一条
        abortEarly: false,
        allowUnknown: true,
      },
    }),

    // ── 限流 ──
    // ★ 全局只挂一个 `default` 限流（默认 60s / 120 次，本地开发 .env 放宽到 600）。
    //   此前的版本在数组里同时挂了 `auth`（20/60s），而 @nestjs/throttler 会把
    //   数组里**每一个** limiter 应用到**所有**路由——等于给全站所有接口套了
    //   一个 20 次/分钟的紧箍咒，页面随便切几次就整窗口 429（x-ratelimit-remaining
    //   还很大，但被 auth 这层先拦了，报 `retry-after-auth`）。
    //   登录/注册/刷新等敏感接口已在 auth.controller.ts 上用 `@Throttle` 单独设了
    //   更紧的阀值（login 5/60s、register 5/600s、refresh 20/60s），无需全局 auth。
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => [
        {
          name: 'default',
          ttl: (config.get<number>('throttle.ttl') ?? 60) * 1000,
          limit: config.get<number>('throttle.limit') ?? 120,
        },
      ],
    }),

    // ── 日志：结构化 + 脱敏 ──
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        return {
          pinoHttp: {
            level: config.get<string>('log.level') ?? 'info',
            // 健康探针不记访问日志，避免刷屏
            autoLogging: { ignore: (req: { url?: string }) => req.url === '/health/live' },
            redact: { paths: pinoRedactPaths, censor: '[REDACTED]' },
            customLogLevel: (_req: unknown, res: { statusCode: number }, err?: Error) => {
              if (err || res.statusCode >= 500) return 'error'
              if (res.statusCode >= 400) return 'warn'
              return 'info'
            },
            base: {
              service: 'lifearchive-backend',
              env: config.get<string>('log.deployEnv') ?? 'local',
              app: config.get<string>('app.bundleId') ?? 'com.lifearchive.app',
            },
          },
        }
      },
    }),

    // ── 业务模块 ──
    AuthModule,
    UsersModule,
    ProfilesModule,
    FeelingsModule,
    MemoriesModule,
    HealthModule,
    JourneysModule,
    TodosModule,
    InsightsModule,
    FilesModule,
  ],
  providers: [
    // 全局校验管道
    {
      provide: APP_PIPE,
      useFactory: () =>
        new ValidationPipe({
          // 自动把 DTO 转成实例，class-validator 才能工作
          transform: true,
          transformOptions: { enableImplicitConversion: false },
          // 剥离 DTO 未声明的字段，防止前端塞私货
          whitelist: true,
          forbidNonWhitelisted: true,
          // 校验失败抛 BadRequestException，由全局过滤器转成 10001
          validationError: { target: false, value: false },
        }),
    },

    // 全局守卫：限流 → 鉴权
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },

    // 全局拦截器：日志 → 统一包装
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
    { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },

    // 全局过滤器
    { provide: APP_FILTER, useClass: AllExceptionFilter },

    RedactService,
  ],
})
export class AppModule {
  constructor() {
    // 生产环境额外硬性检查（02 号禁止事项第 8 条）
    assertProductionSafety(process.env)
  }
}
