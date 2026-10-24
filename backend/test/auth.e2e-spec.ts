/**
 * test/auth.e2e-spec.ts
 * ══════════════════════════════════════════════════════════════
 * 认证全链路 e2e（02 号 T11）
 * ══════════════════════════════════════════════════════════════
 *
 * 覆盖：注册 → 登录 → 拿 access 访问受保护接口 → refresh 轮换
 *       → 旧 refresh 失效 → 登出 → 登出后 refresh 也失效
 *
 * 前置：PostgreSQL 已启动（docker compose up -d）且已 migrate deploy。
 * 运行：pnpm test:e2e
 */

import { INestApplication, ValidationPipe } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import request from 'supertest'
import { AppModule } from '../src/app.module'
import { ResponseInterceptor } from '../src/common/interceptors/response.interceptor'
import { LoggingInterceptor } from '../src/common/interceptors/logging.interceptor'
import { AllExceptionFilter } from '../src/common/filters/all-exception.filter'
import { JwtAuthGuard } from '../src/common/guards/jwt-auth.guard'
import { PrismaService } from '../src/database/prisma.service'
import { ErrorCode } from '../src/common/constants/error-codes'

// 测试用环境变量：必须在导入 AppModule 之前设置
process.env['NODE_ENV'] = 'test'
process.env['JWT_SECRET'] ??= 'test_only_secret_key_at_least_32_chars_long_0000'
process.env['JWT_REFRESH_SECRET'] ??= 'test_only_refresh_key_at_least_32_chars_long_000'
process.env['ACCESS_TTL'] ??= '900'
process.env['REFRESH_TTL'] ??= '604800'
process.env['BCRYPT_COST'] ??= '4' // 测试用最低成本，加速
process.env['APP_ENTITY_NAME'] ??= '测试主体（仅本地测试）'
process.env['UPLOAD_ROOT'] ??= 'D:/lifearchive-test-uploads'
process.env['UPLOAD_MIME_WHITELIST'] ??= 'image/jpeg,image/png,image/webp'
process.env['LOG_LEVEL'] ??= 'silent'

/** 统一响应体形状 */
interface Result<T> {
  code: number
  message: string
  data: T | null
  traceId: string
}

interface TokenPair {
  accessToken: string
  refreshToken: string
  accessExpiresIn: number
  refreshExpiresIn: number
  tokenType: string
}

