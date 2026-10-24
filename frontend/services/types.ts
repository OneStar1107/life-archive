// services/types.ts
// ══════════════════════════════════════════════════════════════
// 业务 DTO 类型（★ 与后端出参 DTO 逐字段对齐 ★）
// ══════════════════════════════════════════════════════════════
//
// 对照来源：
//   backend/src/modules/*/dto/*.dto.ts
//   backend/src/common/dto/result.dto.ts
//
// 铁律：
//   1. 字段名与后端**一字不差**，不做驼峰化、不做重命名。
//   2. 日期一律为 string（ISO 8601）——uts 不引入 Date 解析，避免端上差异。
//   3. 后端可空字段一律写成 `T | null`，不用 `?`：
//      出参里「没这个值」和「有这个键但值为 null」是两件事。
//   4. 本文件是业务类型的**唯一**声明处，其他 service 只 import type 复用。
//   5. Result<T> / PageResult<T> / PageQuery 等网络层类型不在这里重复声明，
//      一律从 '@/core/http/types' 导入。

// ══════════════════════════════════════════════════════════════
// 枚举字面量（与后端 const 数组一一对应）
// ══════════════════════════════════════════════════════════════

/** 记忆节点来源：手动 / 导入 / 洞察生成 */
export type MemorySource = 'manual' | 'import' | 'insight'

/** 记忆关联类型 */
export type RelationKind =
  | 'emotional'
  | 'causal'
  | 'temporal'
  | 'person'
  | 'location'
  | 'topical'

/** 情绪极性 */
export type Polarity = 'positive' | 'neutral' | 'negative'

/** 身体信号指标类型 */
export type MetricType =
  | 'sleep'
  | 'steps'
  | 'heart_rate'
  | 'duration'
  | 'mood_energy'
  | 'weight'

/** 待办类型 */
export type TodoKind = 'task' | 'birthday' | 'festival' | 'trip'

/** 待办重复规则 */
export type TodoRepeat = 'none' | 'yearly' | 'monthly' | 'weekly'

/** 待办状态 */
export type TodoStatus = 'pending' | 'done' | 'archived'

/** 洞察类型（与 schema.prisma 的 InsightKind 一一对应） */
export type InsightKind =
  | 'connection'
  | 'emotion_granularity'
  | 'belief_conflict'
  | 'timeline_diff'
  | 'self_distance'

/** 用户对洞察的反馈：喜欢 / 不喜欢 / 中性 */
export type InsightFeedback = 'like' | 'dislike' | 'none'

/** 文件用途 */
export type FilePurpose = 'avatar' | 'memory' | 'journey' | 'journal'

/** 排序方向 */
export type SortOrder = 'asc' | 'desc'

// ══════════════════════════════════════════════════════════════
// 认证 auth
// ══════════════════════════════════════════════════════════════

/** 令牌对 */
export type AuthTokens = {
  /** Access Token，15 分钟有效 */
  accessToken: string
  /** Refresh Token，7 天有效，每次刷新都会轮换 */
  refreshToken: string
  /** Access 剩余有效秒数 */
  accessExpiresIn: number
  /** Refresh 剩余有效秒数 */
  refreshExpiresIn: number
  /** 固定为 Bearer */
  tokenType: string
}

/** 用户概要 */
export type AuthUserBrief = {
  id: string
  nickname: string | null
  avatarUrl: string | null
}

/** 登录 / 注册出参 */
export type AuthResult = {
  tokens: AuthTokens
  user: AuthUserBrief
}

/** 刷新令牌出参 */
export type TokenPairResult = {
  tokens: AuthTokens
}

/** GET /auth/me 出参（手机号与邮箱已脱敏） */
export type MeResult = {
  id: string
  nickname: string | null
  avatarUrl: string | null
  /** 已脱敏，如 138****8000 */
  phone: string | null
  /** 已脱敏，如 a***@domain.com */
  email: string | null
  createdAt: string
}

// ══════════════════════════════════════════════════════════════
// 记忆 memories
// ══════════════════════════════════════════════════════════════

