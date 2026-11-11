import type { Query, Term } from '../api/types'
export interface HistoryFilters { from: string; to: string; pointName: string; categoryId: string; levelId: string; userId?: string }
/** 日期按上海时区转为半开接收时间区间；只构造条件，不改变服务端本人/应用授权。 */
export function historyQuery(filters: HistoryFilters, pageIndex = 0): Query {
  const from = Date.parse(`${filters.from}T00:00:00+08:00`), to = Date.parse(`${filters.to}T00:00:00+08:00`)
  if (!Number.isFinite(from) || !Number.isFinite(to) || to < from) throw new Error('Mobile.invalidHistoryRange')
  const terms: Term[] = [
    { column: 'receiveTime', termType: 'gte', value: from },
    { column: 'receiveTime', termType: 'lt', value: to + 86400000 },
  ]
  if (filters.pointName.trim()) terms.push({ column: 'pointName', termType: 'like', value: `%${filters.pointName.trim()}%` })
  if (filters.categoryId) terms.push({ column: 'categoryId', termType: 'eq', value: filters.categoryId })
  if (filters.levelId) terms.push({ column: 'levelId', termType: 'eq', value: filters.levelId })
  if (filters.userId) terms.push({ column: 'userId', termType: 'eq', value: filters.userId })
  return { pageIndex, pageSize: 20, terms, sorts: [{ name: 'receiveTime', order: 'desc' }, { name: 'id', order: 'desc' }] }
}
