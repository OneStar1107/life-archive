/**
 * main.ts
 * ══════════════════════════════════════════════════════════════
 * 人生档案 · 冰川记忆 —— 启动引导
 * ══════════════════════════════════════════════════════════════
 *
 * 装配顺序：Swagger → CORS → Helmet → 静态文件 → 全局管道/过滤器/拦截器
 *          → 优雅停机钩子 → 监听端口
 */

import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import { ConfigService } from '@nestjs/config'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import { Logger } from '@nestjs/common'
import helmet from 'helmet'
import { json, urlencoded } from 'express'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

import { AppModule } from './app.module'
import { TokenService } from './modules/auth/token.service'

const logger = new Logger('Bootstrap')

/** 请求体大小上限：上传走 multipart，其余接口都很小 */
const BODY_LIMIT = '1mb'

async function bootstrap(): Promise<void> {
  // 1. 关闭 Nest 的启动横幅（我们自己打印，更可控）
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
    logger: ['error', 'warn', 'log'],
  })

  app.flushLogs()

  const config = app.get(ConfigService)
  const isProd = config.get<string>('app.nodeEnv') === 'production'
  const port = config.get<number>('app.port') ?? 3000
  const appName = config.get<string>('app.name') ?? '人生档案'
  const apiBaseUrl = config.get<string>('app.apiBaseUrl') ?? ''
  const corsOrigins = config.get<string[]>('app.corsOrigins') ?? []

  // ── 2. Helmet：安全响应头 ──
  // 注意：必须放开 crossOriginResourcePolicy，否则跨域读取图片/附件会被拦
  app.use(
    helmet({
      // 三端 App 走 WebView / 原生网络栈，不依赖同源策略
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      // 开发环境放开 HSTS（HSTS 会让本地 http 域名被强制 https）
      hsts: isProd ? { maxAge: 31536000, includeSubDomains: true } : false,
      // API 不返回 HTML，不需要 CSP
      contentSecurityPolicy: false,
    }),
  )

  // ── 3. 请求体解析 ──
  app.use(json({ limit: BODY_LIMIT }))
  app.use(urlencoded({ extended: true, limit: BODY_LIMIT }))

  // ── 4. CORS：只允许配置的白名单来源 ──
  app.enableCors({
    origin: (origin, callback) => {
      // 无 Origin（App 原生请求、curl、服务端调用）直接放行
      if (!origin) return callback(null, true)
      if (corsOrigins.length === 0 || corsOrigins.includes('*')) return callback(null, true)
      if (corsOrigins.includes(origin)) return callback(null, true)
      logger.warn(`拒绝跨域来源：${origin}`)
      return callback(new Error(`CORS 拒绝来源 ${origin}`), false)
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-App-Version',
      'X-Platform',
      'X-Request-Id',
      'X-Trace-Id',
      'X-Client-Channel',
      'X-Token-Version',
    ],
    exposedHeaders: ['X-Trace-Id', 'Retry-After'],
    maxAge: 86400,
  })

  // ── 5. 上传目录：确保存在（禁止设在项目目录内）──
  const uploadRoot = config.get<string>('upload.root') ?? ''
  if (uploadRoot) {
    try {
      mkdirSync(uploadRoot, { recursive: true })
      const projectRoot = resolve(__dirname, '..')
      if (resolve(uploadRoot).startsWith(projectRoot)) {
        throw new Error('UPLOAD_ROOT 不得设在项目目录内')
      }
    } catch (e) {
      logger.error(`上传目录不可用：${(e as Error).message}`)
      if (isProd) process.exit(1)
    }
  }

  // ── 6. Swagger ──
  if (!isProd) {
    const docConfig = new DocumentBuilder()
      .setTitle(`${appName} API`)
      .setDescription(
        [
          '═══════════════════════════════════════════',
          `${appName} · 后端 API 文档`,
          '═══════════════════════════════════════════',
          '',
          '## 响应约定',
          '所有接口返回统一结构 `Result<T>`：',
          '',
          '```json',
          '{',
          '  "code": 0,          // 业务码，0 为成功',
          '  "message": "操作成功", // 中文可展示文案',
          '  "data": {},         // 业务数据',
          '  "traceId": "uuid"   // 全链路追踪，同时在响应头 X-Trace-Id',
          '}',
          '```',
          '',
          '> **HTTP 200 只代表通信成功，业务成败一律看 `code`。**',
          '> 唯一例外是真正的鉴权失败（HTTP 401）。',
          '',
          '## 错误码分段',
          '| 段 | 含义 |',
          '|---|---|',
          '| 0 | 成功 |',
          '| 1xxxx | 参数 / 校验 |',
          '| 2xxxx | 认证 |',
          '| 3xxxx | 权限 |',
          '| 4xxxx | 资源 |',
          '| 5xxxx | 业务 |',
          '| 9xxxx | 系统 |',
          '',
          `前端 \`frontend/core/http/error-code.ts\` 与本服务同源，`,
          `由 \`node scripts/check-error-codes.mjs\` 在 CI 中强制校验。`,
        ].join('\n'),
      )
      .setVersion('1.0.0')
      .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'bearer')
      .addTag('认证', '注册 / 登录 / 刷新 / 登出')
      .addTag('账号', '资料 / 隐私同意 / 数据导出 / 注销')
      .addTag('资料', '「你」Tab：基本资料 / 性格 / 边界')
      .addTag('感受', '情绪记录与情绪粒度训练')
      .addTag('记忆', '记忆节点 / 图谱 / 时间轴双时间戳')
      .addTag('健康', '身体的信号，只记录不评价')
      .addTag('旅途', '去过的地方 / 常驻城市')
      .addTag('待办', '待办 · 时间与你')
      .addTag('洞察', '我是怎么一点点认识你的')
      .addTag('文件', '头像与图片上传')
      .addTag('健康检查', '容器探针')
      .build()

    const document = SwaggerModule.createDocument(app, docConfig)
    SwaggerModule.setup('docs', app, document, {
      swaggerOptions: { persistAuthorization: true, tagsSorter: 'alpha' },
      customSiteTitle: `${appName} API 文档`,
    })
    logger.log(`Swagger UI：${apiBaseUrl}/docs`)
  }

  // ── 7. 优雅停机 ──
  // 关闭时依次：停止收新请求 → 清理过期令牌 → 断开 Prisma
  app.enableShutdownHooks()

  process.on('SIGTERM', () => void onShutdown(app, 'SIGTERM'))
  process.on('SIGINT', () => void onShutdown(app, 'SIGINT'))

  // ── 8. 启动令牌清理定时任务（每 6 小时一次）──
  scheduleTokenPurge(app)

  // ── 9. 监听 ──
  await app.listen(port, '0.0.0.0')
  logger.log(`─────────────────────────────────────────`)
  logger.log(`  ${appName} 后端已启动`)
  logger.log(`  端口：${port}  环境：${config.get<string>('app.nodeEnv')}`)
  logger.log(`  接口前缀：${apiBaseUrl}`)
  logger.log(`  文档：${isProd ? '生产环境已关闭' : `http://localhost:${port}/docs`}`)
  logger.log(`─────────────────────────────────────────`)
}