/** 记忆节点 */
export type Memory = {
  id: string
  title: string
  description: string | null
  tags: string[]
  people: string[]
  location: string | null
  /** 图谱横坐标 0~1 */
  graphX: number | null
  /** 图谱纵坐标 0~1 */
  graphY: number | null
  icon: string | null
  /** 颜色令牌名（指向 theme.json，不是色值） */
  colorToken: string | null
  /** 关联的感受 ID */
  feelingId: string | null
  /** 权重 0~100，决定图谱节点大小 */
  weight: number
  source: string
  /** ★ 当时的我怎么看 */
  pastSelfView: string | null
  /** ★ 现在的我怎么想 */
  presentSelfView: string | null
  /** 写下「当时的我」的时间 */
  pastViewedAt: string | null
  /** 写下「现在的我」的时间 */
  presentViewedAt: string | null
  /** 事件发生时间 */
  occurredAt: string
  createdAt: string
  updatedAt: string
}

/** 记忆之间的关联 */
export type MemoryRelation = {
  id: string
  sourceId: string
  targetId: string
  kind: string
  strength: number
  note: string | null
  /** 是否为系统自动发现 */
  discovered: boolean
  createdAt: string
}

/** 图谱节点 */
export type GraphNode = {
  id: string
  title: string
  icon: string | null
  colorToken: string | null
  weight: number
  graphX: number | null
  graphY: number | null
  /** 关联条数，决定节点大小 */
  degree: number
}

/** 图谱边 */
export type GraphEdge = {
  id: string
  sourceId: string
  targetId: string
  kind: string
  strength: number
}

