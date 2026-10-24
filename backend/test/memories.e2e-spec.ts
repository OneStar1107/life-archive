/**
 * test/memories.e2e-spec.ts
 * ══════════════════════════════════════════════════════════════
 * 业务模块 CRUD e2e（02 号 T11 要求：另加一个业务模块 CRUD 用例）
 * ══════════════════════════════════════════════════════════════
 *
 * 覆盖记忆模块：建节点 → 查列表 → 查详情 → 改（含双时间戳）
 *             → 建关联 → 取图谱 → 取时间轴 → 删（软删）
 * 以及**越权访问防护**与**出参不泄漏内部字段**。
 */

import { INestApplication, ValidationPipe } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import request from 'supertest'
import { AppModule } from '../src/app.module'
import { ResponseInterceptor } from '../src/common/interceptors/response.interceptor'
import { AllExceptionFilter } from '../src/common/filters/all-exception.filter'
import { JwtAuthGuard } from '../src/common/guards/jwt-auth.guard'
import { PrismaService } from '../src/database/prisma.service'
import { ErrorCode } from '../src/common/constants/error-codes'

process.env['NODE_ENV'] = 'test'
process.env['JWT_SECRET'] ??= 'test_only_secret_key_at_least_32_chars_long_0000'
process.env['JWT_REFRESH_SECRET'] ??= 'test_only_refresh_key_at_least_32_chars_long_000'
process.env['ACCESS_TTL'] ??= '900'
process.env['REFRESH_TTL'] ??= '604800'
process.env['BCRYPT_COST'] ??= '4'
process.env['APP_ENTITY_NAME'] ??= '测试主体（仅本地测试）'
process.env['UPLOAD_ROOT'] ??= 'D:/lifearchive-test-uploads'
process.env['UPLOAD_MIME_WHITELIST'] ??= 'image/jpeg,image/png,image/webp'
process.env['LOG_LEVEL'] ??= 'silent'

interface Result<T> {
  code: number
  message: string
  data: T | null
  traceId: string
}

interface TokenPair {
  accessToken: string
  refreshToken: string
}

interface MemoryDto {
  id: string
  title: string
  tags: string[]
  pastSelfView: string | null
  presentSelfView: string | null
}

