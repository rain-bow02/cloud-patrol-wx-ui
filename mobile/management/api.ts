import type { ConfigEntity, Page, Query } from '../../api/types'
import { request } from '../transport'

export const queryPoints = (query: Query) => request<Page<ConfigEntity>>('/park/patrol/points/_query', 'POST', query)
export const readPoint = (id: string, projectId?: string) => request<ConfigEntity>(`/park/patrol/points/${encodeURIComponent(id)}`, 'GET', undefined, projectId)
export const savePoint = (point: ConfigEntity) => request<ConfigEntity>(point.id
  ? `/park/patrol/points/${encodeURIComponent(point.id)}` : '/park/patrol/points', point.id ? 'PUT' : 'POST', point, point.projectId)
export const changeCategory = (action: 'link' | 'cancel', point: ConfigEntity, categoryId: string) =>
  request<void>(`/park/patrol/point-categories/${action}`, 'POST', { pointIds: [point.id], categoryId }, point.projectId)
export interface RoleRule { roleId: string; levelId?: string; standardId?: string }
export const readAssignments = (point: ConfigEntity, categoryId: string) =>
  request<{ pointId: string; assignments: ConfigEntity[] }[]>('/park/patrol/point-assignments/_detail', 'POST', { pointIds: [point.id], categoryId }, point.projectId)
export const saveAssignments = (point: ConfigEntity, categoryId: string, rules: RoleRule[]) =>
  request<void>('/park/patrol/point-assignments/configuration', 'POST', { pointIds: [point.id], categoryId, rules }, point.projectId)
