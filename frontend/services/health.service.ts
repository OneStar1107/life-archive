// services/health.service.ts
// ══════════════════════════════════════════════════════════════
// 身体信号：只记录，不做绩效评价
// ══════════════════════════════════════════════════════════════
//
// 对应 backend/src/modules/health/health.controller.ts
// ★ 注意路由前缀是 'health/metrics'，不是 'health' ★
//
// 路由核对清单：
//   GET    /health/metrics         列表
//   GET    /health/metrics/overview 最近概览（days 可选，默认 7）★ GET 带 query
//   GET    /health/metrics/trend   单指标趋势（metricType 必填，days 默认 30）★ GET 带 query
//   GET    /health/metrics/:id     详情
//   POST   /health/metrics         记录一次
//   DELETE /health/metrics/:id     删除（软删除）
//
// 本模块没有 PATCH：身体信号是「append-only」的观测记录，改了等于没记。
// 记错了就删掉重记。

import { del, get, post } from '@/core/http/request'
import type { PageResult } from '@/core/http/types'
import type {
  CreateHealthMetricInput,
  HealthMetric,
  HealthOverview,
  HealthOverviewQuery,
  HealthQuery,
  HealthTrendQuery,
  Trend,
} from './types'

export const healthService = {
  /** 列表。支持指标类型与日期区间过滤 */
  list(query: HealthQuery): Promise<PageResult<HealthMetric>> {
    return get<PageResult<HealthMetric>>('/health/metrics', query)
  },

  /** 详情 */
  detail(id: string): Promise<HealthMetric> {
    return get<HealthMetric>(`/health/metrics/${id}`)
  },

  /** 记录一次身体信号。value 不能为负，unit 由端上按 metricType 带默认值 */
  create(data: CreateHealthMetricInput): Promise<HealthMetric> {
    return post<HealthMetric>('/health/metrics', data)
  },

  /** 删除身体信号（软删除） */
  remove(id: string): Promise<{ success: boolean }> {
    return del<{ success: boolean }>(`/health/metrics/${id}`)
  },

  /**
   * 最近概览。
   * ★ 刻意不做「达标 / 未达标」判断，端上文案也不要自己加评价。
   */
  overview(query?: HealthOverviewQuery): Promise<HealthOverview> {
    return get<HealthOverview>('/health/metrics/overview', query)
  },

  /**
   * 单指标趋势。
   * ★ narrative 是纯陈述的自然语言描述，可直接展示，但不要改写成建议。
   */
  trend(query: HealthTrendQuery): Promise<Trend> {
    return get<Trend>('/health/metrics/trend', query)
  },
}

export default healthService
