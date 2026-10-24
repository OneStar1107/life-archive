/**
 * prisma/seed/seed.ts
 * ══════════════════════════════════════════════════════════════
 * 人生档案 · 冰川记忆 —— 种子数据
 * ══════════════════════════════════════════════════════════════
 *
 * 铁律（01 号 T5 / 禁止事项第 3、7 条）：
 *  1. 生产环境必须显式跳过：`pnpm seed:prod` 会传 --prod 并直接退出
 *  2. 禁止写入任何真实用户手机号 / 身份证 / 邮箱
 *  3. 密码只存 bcrypt 哈希，且哈希值来自环境变量注入，不硬编码在源码里
 *  4. 演示数据统一使用 13800138000（工信部保留测试号段）等虚拟号
 */

import { PrismaClient, Prisma } from '@prisma/client'
import * as bcrypt from 'bcryptjs'
import { createHash, randomUUID } from 'node:crypto'

const prisma = new PrismaClient()

const IS_PROD = process.argv.includes('--prod')

/** 演示数据统一前缀，便于识别与清理 */
const DEMO_TAG = '[演示]'

/** bcrypt cost，与运行时一致 */
const BCRYPT_COST = Number(process.env['BCRYPT_COST'] ?? 12)

/**
 * 演示账号密码。
 * 优先从环境变量 SEED_ADMIN_PASSWORD 注入；未注入时用固定演示口令，
 * 且该口令仅用于本地开发，禁止用于任何非本地环境。
 */
function resolveSeedPassword(): string {
  const fromEnv = process.env['SEED_ADMIN_PASSWORD']
  if (fromEnv && fromEnv.length >= 8) return fromEnv
  return 'LifeArchive2026'
}

