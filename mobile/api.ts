import type { Execution, Page, Query, AttachmentReceipt, ConfigEntity } from '../api/types'
import type { MobileTask, Submission } from './model'
import { request, type MobileContext } from './transport'
import { patrolProject } from './projectScope'
export const myTasks = (date: string, mine = true, nfcCode?: string) => request<MobileTask[]>('/park/patrol/mobile/tasks/_query', 'POST', { date, mine, ...(nfcCode == null ? {} : { nfcCode }) })
/** 按授权分页读取完整选项；分类超过一页时不能静默丢失候选。 */
export async function configurationOptions(resource: 'categories' | 'levels' | 'tags' | 'roles' | 'standards' | 'persons', projectId: string | undefined = patrolProject.value): Promise<ConfigEntity[]> {
  const rows: ConfigEntity[] = []
  for (let pageIndex = 0; ; pageIndex++) {
    const page = await request<Page<ConfigEntity>>(`/park/patrol/${resource}/_query`, 'POST',
      { pageIndex, pageSize: 200, sorts: [{ name: 'name', order: 'asc' }, { name: 'id', order: 'asc' }] }, projectId)
    rows.push(...page.data)
    if (rows.length >= page.total) return rows
    if (!page.data.length) throw new Error('Mobile.requestFailed')
  }
}
export const myHistory = (query: Query) => request<Page<Execution>>('/park/patrol/mobile/history/_query', 'POST', query)
/** 管理人员的历史查询沿用PC资产过滤接口，不能用移动端本人接口冒充全员记录。 */
export const authorizedHistory = (query: Query) => request<Page<Execution>>('/park/patrol/executions/_query', 'POST', query)
export const submit = (body: Submission, projectId?: string, expected?: Pick<MobileContext, 'applicationId' | 'userId'>) => request<Execution>('/park/patrol/executions', 'POST', body, projectId, expected)
export const upload = (file: File, projectId?: string, expected?: Pick<MobileContext, 'applicationId' | 'userId'>) => {
  const body = new FormData(); body.append('file', file)
  return request<AttachmentReceipt>('/park/patrol/attachments/evidence', 'POST', body, projectId, expected)
}
export const preview = (id: string, projectId?: string) => request<{ dataUrl: string }>(`/park/patrol/attachments/${encodeURIComponent(id)}/preview`, 'GET', undefined, projectId)

export const myMissed = (from: string, to: string) => request<import('../model/missed').MissedItem[]>('/park/patrol/mobile/missed/_query', 'POST', { from, to })
export const applyMyMissed = (itemIds: string[], reason: string) => request<number>('/park/patrol/mobile/missed/apply', 'POST', { itemIds, reason })
export const withdrawMyMissed = (item: import('../model/missed').MissedItem) => request<number>('/park/patrol/mobile/missed/withdraw', 'POST', { itemId: item.id, applicationId: item.applicationId })
export const myMissedHistory = (id: string) => request<import('../model/missed').MissedEvent[]>(`/park/patrol/mobile/missed/${encodeURIComponent(id)}/history`, 'GET')