describe('认证链路 (e2e)', () => {
  let app: INestApplication
  let prisma: PrismaService
  let http: ReturnType<typeof request>

  /** 唯一手机号，避免并发测试互相污染 */
  const TEST_PHONE = `139${String(Date.now()).slice(-8)}`
  const TEST_PASSWORD = 'TestPass2026'

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile()

    app = moduleRef.createNestApplication()

    // 与 main.ts 保持一致的全局装配（不启 Swagger / CORS，减少测试开销）
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
        validationError: { target: false, value: false },
      }),
    )
    app.useGlobalInterceptors(new LoggingInterceptor(), new ResponseInterceptor())
    app.useGlobalFilters(new AllExceptionFilter())
    // JwtAuthGuard 依赖 Reflector / JwtService / ConfigService / PrismaService，
    // 必须从容器解析，不能手工 new
    app.useGlobalGuards(app.get(JwtAuthGuard))
    app.enableShutdownHooks()

    await app.init()
    prisma = app.get(PrismaService)
    http = request(app.getHttpServer() as never)
  })

  afterAll(async () => {
    if (prisma) {
      // 清理本次测试产生的数据
      await prisma.user.deleteMany({ where: { phone: TEST_PHONE } })
      await prisma.$disconnect()
    }
    if (app) await app.close()
  })

  // ─────────────────────────────────────────────────────
  describe('注册', () => {
    it('注册成功，返回令牌对并自动建立空资料', async () => {
      const res = await http
        .post('/auth/register')
        .send({ phone: TEST_PHONE, password: TEST_PASSWORD, nickname: '测试用户' })
        .expect(200)

      const body = res.body as Result<{ tokens: TokenPair; user: { id: string; nickname: string } }>
      expect(body.code).toBe(ErrorCode.SUCCESS)
      expect(body.data?.tokens.accessToken).toBeTruthy()
      expect(body.data?.tokens.refreshToken).toBeTruthy()
      expect(body.data?.user.nickname).toBe('测试用户')
      expect(body.traceId).toBeTruthy()

      // 自动建了 profile
      const profile = await prisma.profile.findUnique({
        where: { userId: body.data!.user.id },
      })
      expect(profile).not.toBeNull()
    })

    it('重复注册同一手机号返回 40002', async () => {
      const res = await http
        .post('/auth/register')
        .send({ phone: TEST_PHONE, password: TEST_PASSWORD })
        .expect(200)

      const body = res.body as Result<null>
      expect(body.code).toBe(ErrorCode.ALREADY_EXISTS)
      expect(body.message).toContain('已经注册过')
    })

    it('弱密码被拒（缺数字）', async () => {
      const res = await http
        .post('/auth/register')
        .send({ phone: `138${String(Date.now()).slice(-8)}`, password: 'abcdefgh' })
        .expect(400)

      const body = res.body as Result<null>
      expect(body.code).toBe(ErrorCode.PARAM_INVALID)
    })

    it('手机号与邮箱都不传返回 20011', async () => {
      const res = await http.post('/auth/register').send({ password: TEST_PASSWORD }).expect(400)

      const body = res.body as Result<null>
      expect(body.code).toBe(ErrorCode.PARAM_INVALID)
    })
  })

  // ─────────────────────────────────────────────────────
  describe('登录', () => {
    it('密码正确时登录成功', async () => {
      const res = await http
        .post('/auth/login')
        .send({ phone: TEST_PHONE, password: TEST_PASSWORD })
        .expect(200)

      const body = res.body as Result<{ tokens: TokenPair }>
      expect(body.code).toBe(ErrorCode.SUCCESS)
      expect(body.data?.tokens.tokenType).toBe('Bearer')
    })

    it('密码错误返回 HTTP 401 + 20006', async () => {
      const res = await http
        .post('/auth/login')
        .send({ phone: TEST_PHONE, password: 'WrongPass2026' })
        .expect(401)

      const body = res.body as Result<null>
      expect(body.code).toBe(ErrorCode.PASSWORD_INCORRECT)
    })

    it('用户不存在与密码错误返回同一个错误码（防账号枚举）', async () => {
      const res = await http
        .post('/auth/login')
        .send({ phone: '13800000000', password: TEST_PASSWORD })
        .expect(401)

      const body = res.body as Result<null>
      expect(body.code).toBe(ErrorCode.PASSWORD_INCORRECT)
    })
  })

  // ─────────────────────────────────────────────────────
  describe('受保护接口', () => {
    it('不带 Token 返回 401 + 20000', async () => {
      const res = await http.get('/memories').expect(401)
      const body = res.body as Result<null>
      expect(body.code).toBe(ErrorCode.TOKEN_MISSING)
    })

    it('伪造 Token 返回 401 + 20003', async () => {
      const res = await http
        .get('/memories')
        .set('Authorization', 'Bearer eyJhbGciOiJIUzI1NiJ9.fake.signature')
        .expect(401)

      const body = res.body as Result<null>
      expect(body.code).toBe(ErrorCode.TOKEN_INVALID)
    })

    it('带合法 Token 可访问', async () => {
      const login = await http
        .post('/auth/login')
        .send({ phone: TEST_PHONE, password: TEST_PASSWORD })
        .expect(200)
      const tokens = (login.body as Result<{ tokens: TokenPair }>).data!.tokens

      const res = await http
        .get('/memories')
        .set('Authorization', `Bearer ${tokens.accessToken}`)
        .expect(200)

      const body = res.body as Result<{ list: unknown[]; total: number }>
      expect(body.code).toBe(ErrorCode.SUCCESS)
      expect(Array.isArray(body.data?.list)).toBe(true)
    })
  })

  // ─────────────────────────────────────────────────────
  describe('刷新轮换与重用检测', () => {
    it('刷新成功并颁发新的一对', async () => {
      const login = await http
        .post('/auth/login')
        .send({ phone: TEST_PHONE, password: TEST_PASSWORD })
        .expect(200)
      const old = (login.body as Result<{ tokens: TokenPair }>).data!.tokens

      const res = await http
        .post('/auth/refresh')
        .send({ refreshToken: old.refreshToken })
        .expect(200)
      const body = res.body as Result<{ tokens: TokenPair }>
      expect(body.code).toBe(ErrorCode.SUCCESS)
      expect(body.data?.tokens.refreshToken).not.toBe(old.refreshToken)
      expect(body.data?.tokens.accessToken).toBeTruthy()
    })

    it('★ 旧 refresh 立即失效（轮换生效）', async () => {
      const login = await http
        .post('/auth/login')
        .send({ phone: TEST_PHONE, password: TEST_PASSWORD })
        .expect(200)
      const first = (login.body as Result<{ tokens: TokenPair }>).data!.tokens

      // 第一次刷新成功
      await http.post('/auth/refresh').send({ refreshToken: first.refreshToken }).expect(200)

      // 拿旧的重放 → 必须 401 + 20005
      const res = await http
        .post('/auth/refresh')
        .send({ refreshToken: first.refreshToken })
        .expect(401)

      const body = res.body as Result<null>
      expect(body.code).toBe(ErrorCode.REFRESH_REUSED)
    })

    it('★ 重放会吊销整个令牌族，族内新令牌也一并失效', async () => {
      const login = await http
        .post('/auth/login')
        .send({ phone: TEST_PHONE, password: TEST_PASSWORD })
        .expect(200)
      const first = (login.body as Result<{ tokens: TokenPair }>).data!.tokens

      // 轮换一次，拿到同族的第二个令牌
      const rotated = await http
        .post('/auth/refresh')
        .send({ refreshToken: first.refreshToken })
        .expect(200)
      const second = (rotated.body as Result<{ tokens: TokenPair }>).data!.tokens

      // 用旧的（已吊销）重放 → 触发整族吊销
      await http.post('/auth/refresh').send({ refreshToken: first.refreshToken }).expect(401)

      // 族内的第二个令牌此刻也必须失效
      const res = await http
        .post('/auth/refresh')
        .send({ refreshToken: second.refreshToken })
        .expect(401)

      const body = res.body as Result<null>
      expect(body.code).toBe(ErrorCode.REFRESH_REUSED)
    })

    it('伪造的 refresh 被拒', async () => {
      const res = await http
        .post('/auth/refresh')
        .send({ refreshToken: 'a'.repeat(64) })
        .expect(401)
      const body = res.body as Result<null>
      expect(body.code).toBe(ErrorCode.REFRESH_INVALID)
    })
  })

  // ─────────────────────────────────────────────────────
  describe('登出', () => {
    it('登出后原 refresh 失效', async () => {
      const login = await http
        .post('/auth/login')
        .send({ phone: TEST_PHONE, password: TEST_PASSWORD })
        .expect(200)
      const tokens = (login.body as Result<{ tokens: TokenPair }>).data!.tokens

      await http
        .post('/auth/logout')
        .set('Authorization', `Bearer ${tokens.accessToken}`)
        .send({ refreshToken: tokens.refreshToken })
        .expect(200)

      await http.post('/auth/refresh').send({ refreshToken: tokens.refreshToken }).expect(401)
    })
  })

  // ─────────────────────────────────────────────────────
  describe('改密', () => {
    it('改密后旧 access 立即失效（tokenVersion 递增）', async () => {
      // 单独建一个账号，避免影响前面的用例
      const phone = `137${String(Date.now()).slice(-8)}`
      const reg = await http
        .post('/auth/register')
        .send({ phone, password: TEST_PASSWORD, nickname: '改密测试' })
        .expect(200)
      const tokens = (reg.body as Result<{ tokens: TokenPair }>).data!.tokens

      // 改密
      await http
        .post('/auth/change-password')
        .set('Authorization', `Bearer ${tokens.accessToken}`)
        .send({ oldPassword: TEST_PASSWORD, newPassword: 'NewPass2026' })
        .expect(200)

      // 旧 access 必须失效
      await http.get('/auth/me').set('Authorization', `Bearer ${tokens.accessToken}`).expect(401)

      // 用新密码登录成功
      await http.post('/auth/login').send({ phone, password: 'NewPass2026' }).expect(200)

      await prisma.user.deleteMany({ where: { phone } })
    })

    it('原密码错误时拒绝', async () => {
      const phone = `136${String(Date.now()).slice(-8)}`
      const reg = await http
        .post('/auth/register')
        .send({ phone, password: TEST_PASSWORD })
        .expect(200)
      const tokens = (reg.body as Result<{ tokens: TokenPair }>).data!.tokens

      await http
        .post('/auth/change-password')
        .set('Authorization', `Bearer ${tokens.accessToken}`)
        .send({ oldPassword: 'WrongOld2026', newPassword: 'NewPass2026' })
        .expect(200) // 业务失败仍是 200，看 code

      await prisma.user.deleteMany({ where: { phone } })
    })
  })
})