/** 记忆图谱 */
export type MemoryGraph = {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

/** 时间轴上的一条（★ 双时间戳对照） */
export type TimelineEntry = {
  memoryId: string
  title: string
  icon: string | null
  colorToken: string | null
  occurredAt: string
  /** 当时的我怎么看 */
  pastSelfView: string | null
  /** 现在的我怎么想 */
  presentSelfView: string | null
  pastViewedAt: string | null
  presentViewedAt: string | null
  /** 是否已经发生过视角转变 */
  hasShift: boolean
}

/** 记忆时间轴 */
export type MemoryTimeline = {
  entries: TimelineEntry[]
  /** 发生视角转变的节点数 */
  shiftedCount: number
  earliest: string | null
  latest: string | null
}

// ══════════════════════════════════════════════════════════════
// 感受 feelings
// ══════════════════════════════════════════════════════════════

/** 一次感受记录 */
export type Feeling = {
  id: string
  /** 你原本的说法 */
  rawLabel: string
  /** 更精确的情绪词 */
  refinedLabel: string | null
  /** 强度 1~10 */
  intensity: number
  polarity: string
  content: string | null
  trigger: string | null
  source: string
  happenedAt: string
  createdAt: string
  updatedAt: string
}

/** 情绪词（粗粒度 → 精粒度） */
export type EmotionWord = {
  raw: string
  refined: string
  polarity: string
}

/** 情绪粒度建议 */
export type RefineSuggestion = {
  rawLabel: string
  /** 候选的更精确说法，按贴近度排序 */
  candidates: EmotionWord[]
}

/** 某天的感受统计 */
export type FeelingStat = {
  /** YYYY-MM-DD */
  date: string
  count: number
  dominantPolarity: string | null
  averageIntensity: number | null
  /** 当日情绪词分布 */
  words: EmotionWord[]
}

// ══════════════════════════════════════════════════════════════
// 健康 health
// ══════════════════════════════════════════════════════════════

/** 一次身体信号（只记录，不做绩效评价） */
export type HealthMetric = {
  id: string
  /** sleep / steps / heart_rate / duration / mood_energy / weight */
  metricType: string
  value: number
  /** 单位：小时 / 次 / bpm / 分钟 / 级 / kg */
  unit: string
  /** 主观状态，如「有点累」 */
  subjectiveState: string | null
  note: string | null
  source: string
  measuredAt: string
  createdAt: string
}

/** 趋势上的一个点 */
export type TrendPoint = {
  /** YYYY-MM-DD */
  date: string
  value: number
  subjectiveState: string | null
}

/** 单指标趋势 */
export type Trend = {
  metricType: string
  unit: string
  points: TrendPoint[]
  average: number | null
  min: number | null
  max: number | null
  /** ★ 纯陈述的自然语言描述，不含评价与建议 */
  narrative: string
}

/** 最近概览（★ 刻意不做「达标 / 未达标」判断） */
export type HealthOverview = {
  trends: Trend[]
  /** 数据连续记录天数 */
  streakDays: number
  summary: string
}

// ══════════════════════════════════════════════════════════════
// 旅途 journeys
// ══════════════════════════════════════════════════════════════

/** 一段旅途 / 一个常驻城市 */
export type Journey = {
  id: string
  place: string
  isResident: boolean
  latitude: number | null
  longitude: number | null
  coverUrl: string | null
  /** 起始日期 YYYY-MM-DD */
  startedAt: string | null
  /** 结束日期；常驻为 null */
  endedAt: string | null
  note: string | null
  /** 关联记忆节点 ID */
  memoryIds: string[]
  createdAt: string
  updatedAt: string
}

/** 地图点位（仅有经纬度的旅途） */
export type MapPoint = {
  id: string
  place: string
  latitude: number | null
  longitude: number | null
  isResident: boolean
  startedAt: string | null
  endedAt: string | null
  note: string | null
}

/** 旅途时间轴的一段 */
export type TimelineSegment = {
  id: string
  place: string
  isResident: boolean
  startedAt: string | null
  endedAt: string | null
  /** 停留天数 */
  days: number | null
  note: string | null
}

// ══════════════════════════════════════════════════════════════
// 待办 todos
// ══════════════════════════════════════════════════════════════

/** 待办：提醒事项 / 生日 / 节日 / 出行 */
export type Todo = {
  id: string
  title: string
  note: string | null
  /** task / birthday / festival / trip */
  kind: string
  /** pending / done / archived */
  status: string
  dueAt: string | null
  completedAt: string | null
  /** none / yearly / monthly / weekly */
  repeatRule: string
  people: string[]
  createdAt: string
  updatedAt: string
}

/** 首页「今天」分组 */
export type TodoGroup = {
  /** 今天 */
  today: Todo[]
  /** 未来 7 天 */
  upcoming: Todo[]
  /** 已逾期未完成 */
  overdue: Todo[]
  /** 最近完成 */
  completed: Todo[]
}

// ══════════════════════════════════════════════════════════════
// 洞察 insights
// ══════════════════════════════════════════════════════════════

/** 洞察：系统对用户的观察，不是命令 */
export type Insight = {
  id: string
  /** connection / emotion_granularity / belief_conflict / timeline_diff / self_distance */
  kind: string
  title: string
  body: string
  /** 系统置信度 0~100，不是对用户的评价 */
  confidence: number
  /** 依据的记忆节点 ID */
  evidenceMemoryIds: string[]
  /** 依据的感受 ID */
  evidenceFeelingIds: string[]
  /** 已读时间，null 表示未读 */
  readAt: string | null
  /** 采纳时间，null 表示未采纳 */
  adoptedAt: string | null
  /** like / dislike / none，null 表示还没反馈过 */
  feedback: string | null
  createdAt: string
  updatedAt: string
}

/** 洞察统计（byKind 始终包含全部五种类型，未产生的记 0） */
export type InsightStats = {
  total: number
  unread: number
  adopted: number
  byKind: Record<string, number>
}

// ══════════════════════════════════════════════════════════════
// 资料 profiles
// ══════════════════════════════════════════════════════════════

/** 免打扰时段：允许跨零点书写，如 22:00 → 08:00 */
export type QuietHoursItem = {
  /** HH:mm */
  start: string
  /** HH:mm */
  end: string
}

/** 「你」Tab 的资料 */
export type Profile = {
  id: string
  realName: string | null
  gender: string | null
  /** 生日 YYYY-MM-DD */
  birthday: string | null
  bloodType: string | null
  heightCm: number | null
  weightKg: number | null
  /** 早睡型 / 晚睡型 / 随机型 */
  sleepPattern: string | null
  dietPreference: string | null
  /** 由用户自填，允许留空 */
  mbti: string | null
  /** 读得懂这些 */
  readableTopics: string[]
  /** ★ 不碰这些 */
  offLimitTopics: string[]
  /** null 表示未设置 */
  quietHours: QuietHoursItem[] | null
  /** 未开启时禁止任何数据源导入 */
  dataSourceConsent: boolean
  createdAt: string
  updatedAt: string
}

/** 资料完整度：驱动「你」Tab 的引导式补齐 */
export type ProfileCompleteness = {
  completed: number
  total: number
  /** 完成百分比 0~100 */
  percent: number
  /** 缺失项的中文名，直接用于前端提示 */
  missing: string[]
}

// ══════════════════════════════════════════════════════════════
// 文件 files
// ══════════════════════════════════════════════════════════════

/** 已上传文件（★ 出参不含 storageKey 与 checksum） */
export type UploadedFileInfo = {
  id: string
  /** 可直接访问的完整 URL */
  url: string
  /** 用户上传时的原始文件名，仅用于展示 */
  originalName: string
  mimeType: string
  /** 字节数 */
  size: number
  /** avatar / memory / journey / journal */
  purpose: string
  createdAt: string
}

/** 上传出参 */
export type UploadedFileResult = {
  file: UploadedFileInfo
  /** ★ 是否命中秒传：内容 checksum 与已有文件相同，未重复落盘 */
  deduplicated: boolean
}

// ══════════════════════════════════════════════════════════════
// 账号 users
// ══════════════════════════════════════════════════════════════

/** 我的账号资料（手机号与邮箱永远脱敏） */
export type UserProfile = {
  id: string
  nickname: string | null
  avatarUrl: string | null
  phone: string | null
  email: string | null
  createdAt: string
}

/** 授权同意回执 */
export type ConsentResult = {
  /** 隐私政策同意时间（ISO 8601） */
  privacyPolicyAcceptedAt: string
}

/** 数据导出（《个人信息保护法》的数据可携带权） */
export type AccountExport = {
  exportedAt: string
  user: UserProfile
  /** 各数据表的记录条数，键为业务名（feelings / memories / …） */
  counts: Record<string, number>
  /** 预留为 null，接入离线打包后填充 */
  downloadUrl: string | null
}

// ══════════════════════════════════════════════════════════════
// 列表查询入参
// ══════════════════════════════════════════════════════════════

/** 记忆列表查询 */
export type MemoryQuery = {
  page: number
  pageSize: number
  /** 标题 / 描述模糊搜索 */
  keyword?: string
  /** 按标签过滤 */
  tags?: string[]
  /** 按人物过滤 */
  person?: string
  /** 只看有过视角转变的节点 */
  hasTimeline?: boolean
  sortBy?: 'occurredAt' | 'createdAt' | 'weight' | 'title'
  sortOrder?: SortOrder
}

/** 感受列表查询 */
export type FeelingQuery = {
  page: number
  pageSize: number
  polarity?: Polarity
  /** 按情绪词模糊搜索 */
  keyword?: string
  /** ISO 日期，含当天 */
  from?: string
  /** ISO 日期，含当天 */
  to?: string
}

/** 身体信号列表查询 */
export type HealthQuery = {
  page: number
  pageSize: number
  metricType?: MetricType
  /** YYYY-MM-DD，含当天 */
  from?: string
  /** YYYY-MM-DD，含当天 */
  to?: string
}

/** 旅途列表查询 */
export type JourneyQuery = {
  page: number
  pageSize: number
  /** 只看常驻 */
  isResident?: boolean
}

/** 待办列表查询 */
export type TodoQuery = {
  page: number
  pageSize: number
  status?: TodoStatus
  kind?: TodoKind
  /** 只看某个人的相关项 */
  person?: string
}

/** 洞察列表查询 */
export type InsightQuery = {
  page: number
  pageSize: number
  kind?: InsightKind
  /** 只看未读的（首页红点用） */
  unreadOnly?: boolean
  feedback?: InsightFeedback
}

/** 文件列表查询 */
export type FileQuery = {
  page: number
  pageSize: number
  purpose?: FilePurpose
}

// ══════════════════════════════════════════════════════════════
// 写入载荷（POST / PATCH 的 body）
// ══════════════════════════════════════════════════════════════

/** 新建记忆 */
export type CreateMemoryInput = {
  title: string
  description?: string
  tags?: string[]
  people?: string[]
  location?: string
  graphX?: number
  graphY?: number
  icon?: string
  /** 只能是令牌名，不能是色值 */
  colorToken?: string
  feelingId?: string
  weight?: number
  /** 默认现在 */
  occurredAt?: string
}

/** 更新记忆：只更新显式传入的字段 */
export type UpdateMemoryInput = {
  title?: string
  description?: string
  tags?: string[]
  people?: string[]
  location?: string
  graphX?: number
  graphY?: number
  icon?: string
  colorToken?: string
  feelingId?: string
  weight?: number
  occurredAt?: string
  /** ★ 当时的我怎么看 */
  pastSelfView?: string
  /** ★ 现在的我怎么想 */
  presentSelfView?: string
}

/** 建立记忆关联 */
export type CreateRelationInput = {
  sourceId: string
  targetId: string
  kind: RelationKind
  strength?: number
  note?: string
}

/** 记录一次感受 */
export type CreateFeelingInput = {
  /** 你的原话，如「难受」 */
  rawLabel: string
  refinedLabel?: string
  intensity?: number
  polarity?: Polarity
  content?: string
  trigger?: string
  /** 默认现在，支持补记过去 */
  happenedAt?: string
}

/** 更新感受 */
export type UpdateFeelingInput = {
  refinedLabel?: string
  intensity?: number
  polarity?: Polarity
  content?: string
  trigger?: string
  happenedAt?: string
}

/** 记录一次身体信号 */
export type CreateHealthMetricInput = {
  metricType: MetricType
  value: number
  unit: string
  subjectiveState?: string
  note?: string
  /** 默认现在 */
  measuredAt?: string
}

/** 新增一段旅途 */
export type CreateJourneyInput = {
  place: string
  isResident?: boolean
  latitude?: number
  longitude?: number
  coverUrl?: string
  /** YYYY-MM-DD */
  startedAt?: string
  /** YYYY-MM-DD；常驻不填 */
  endedAt?: string
  note?: string
  memoryIds?: string[]
}

/** 更新旅途：常驻城市会被后端强制清空结束时间 */
export type UpdateJourneyInput = {
  place?: string
  isResident?: boolean
  latitude?: number
  longitude?: number
  coverUrl?: string
  startedAt?: string
  endedAt?: string
  note?: string
  memoryIds?: string[]
}

/** 新建待办 */
export type CreateTodoInput = {
  title: string
  note?: string
  kind?: TodoKind
  dueAt?: string
  repeatRule?: TodoRepeat
  people?: string[]
}

/** 更新待办 */
export type UpdateTodoInput = {
  title?: string
  note?: string
  kind?: TodoKind
  status?: TodoStatus
  dueAt?: string
  repeatRule?: TodoRepeat
  people?: string[]
}

/**
 * 更新资料。
 * ★ 全部字段可选：不传表示保留原值，显式传 null 表示清空。
 */
export type UpdateProfileInput = {
  realName?: string | null
  gender?: string | null
  /** YYYY-MM-DD */
  birthday?: string | null
  bloodType?: string | null
  heightCm?: number | null
  weightKg?: number | null
  sleepPattern?: string | null
  dietPreference?: string | null
  mbti?: string | null
  readableTopics?: string[]
  offLimitTopics?: string[]
  /** 传 null 或 [] 表示取消免打扰 */
  quietHours?: QuietHoursItem[] | null
  dataSourceConsent?: boolean
}

/** 更新我的账号资料 */
export type UpdateUserInput = {
  nickname?: string
  /** 先上传文件再回填完整 URL */
  avatarUrl?: string
}

/** 提交授权同意 */
export type ConsentInput = {
  /** 必须为 true，否则返回 30006 */
  privacyPolicyAccepted: boolean
  /** 是否同意把本应用数据用于生成洞察 */
  dataSourceConsent?: boolean
}

/** 上传文件入参 */
export type UploadFileInput = {
  /** 本地文件路径（uni.chooseImage / chooseFile 产出） */
  filePath: string
  /** 用途，缺省按后端默认的 memory 处理 */
  purpose?: FilePurpose
}

/** 情绪粒度建议的 query */
export type RefineQuery = {
  /** 用户的原话，必填 */
  rawLabel: string
  polarity?: Polarity
}

/** 身体信号概览的 query */
export type HealthOverviewQuery = {
  /** 统计天数，后端默认 7 */
  days?: number
}

/** 单指标趋势的 query */
export type HealthTrendQuery = {
  metricType: MetricType
  /** 后端默认 30 */
  days?: number
}

/** 某天感受统计的 query */
export type DailyStatQuery = {
  /** YYYY-MM-DD，后端默认今天 */
  date?: string
}
