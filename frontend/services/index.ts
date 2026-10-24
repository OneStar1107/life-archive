// services/index.ts
// ══════════════════════════════════════════════════════════════
// service 层统一出口
// ══════════════════════════════════════════════════════════════
//
// 用法：
//   import { authService, memoriesService } from '@/services'
//   import type { Memory, PageResult } from '@/services'
//
// 也兼容深路径导入（stores/auth.ts 现在就是这么写的）：
//   import { authService } from '@/services/auth.service'
//
// 业务类型统一从 './types' 透出，页面层不必再往模块里钻。

export { authService } from './auth.service'
export { memoriesService } from './memories.service'
export { feelingsService } from './feelings.service'
export { healthService } from './health.service'
export { journeysService } from './journeys.service'
export { todosService } from './todos.service'
export { insightsService } from './insights.service'
export { profilesService } from './profiles.service'
export { usersService } from './users.service'
export { filesService } from './files.service'

// 网络层类型一并透出：PageResult<T> 在 service 返回值里到处都是，
// 页面层需要它来给 ref<T | null> 标注。
export type { PageResult, PageQuery, Result } from '@/core/http/types'

export type {
  // 枚举字面量
  MemorySource,
  RelationKind,
  Polarity,
  MetricType,
  TodoKind,
  TodoRepeat,
  TodoStatus,
  InsightKind,
  InsightFeedback,
  FilePurpose,
  SortOrder,
  // 认证
  AuthTokens,
  AuthUserBrief,
  AuthResult,
  TokenPairResult,
  MeResult,
  // 记忆
  Memory,
  MemoryRelation,
  GraphNode,
  GraphEdge,
  MemoryGraph,
  TimelineEntry,
  MemoryTimeline,
  // 感受
  Feeling,
  EmotionWord,
  RefineSuggestion,
  FeelingStat,
  // 健康
  HealthMetric,
  TrendPoint,
  Trend,
  HealthOverview,
  // 旅途
  Journey,
  MapPoint,
  TimelineSegment,
  // 待办
  Todo,
  TodoGroup,
  // 洞察
  Insight,
  InsightStats,
  // 资料
  QuietHoursItem,
  Profile,
  ProfileCompleteness,
  // 文件
  UploadedFileInfo,
  UploadedFileResult,
  // 账号
  UserProfile,
  ConsentResult,
  AccountExport,
  // 查询入参
  MemoryQuery,
  FeelingQuery,
  HealthQuery,
  JourneyQuery,
  TodoQuery,
  InsightQuery,
  FileQuery,
  RefineQuery,
  HealthOverviewQuery,
  HealthTrendQuery,
  DailyStatQuery,
  // 写入载荷
  CreateMemoryInput,
  UpdateMemoryInput,
  CreateRelationInput,
  CreateFeelingInput,
  UpdateFeelingInput,
  CreateHealthMetricInput,
  CreateJourneyInput,
  UpdateJourneyInput,
  CreateTodoInput,
  UpdateTodoInput,
  UpdateProfileInput,
  UpdateUserInput,
  ConsentInput,
  UploadFileInput,
} from './types'
