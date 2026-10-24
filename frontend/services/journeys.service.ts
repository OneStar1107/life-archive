// services/journeys.service.ts
// ══════════════════════════════════════════════════════════════
// 旅途：去过的地方 / 常驻城市
// ══════════════════════════════════════════════════════════════
//
// 对应 backend/src/modules/journeys/journeys.controller.ts
// （@Controller('journeys')）
//
// 路由核对清单：
//   GET    /journeys            列表（常驻城市优先展示）
//   GET    /journeys/map-points 地图点位（有经纬度的旅途）★ 注意是连字符 map-points
//   GET    /journeys/timeline   旅途时间轴（按时间正序的分段，含停留天数）
//   GET    /journeys/:id        详情
//   POST   /journeys            新增
//   PATCH  /journeys/:id        更新
//   DELETE /journeys/:id        删除（软删除）
//
// map-points / timeline 是无参 GET，不传第二个入参——
// 传 undefined 会让 uni.request 带上 data 字段，个别端上会拼出空 query。

import { del, get, patch, post } from '@/core/http/request'
import type { PageResult } from '@/core/http/types'
import type {
  CreateJourneyInput,
  Journey,
  JourneyQuery,
  MapPoint,
  TimelineSegment,
  UpdateJourneyInput,
} from './types'

export const journeysService = {
  /** 列表 */
  list(query: JourneyQuery): Promise<PageResult<Journey>> {
    return get<PageResult<Journey>>('/journeys', query)
  },

  /** 详情 */
  detail(id: string): Promise<Journey> {
    return get<Journey>(`/journeys/${id}`)
  },

  /** 新增一段旅途 */
  create(data: CreateJourneyInput): Promise<Journey> {
    return post<Journey>('/journeys', data)
  },

  /**
   * 更新旅途。
   * ★ isResident 置 true 时后端会强制清空 endedAt，端上不必自己先置 null。
   */
  update(id: string, data: UpdateJourneyInput): Promise<Journey> {
    return patch<Journey>(`/journeys/${id}`, data)
  },

  /** 删除旅途（软删除） */
  remove(id: string): Promise<{ success: boolean }> {
    return del<{ success: boolean }>(`/journeys/${id}`)
  },

  /** 地图点位，用于渲染地图。latitude / longitude 为 null 的已被后端过滤掉 */
  mapPoints(): Promise<MapPoint[]> {
    return get<MapPoint[]>('/journeys/map-points')
  },

  /** 旅途时间轴，含停留天数 */
  timeline(): Promise<TimelineSegment[]> {
    return get<TimelineSegment[]>('/journeys/timeline')
  },
}

export default journeysService