/** 优雅停机 */
async function onShutdown(
  app: Awaited<ReturnType<typeof NestFactory.create>>,
  signal: string,
): Promise<void> {
  logger.log(`收到 ${signal}，开始优雅停机…`)
  try {
    // 先清理令牌表，再断连（此时 Prisma 仍可用）
    const tokens = app.get(TokenService)
    await tokens.purgeExpired()
  } catch (e) {
    logger.warn(`令牌清理失败（不影响停机）：${(e as Error).message}`)
  }
  try {
    await app.close()
    logger.log('已优雅停机')
    process.exit(0)
  } catch (e) {
    logger.error(`停机异常：${(e as Error).message}`)
    process.exit(1)
  }
}

/** 每 6 小时清理一次过期 / 长期吊销的令牌记录 */
function scheduleTokenPurge(app: Awaited<ReturnType<typeof NestFactory.create>>): void {
  const SIX_HOURS = 6 * 60 * 60 * 1000
  const timer = setInterval(() => {
    const tokens = app.get(TokenService)
    void tokens.purgeExpired().catch((e: unknown) => {
      logger.warn(`定时清理令牌失败：${(e as Error).message}`)
    })
  }, SIX_HOURS)
  // 不要因为这个定时器而阻止进程退出
  timer.unref()
}

bootstrap().catch((e: unknown) => {
  // 启动失败必须立即退出并打印原因，禁止带病运行
  const msg = e instanceof Error ? e.message : String(e)

  console.error(`\n✖ 启动失败：${msg}\n`)
  if (e instanceof Error && e.stack) {
    console.error(e.stack)
  }
  process.exit(1)
})