describe('记忆模块 (e2e)', () => {
  let app: INestApplication
  let prisma: PrismaService
  let http: ReturnType<typeof request>
  let token: string

  const PHONE_A = `135${String(Date.now()).slice(-8)}`
  const PHONE_B = `134${String(Date.now()).slice(-8)}`
  const PASSWORD = 'TestPass2026'

  let memoryId = ''
  let relationId = ''

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile()

    app = moduleRef.createNestApplication()
    app.useGlobalPipes(
      new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }),
    )
    app.useGlobalInterceptors(new ResponseInterceptor())
    app.useGlobalFilters(new AllExceptionFilter())
    // JwtAuthGuard 依赖 Reflector / JwtService / ConfigService / PrismaService，
    // 必须从容器解析，不能手工 new
    app.useGlobalGuards(app.get(JwtAuthGuard))
    await app.init()

    prisma = app.get(PrismaService)
    http = request(app.getHttpServer() as never)

    token = await registerAndLogin(PHONE_A)
  })

  afterAll(async () => {
    if (prisma) {
      await prisma.user.deleteMany({ where: { phone: { in: [PHONE_A, PHONE_B] } } })
      await prisma.$disconnect()
    }
    if (app) await app.close()
  })

  async function registerAndLogin(phone: string): Promise<string> {
    await http.post('/auth/register').send({ phone, password: PASSWORD }).expect(200)
    const res = await http.post('/auth/login').send({ phone, password: PASSWORD }).expect(200)
    return (res.body as Result<{ tokens: TokenPair }>).data!.tokens.accessToken
  }

  // ─────────────────────────────────────────────────────
  it('创建记忆节点', async () => {
    const res = await http
      .post('/memories')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: '夜跑',
        description: '跑完出了一身汗',
        tags: ['运动', '习惯'],
        people: ['老周'],
        weight: 70,
        colorToken: 'accent',
        icon: '🏃',
      })
      .expect(200)

    const body = res.body as Result<MemoryDto>
    expect(body.code).toBe(ErrorCode.SUCCESS)
    expect(body.data?.title).toBe('夜跑')
    expect(body.data?.tags).toEqual(['运动', '习惯'])
    memoryId = body.data!.id
  })

  it('标题为空时返回 10001', async () => {
    const res = await http
      .post('/memories')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: '' })
      .expect(400)
    expect((res.body as Result<null>).code).toBe(ErrorCode.PARAM_INVALID)
  })

  it('colorToken 传色值被拒（禁止硬编码颜色）', async () => {
    const res = await http
      .post('/memories')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: '测试', colorToken: '#FF0000' })
      .expect(400)
    expect((res.body as Result<null>).code).toBe(ErrorCode.PARAM_INVALID)
  })

  it('列出记忆节点', async () => {
    const res = await http
      .get('/memories?page=1&pageSize=10')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)

    const body = res.body as Result<{ list: MemoryDto[]; total: number }>
    expect(body.code).toBe(ErrorCode.SUCCESS)
    expect(body.data?.total).toBeGreaterThan(0)
    expect(body.data?.list.some((m) => m.id === memoryId)).toBe(true)
  })

  it('★ 出参不含内部字段（userId / deletedAt / passwordHash）', async () => {
    const res = await http
      .get(`/memories/${memoryId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200)

    const raw = JSON.stringify(res.body)
    expect(raw).not.toContain('deletedAt')
    expect(raw).not.toContain('passwordHash')
    expect(raw).not.toContain('userId')
  })

  it('更新双时间戳：当时的我 vs 现在的我', async () => {
    const res = await http
      .patch(`/memories/${memoryId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        pastSelfView: '去年完全不敢想跑步这件事',
        presentSelfView: '现在把它当成不用内耗的时间',
      })
      .expect(200)

    const body = res.body as Result<MemoryDto>
    expect(body.data?.pastSelfView).toContain('不敢想')
    expect(body.data?.presentSelfView).toContain('内耗')
  })

  it('时间轴能识别出视角转变', async () => {
    const res = await http
      .get('/memories/timeline')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)

    const body = res.body as Result<{ shiftedCount: number; entries: unknown[] }>
    expect(body.data?.shiftedCount).toBeGreaterThan(0)
  })

  it('建立第二个节点并连边', async () => {
    const res = await http
      .post('/memories')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: '学吉他', tags: ['兴趣'] })
      .expect(200)
    const otherId = (res.body as Result<MemoryDto>).data!.id

    const rel = await http
      .post('/memories/relations')
      .set('Authorization', `Bearer ${token}`)
      .send({
        sourceId: memoryId,
        targetId: otherId,
        kind: 'topical',
        strength: 40,
        note: '都是给自己留时间',
      })
      .expect(200)

    const relBody = rel.body as Result<{ id: string }>
    expect(relBody.code).toBe(ErrorCode.SUCCESS)
    relationId = relBody.data!.id
  })

  it('自环被拒（40012）', async () => {
    const res = await http
      .post('/memories/relations')
      .set('Authorization', `Bearer ${token}`)
      .send({ sourceId: memoryId, targetId: memoryId, kind: 'topical' })
      .expect(200)
    expect((res.body as Result<null>).code).toBe(ErrorCode.RELATION_SELF_LOOP)
  })

  it('重复建同一条关联被拒（40013）', async () => {
    const other = await http
      .post('/memories')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: '摄影' })
      .expect(200)
    const otherId = (other.body as Result<MemoryDto>).data!.id

    await http
      .post('/memories/relations')
      .set('Authorization', `Bearer ${token}`)
      .send({ sourceId: memoryId, targetId: otherId, kind: 'topical' })
      .expect(200)

    const dup = await http
      .post('/memories/relations')
      .set('Authorization', `Bearer ${token}`)
      .send({ sourceId: memoryId, targetId: otherId, kind: 'topical' })
      .expect(200)
    expect((dup.body as Result<null>).code).toBe(ErrorCode.RELATION_EXISTS)
  })

  it('图谱返回节点与边', async () => {
    const res = await http
      .get('/memories/graph')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)

    const body = res.body as Result<{ nodes: unknown[]; edges: unknown[] }>
    expect(body.data?.nodes.length).toBeGreaterThan(0)
    expect(body.data?.edges.length).toBeGreaterThan(0)

    // 边两端必须都在节点集合里（不能有悬空连线）
    const nodeIds = new Set(body.data!.nodes.map((n) => (n as { id: string }).id))
    for (const e of body.data!.edges) {
      const edge = e as { sourceId: string; targetId: string }
      expect(nodeIds.has(edge.sourceId)).toBe(true)
      expect(nodeIds.has(edge.targetId)).toBe(true)
    }
  })

  it('★ 越权访问他人数据返回 30003', async () => {
    const tokenB = await registerAndLogin(PHONE_B)

    const res = await http
      .get(`/memories/${memoryId}`)
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(200) // 业务失败仍是 200

    expect((res.body as Result<null>).code).toBe(ErrorCode.NOT_RESOURCE_OWNER)
  })

  it('删除他人数据同样被拒', async () => {
    const tokenB = await registerAndLogin(PHONE_B)
    await http.delete(`/memories/${memoryId}`).set('Authorization', `Bearer ${tokenB}`).expect(200)
    expect((await prisma.memory.findUnique({ where: { id: memoryId } }))?.deletedAt).toBeNull()
  })

  it('删除关联', async () => {
    await http
      .delete(`/memories/relations/${relationId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
  })

  it('软删除记忆节点后不可见', async () => {
    const created = await http
      .post('/memories')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: '待删除的节点' })
      .expect(200)
    const id = (created.body as Result<MemoryDto>).data!.id

    await http.delete(`/memories/${id}`).set('Authorization', `Bearer ${token}`).expect(200)

    // 软删除：库里 deletedAt 有值，但记录还在
    const row = await prisma.memory.findUnique({ where: { id } })
    expect(row).not.toBeNull()
    expect(row?.deletedAt).not.toBeNull()

    // 列表里查不到
    const res = await http
      .get(`/memories/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
    expect((res.body as Result<null>).code).toBe(ErrorCode.MEMORY_NOT_FOUND)
  })
})
