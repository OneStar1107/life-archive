// services/todos.service.ts
// ══════════════════════════════════════════════════════════════
// 待办 · 时间与你：提醒事项 / 生日 / 节日 / 出行
// ══════════════════════════════════════════════════════════════
//
// 对应 backend/src/modules/todos/todos.controller.ts
// （@Controller('todos')）
//
// 路由核对清单：
//   GET    /todos           列表
//   GET    /todos/grouped   按时间分组（今天 / 未来 7 天 / 已逾期 / 最近完成）
//   GET    /todos/:id       详情
//   POST   /todos           新建
//   PATCH  /todos/:id       更新
//   POST   /todos/:id/toggle 切换完成状态   ★ POST，不是 PATCH
//   DELETE /todos/:id       删除（软删除）
//
// ★ toggle 用 POST 而不是 PATCH：它带副作用（写 completedAt），
//   且对重复的 yearly / monthly 重复规则会自动生成下一期。
//   已完成的事项再 toggle 回来，后端按 TODO_ALREADY_DONE（50006）拦截。

import { del, get, patch, post } from '@/core/http/request'
import type { PageResult } from '@/core/http/types'
import type { CreateTodoInput, Todo, TodoGroup, TodoQuery, UpdateTodoInput } from './types'

export const todosService = {
  /** 列表。支持状态、类型、人物过滤 */
  list(query: TodoQuery): Promise<PageResult<Todo>> {
    return get<PageResult<Todo>>('/todos', query)
  },

  /** 详情 */
  detail(id: string): Promise<Todo> {
    return get<Todo>(`/todos/${id}`)
  },

  /** 新建待办。kind 支持 task / birthday / festival / trip */
  create(data: CreateTodoInput): Promise<Todo> {
    return post<Todo>('/todos', data)
  },

  /** 更新待办 */
  update(id: string, data: UpdateTodoInput): Promise<Todo> {
    return patch<Todo>(`/todos/${id}`, data)
  },

  /** 删除待办（软删除） */
  remove(id: string): Promise<{ success: boolean }> {
    return del<{ success: boolean }>(`/todos/${id}`)
  },

  /** 切换完成状态。返回切换后的完整 Todo，completedAt 由后端写 */
  toggle(id: string): Promise<Todo> {
    return post<Todo>(`/todos/${id}/toggle`)
  },

  /** 首页「今天」分组。★ 无参 GET，不传第二个入参 */
  grouped(): Promise<TodoGroup> {
    return get<TodoGroup>('/todos/grouped')
  },
}

export default todosService