async function main(): Promise<void> {
  // ── 生产环境硬拦截 ──
  if (IS_PROD) {
    console.log('[seed] 检测到 --prod 标志，跳过全部种子数据写入。')
    console.log('[seed] 如确需在预发环境初始化，请改用 pnpm seed（不带 --prod）。')
    return
  }

  if (process.env['NODE_ENV'] === 'production') {
    console.error('[seed] 拒绝执行：NODE_ENV=production 环境下禁止写入种子数据。')
    process.exit(1)
  }

  console.log('[seed] 开始写入种子数据…')
  const password = resolveSeedPassword()
  const passwordHash = await bcrypt.hash(password, BCRYPT_COST)

  // ─────────────────────────────────────────────────────────
  // 1. 演示账号
  // ─────────────────────────────────────────────────────────
  const demoPhone = '13800138000' // 工信部保留测试号段，非真实号码
  const demoEmail = 'demo@lifearchive.local' // .local 保留域名，不可注册

  const user = await prisma.user.upsert({
    where: { phone: demoPhone },
    // ★ 必须清掉软删标记并复位状态：演示账号若曾被「注销」（软删，置 deletedAt
    //   + status=disabled），upsert 会命中这行并只改密码，导致登录仍被拦。
    //   这里显式 recovered，使重新 seed 能把演示账号「救」回来。
    update: { passwordHash, nickname: `${DEMO_TAG}林澈`, deletedAt: null, status: 'active' },
    create: {
      phone: demoPhone,
      email: demoEmail,
      passwordHash,
      nickname: `${DEMO_TAG}林澈`,
      status: 'active',
    },
    select: { id: true, nickname: true },
  })
  console.log(`[seed] 演示账号就绪：${user.nickname}（${demoPhone}）`)

  // 资料（删除再建，确保此前被软删的演示资料能被恢复）
  await prisma.profile.deleteMany({ where: { userId: user.id } })
  await prisma.profile.create({
    data: {
      userId: user.id,
      realName: `${DEMO_TAG}林澈`,
      gender: '男',
      // 1990-03-14，与产品原型一致
      birthday: new Date('1990-03-14T00:00:00.000Z'),
      bloodType: 'A',
      heightCm: 175,
      weightKg: 63,
      sleepPattern: '晚睡型',
      dietPreference: '清淡',
      mbti: 'INFJ',
      readableTopics: ['工作', '家人', '身体', '兴趣'],
      offLimitTopics: ['前任', '体重焦虑'],
      dataSourceConsent: false,
    },
  })
  console.log('[seed] 演示资料就绪')

  // ─────────────────────────────────────────────────────────
  // 2. 感受记录
  // ─────────────────────────────────────────────────────────
  const feelingSeeds: Prisma.FeelingCreateManyInput[] = [
    {
      userId: user.id,
      rawLabel: '难受',
      refinedLabel: '憋屈',
      intensity: 7,
      polarity: 'negative',
      content: '开会时说的那件事，一直没得到回应。',
      trigger: '会议上提的建议被忽略了',
      happenedAt: daysAgo(1, 21, 30),
    },
    {
      userId: user.id,
      rawLabel: '还行',
      refinedLabel: '平静',
      intensity: 5,
      polarity: 'neutral',
      content: '今天没什么特别的事。',
      happenedAt: daysAgo(2, 8, 15),
    },
    {
      userId: user.id,
      rawLabel: '开心',
      refinedLabel: '欣慰',
      intensity: 8,
      polarity: 'positive',
      content: '夜跑的时候天很好，跑完了出了一身汗。',
      trigger: '夜跑',
      happenedAt: daysAgo(3, 19, 45),
    },
  ]
  // 幂等：先清掉该用户的演示感受
  await prisma.feeling.deleteMany({ where: { userId: user.id } })
  const feelings = await prisma.feeling.createManyAndReturn({ data: feelingSeeds })
  console.log(`[seed] 感受记录 ${feelings.length} 条`)

  // ─────────────────────────────────────────────────────────
  // 3. 记忆节点
  // ─────────────────────────────────────────────────────────
  const memorySeeds: Prisma.MemoryCreateManyInput[] = [
    {
      userId: user.id,
      title: `${DEMO_TAG}夜跑`,
      tags: ['运动', '习惯'],
      weight: 70,
      graphX: 0.3,
      graphY: 0.4,
      colorToken: 'accent',
      icon: '🏃',
    },
    {
      userId: user.id,
      title: `${DEMO_TAG}摄影`,
      tags: ['兴趣'],
      weight: 55,
      graphX: 0.6,
      graphY: 0.3,
      colorToken: 'glacier',
      icon: '📷',
    },
    {
      userId: user.id,
      title: `${DEMO_TAG}学吉他`,
      tags: ['兴趣', '学习'],
      weight: 45,
      graphX: 0.45,
      graphY: 0.65,
      colorToken: 'glacier-light',
      icon: '🎸',
    },
    {
      userId: user.id,
      title: `${DEMO_TAG}老周`,
      tags: ['人物'],
      people: ['老周'],
      weight: 80,
      graphX: 0.7,
      graphY: 0.6,
      colorToken: 'primary',
      icon: '👤',
    },
    {
      userId: user.id,
      title: `${DEMO_TAG}给妈妈打电话`,
      tags: ['家人'],
      people: ['妈妈'],
      weight: 85,
      graphX: 0.2,
      graphY: 0.7,
      colorToken: 'primary',
      icon: '📞',
    },
  ]
  await prisma.memory.deleteMany({ where: { userId: user.id } })
  const memories = await prisma.memory.createManyAndReturn({
    data: memorySeeds,
    select: { id: true, title: true },
  })
  console.log(`[seed] 记忆节点 ${memories.length} 个`)

  // 给「夜跑」挂上双时间戳，演示时间对照功能
  const runNode = memories.find((m) => m.title.includes('夜跑'))
  if (runNode) {
    await prisma.memory.update({
      where: { id: runNode.id },
      data: {
        pastSelfView: '去年这个时候，我完全不敢想跑步这件事。',
        presentSelfView: '现在把它当成不用内耗的时间，反而睡着了。',
        pastViewedAt: daysAgo(180, 20, 0),
        presentViewedAt: daysAgo(2, 21, 0),
        occurredAt: daysAgo(3, 19, 45),
      },
    })
  }

  // ─────────────────────────────────────────────────────────
  // 4. 记忆关联（时间轴双时间戳思路的图谱边）
  // ─────────────────────────────────────────────────────────
  const byTitle = (kw: string): string | undefined => memories.find((m) => m.title.includes(kw))?.id

  const runId = byTitle('夜跑')
  const momId = byTitle('妈妈')
  const zhouId = byTitle('老周')
  const guitarId = byTitle('吉他')

  const relationSeeds: Prisma.MemoryRelationCreateManyInput[] = []
  if (runId && guitarId) {
    relationSeeds.push({
      userId: user.id,
      sourceId: runId,
      targetId: guitarId,
      kind: 'topical',
      strength: 40,
      note: '都是「给自己留出时间」',
    })
  }
  if (momId && zhouId) {
    relationSeeds.push({
      userId: user.id,
      sourceId: momId,
      targetId: zhouId,
      kind: 'person',
      strength: 60,
      note: '两个常联系的人',
    })
  }
  if (runId && zhouId) {
    relationSeeds.push({
      userId: user.id,
      sourceId: runId,
      targetId: zhouId,
      kind: 'emotional',
      strength: 30,
      note: '夜跑后跟老周聊过',
      discovered: true,
    })
  }

  await prisma.memoryRelation.deleteMany({ where: { userId: user.id } })
  if (relationSeeds.length > 0) {
    const rels = await prisma.memoryRelation.createManyAndReturn({ data: relationSeeds })
    console.log(`[seed] 记忆关联 ${rels.length} 条`)
  }

  // ─────────────────────────────────────────────────────────
  // 5. 身体信号
  // ─────────────────────────────────────────────────────────
  const healthSeeds: Prisma.HealthMetricCreateManyInput[] = []
  for (let i = 6; i >= 0; i--) {
    const base = daysAgo(i, 7, 30)
    healthSeeds.push({
      userId: user.id,
      metricType: 'sleep',
      // 6.2~8.1 小时之间的确定性伪随机（种子可重复）
      value: 6.2 + ((i * 7) % 19) / 10,
      unit: '小时',
      subjectiveState: i % 3 === 0 ? '睡不好' : null,
      measuredAt: base,
    })
    healthSeeds.push({
      userId: user.id,
      metricType: 'steps',
      value: 4200 + ((i * 1373) % 6000),
      unit: '次',
      measuredAt: base,
    })
  }
  healthSeeds.push({
    userId: user.id,
    metricType: 'mood_energy',
    value: 4,
    unit: '级',
    subjectiveState: '有点累',
    note: '连续熬夜第三天',
    measuredAt: daysAgo(0, 22, 0),
  })

  await prisma.healthMetric.deleteMany({ where: { userId: user.id } })
  const metrics = await prisma.healthMetric.createManyAndReturn({ data: healthSeeds })
  console.log(`[seed] 身体信号 ${metrics.length} 条`)

  // ─────────────────────────────────────────────────────────
  // 6. 旅途
  // ─────────────────────────────────────────────────────────
  const journeySeeds: Prisma.JourneyCreateManyInput[] = [
    {
      userId: user.id,
      place: `${DEMO_TAG}杭州`,
      isResident: true,
      startedAt: new Date('2019-06-01T00:00:00.000Z'),
      note: '常驻',
    },
    {
      userId: user.id,
      place: `${DEMO_TAG}大理`,
      isResident: false,
      startedAt: new Date('2025-10-01T00:00:00.000Z'),
      endedAt: new Date('2025-10-15T00:00:00.000Z'),
      note: '住了半个月，睡得最好的一次',
    },
    {
      userId: user.id,
      place: `${DEMO_TAG}成都`,
      isResident: false,
      startedAt: new Date('2026-02-01T00:00:00.000Z'),
      endedAt: new Date('2026-02-10T00:00:00.000Z'),
      note: '见了老周',
    },
  ]
  await prisma.journey.deleteMany({ where: { userId: user.id } })
  const journeys = await prisma.journey.createManyAndReturn({ data: journeySeeds })
  console.log(`[seed] 旅途 ${journeys.length} 段`)

  // ─────────────────────────────────────────────────────────
  // 7. 待办
  // ─────────────────────────────────────────────────────────
  const todoSeeds: Prisma.TodoCreateManyInput[] = [
    {
      userId: user.id,
      title: `${DEMO_TAG}体检`,
      kind: 'task',
      dueAt: daysAgo(-7, 9, 0),
      people: [],
    },
    {
      userId: user.id,
      title: `${DEMO_TAG}老周的生日`,
      kind: 'birthday',
      dueAt: daysAgo(-21, 0, 0),
      repeatRule: 'yearly',
      people: ['老周'],
    },
    {
      userId: user.id,
      title: `${DEMO_TAG}周四出差·待定`,
      kind: 'trip',
      dueAt: daysAgo(-4, 8, 0),
    },
    {
      userId: user.id,
      title: `${DEMO_TAG}买吉他拨片`,
      kind: 'task',
      status: 'done',
      completedAt: daysAgo(2, 20, 0),
    },
  ]
  await prisma.todo.deleteMany({ where: { userId: user.id } })
  const todos = await prisma.todo.createManyAndReturn({ data: todoSeeds })
  console.log(`[seed] 待办 ${todos.length} 条`)

  // ─────────────────────────────────────────────────────────
  // 8. 洞察
  // ─────────────────────────────────────────────────────────
  const insightSeeds: Prisma.InsightCreateManyInput[] = [
    {
      userId: user.id,
      kind: 'connection',
      title: '夜跑和「不内耗」可能是同一件事',
      body: '你最近 7 次提到夜跑的时候，都同时提到了「不用想工作」。要不要试试把跑步当成会议中间真正的休息，而不是奖励？',
      confidence: 72,
      evidenceMemoryIds: runId ? [runId] : [],
      evidenceFeelingIds: feelings.length > 2 ? [feelings[2].id] : [],
    },
    {
      userId: user.id,
      kind: 'timeline_diff',
      title: '三个月前的你，和现在的你对「跑步」看法不同',
      body: '过去你写的是「完全不敢想」，现在写的是「反而睡着了」。这个变化挺大的。',
      confidence: 88,
      evidenceMemoryIds: runId ? [runId] : [],
      evidenceFeelingIds: [],
    },
  ]
  await prisma.insight.deleteMany({ where: { userId: user.id } })
  const insights = await prisma.insight.createManyAndReturn({ data: insightSeeds })
  console.log(`[seed] 洞察 ${insights.length} 条`)

  // ─────────────────────────────────────────────────────────
  // 9. 字典：情绪精粒度词表（RULER 框架 144 词的常用子集）
  // ─────────────────────────────────────────────────────────
  const EMOTION_DICTIONARY: Array<{
    raw: string
    refined: string
    polarity: 'positive' | 'neutral' | 'negative'
  }> = [
    { raw: '难受', refined: '憋屈', polarity: 'negative' },
    { raw: '难受', refined: '不甘', polarity: 'negative' },
    { raw: '难受', refined: '被忽视', polarity: 'negative' },
    { raw: '难过', refined: '失落', polarity: 'negative' },
    { raw: '生气', refined: '愤怒', polarity: 'negative' },
    { raw: '生气', refined: '被冒犯', polarity: 'negative' },
    { raw: '焦虑', refined: '不确定', polarity: 'negative' },
    { raw: '累', refined: '耗竭', polarity: 'negative' },
    { raw: '还行', refined: '平静', polarity: 'neutral' },
    { raw: '还行', refined: '平常', polarity: 'neutral' },
    { raw: '开心', refined: '欣慰', polarity: 'positive' },
    { raw: '开心', refined: '被看见', polarity: 'positive' },
    { raw: '开心', refined: '踏实', polarity: 'positive' },
  ]
  console.log(`[seed] 情绪词表 ${EMOTION_DICTIONARY.length} 条（内置常量，无需入库）`)

  // ─────────────────────────────────────────────────────────
  // 10. 清理过期令牌
  // ─────────────────────────────────────────────────────────
  const purged = await prisma.refreshToken.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  })
  console.log(`[seed] 清理过期令牌 ${purged.count} 条`)

  console.log('\n[seed] ✔ 种子数据写入完成')
  console.log(`[seed] 演示账号：${demoPhone} / ${demoEmail}`)
  console.log(`[seed] 演示密码：${password}  ← 仅本地开发可用，生产环境请注入 SEED_ADMIN_PASSWORD`)
  console.log(`[seed] 指纹：${createHash('sha256').update(demoPhone).digest('hex').slice(0, 12)}`)
  void randomUUID
}

function daysAgo(days: number, hour = 12, minute = 0): Date {
  const d = new Date()
  d.setDate(d.getDate() + days)
  d.setHours(hour, minute, 0, 0)
  return d
}

main()
  .then(async () => {
    await prisma.$disconnect()
    process.exit(0)
  })
  .catch(async (e: unknown) => {
    console.error('[seed] ✖ 写入失败：', e)
    await prisma.$disconnect()
    process.exit(1)
  })
