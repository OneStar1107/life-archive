// services/memories.service.ts
// ══════════════════════════════════════════════════════════════
// 记忆节点 / 图谱 / 时间轴
// ══════════════════════════════════════════════════════════════
//
// 对应 backend/src/modules/memories/memories.controller.ts
// （@Controller('memories')）
//
// 路由核对清单：
//   GET    /memories                     列表
//   GET    /memories/graph               图谱（节点 + 边）
//   GET    /memories/timeline            双时间戳时间轴
//   GET    /memories/:id                 详情
//   GET    /memories/:id/relations       某节点的关联（出边 + 入边）
//   POST   /memories                     新建
//   PATCH  /memories/:id                 更新（只写显式传入的字段）
//   DELETE /memories/:id                 删除（软删除，同时软删其关联）
//   POST   /memories/relations           建立关联
//   DELETE /memories/relations/:relationId 删除关联
//
// ★ 注意 '/memories/relations' 是 POST，与 '/memories/:id' 不冲突（方法不同）；
//   但删除关联用的是 '/memories/relations/:relationId'，relationId 在第二段，
//   不会被 ':id' 抢走——Nest 按注册顺序匹配，controller 里 relations 路由写在最后。

import { del, get, patch, post } from '@/core/http/request'
import type { PageResult } from '@/core/http/types'
import type {
  CreateMemoryInput,
  CreateRelationInput,
  Memory,
  MemoryGraph,
  MemoryQuery,
  MemoryRelation,
  MemoryTimeline,
  UpdateMemoryInput,
} from './types'

export const memoriesService = {
  /** 列表。支持关键词、标签、人物过滤；hasTimeline 只看有过视角转变的 */
  list(query: MemoryQuery): Promise<PageResult<Memory>> {
    return get<PageResult<Memory>>('/memories', query)
  },

  /** 图谱。节点上限 500，边上限 2000 */
  graph(): Promise<MemoryGraph> {
    return get<MemoryGraph>('/memories/graph')
  },

  /** 时间轴。★「当时的我 vs 现在的我」双时间戳对照，本产品的差异化能力 */
  timeline(): Promise<MemoryTimeline> {
    return get<MemoryTimeline>('/memories/timeline')
  },

  /** 详情 */
  detail(id: string): Promise<Memory> {
    return get<Memory>(`/memories/${id}`)
  },

  /** 某节点的全部关联（出边 + 入边） */
  listRelations(id: string): Promise<MemoryRelation[]> {
    return get<MemoryRelation[]>(`/memories/${id}/relations`)
  },

  /** 新建记忆节点 */
  create(data: CreateMemoryInput): Promise<Memory> {
    return post<Memory>('/memories', data)
  },

  /**
   * 更新记忆节点。
   * ★ 写入 pastSelfView / presentSelfView 时后端会自动记录审视时间
   *   （pastViewedAt / presentViewedAt），端上不要自己造时间戳。
   */
  update(id: string, data: UpdateMemoryInput): Promise<Memory> {
    return patch<Memory>(`/memories/${id}`, data)
  },

  /** 删除记忆节点（软删除，其关联一并软删） */
  remove(id: string): Promise<{ success: boolean }> {
    return del<{ success: boolean }>(`/memories/${id}`)
  },

  /** 建立记忆关联。禁止自环（40012）；重复关联返回 40013 */
  addRelation(data: CreateRelationInput): Promise<MemoryRelation> {
    return post<MemoryRelation>('/memories/relations', data)
  },

  /** 删除记忆关联 */
  removeRelation(relationId: string): Promise<{ success: boolean }> {
    return del<{ success: boolean }>(`/memories/relations/${relationId}`)
  },
}

export default memoriesService
