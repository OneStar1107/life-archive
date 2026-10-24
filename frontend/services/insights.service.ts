// services/insights.service.ts
// ══════════════════════════════════════════════════════════════
// 洞察：系统对用户的观察，以及用户的回应
// ══════════════════════════════════════════════════════════════
//
// 对应 backend/src/modules/insights/insights.controller.ts
// （@Controller('insights')）
//
// 路由核对清单：
//   GET    /insights           列表
//   GET    /insights/stats     统计（总数 / 未读 / 已采纳 / 按类型分布）
//   GET    /insights/:id       详情
//   POST   /insights/:id/read     标记已读（幂等）
//   POST   /insights/:id/feedback 提交反馈（给出反馈即视为已读）
//   POST   /insights/:id/adopt    采纳（只能一次，重复返回 50007）
//   DELETE /insights/:id       删除（软删除）
//
// ★ 三种「回应」都是 POST 独立路由，不是 PATCH——已读 / 反馈 / 采纳
//   在后端是三种不同语义，各自有幂等与去重规则，不要合并成一个 PATCH。

import { del, get, post } from '@/core/http/request'
import type { PageResult } from '@/core/http/types'
import type { Insight, InsightFeedback, InsightQuery, InsightStats } from './types'

export const insightsService = {
  /** 列表。unreadOnly=true 只看未读（首页红点用） */
  list(query: InsightQuery): Promise<PageResult<Insight>> {
    return get<PageResult<Insight>>('/insights', query)
  },

  /** 详情。含依据的记忆与感受 ID，供端上串联上下文 */
  detail(id: string): Promise<Insight> {
    return get<Insight>(`/insights/${id}`)
  },

  /** 统计。★ 无参 GET。byKind 始终包含全部五种类型，未产生的记 0 */
  stats(): Promise<InsightStats> {
    return get<InsightStats>('/insights/stats')
  },

  /** 标记已读。幂等：重复调用不改写首次已读时间 */
  markRead(id: string): Promise<Insight> {
    return post<Insight>(`/insights/${id}/read`)
  },

  /** 提交反馈。like / dislike / none（none 表示撤销反馈） */
  setFeedback(id: string, feedback: InsightFeedback): Promise<Insight> {
    return post<Insight>(`/insights/${id}/feedback`, { feedback })
  },

  /** 采纳。只能一次，重复采纳返回 50007 */
  adopt(id: string): Promise<Insight> {
    return post<Insight>(`/insights/${id}/adopt`)
  },

  /** 删除洞察（软删除） */
  remove(id: string): Promise<{ success: boolean }> {
    return del<{ success: boolean }>(`/insights/${id}`)
  },
}

export default insightsService
