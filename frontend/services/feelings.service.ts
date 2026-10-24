// services/feelings.service.ts
// ══════════════════════════════════════════════════════════════
// 感受记录 + 情绪粒度建议
// ══════════════════════════════════════════════════════════════
//
// 对应 backend/src/modules/feelings/feelings.controller.ts
// （@Controller('feelings')）
//
// 路由核对清单：
//   GET    /feelings            列表
//   GET    /feelings/daily-stat  某天统计（date 可选，默认今天）
//   GET    /feelings/refine      情绪粒度建议（rawLabel 必填）★ GET 带 query
//   GET    /feelings/:id         详情
//   POST   /feelings            记录一次感受
//   PATCH  /feelings/:id         更新
//   DELETE /feelings/:id         删除（软删除）
//
// ★ refine 是 GET，参数必须放 get() 的第二个入参，不能塞进 body。

import { del, get, patch, post } from '@/core/http/request'
import type { PageResult } from '@/core/http/types'
import type {
  CreateFeelingInput,
  DailyStatQuery,
  Feeling,
  FeelingQuery,
  FeelingStat,
  RefineQuery,
  RefineSuggestion,
  UpdateFeelingInput,
} from './types'

export const feelingsService = {
  /** 列表。支持极性过滤、关键词搜索、日期区间 */
  list(query: FeelingQuery): Promise<PageResult<Feeling>> {
    return get<PageResult<Feeling>>('/feelings', query)
  },

  /** 详情 */
  detail(id: string): Promise<Feeling> {
    return get<Feeling>(`/feelings/${id}`)
  },

  /** 记录一次感受。rawLabel 必填，intensity 1~10 */
  create(data: CreateFeelingInput): Promise<Feeling> {
    return post<Feeling>('/feelings', data)
  },

  /** 更新感受 */
  update(id: string, data: UpdateFeelingInput): Promise<Feeling> {
    return patch<Feeling>(`/feelings/${id}`, data)
  },

  /** 删除感受（软删除） */
  remove(id: string): Promise<{ success: boolean }> {
    return del<{ success: boolean }>(`/feelings/${id}`)
  },

  /**
   * 某天的感受统计。
   * 首页「今天过得怎么样？」用；只做陈述，不做评价。
   */
  dailyStat(query?: DailyStatQuery): Promise<FeelingStat> {
    return get<FeelingStat>('/feelings/daily-stat', query)
  },

  /**
   * 情绪粒度建议。
   * 把「难受」精确到「憋屈 / 不甘 / 被忽视」。
   * ★ 基于后端本地 RULER 词表，不调用大模型，因此没有 loading 抖动，适合输入时实时调。
   */
  refine(query: RefineQuery): Promise<RefineSuggestion> {
    return get<RefineSuggestion>('/feelings/refine', query)
  },
}

export default feelingsService
