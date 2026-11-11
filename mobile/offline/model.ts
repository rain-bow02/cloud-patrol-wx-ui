import type { Answer, Execution } from '../../api/types'
import { answerErrors, submissionFor, type MobileTask, type Submission } from '../model'

export interface OfflineIdentity { applicationId: string; userId: string; projectId: string }
export interface OfflinePhoto { blob: Blob; name: string }
export interface OfflineEntry {
  id: string
  cacheTime?: number
  row: MobileTask
  submission: Submission
  photos: Record<string, OfflinePhoto>
  images?: Record<string, string>
  receipts: Record<string, string>
  /** 第一次发送前持久化最终请求，响应丢失后不能换附件ID或请求号。 */
  payload?: Submission
  state: 'pending' | 'failed' | 'synced'
  error?: string
  record?: Execution
}
export interface OfflineData {
  cachedAt: number
  date: string
  rows: MobileTask[]
  images: Record<string, string>
  entries: OfflineEntry[]
}
export const emptyOfflineData = (): OfflineData => ({ cachedAt: 0, date: '', rows: [], images: {}, entries: [] })
export function offlineKey(identity: OfflineIdentity): string {
  if (![identity.applicationId, identity.userId, identity.projectId].every(value => typeof value === 'string' && !!value.trim()))
    throw new Error('Mobile.offlineIdentityRequired')
  return JSON.stringify([identity.applicationId, identity.userId, identity.projectId])
}
/** 缓存不是执行凭证：只允许当前时段的本人快照，最终仍以服务器同步校验为准。 */
export function collectReason(row: MobileTask, data: OfflineData, now: number): string {
  if (data.entries.some(entry => entry.row.task.id === row.task.id && entry.state !== 'synced')) return 'Mobile.offlineAlreadyQueued'
  if (data.entries.some(entry => entry.row.task.id === row.task.id && entry.state === 'synced'
    && (entry.cacheTime === data.cachedAt || (entry.record?.receiveTime || 0) >= data.cachedAt))) return 'Mobile.offlineRefreshRequired'
  if (row.task.completedCount >= row.task.requiredCount) return 'Mobile.completed'
  if (now < row.task.startTime || now >= row.task.endTime) return 'Mobile.outsideWindow'
  if (!row.executable && !['error.patrol.execution.cooldown', 'error.patrol.execution.outside_window'].includes(row.reason)) return 'Mobile.unavailable'
  if (row.task.lastExecutionTime != null && row.task.lastExecutionTime + (row.task.cooldownMinutes || 0) * 60000 > now) return 'Mobile.cooldown'
  // 老后端未返回间隔值时，不能仅凭本机时间把冷却快照改成可执行。
  if (row.reason === 'error.patrol.execution.cooldown' && row.task.cooldownMinutes == null) return 'Mobile.offlineRefreshRequired'
  return ''
}
export function queueEntry(row: MobileTask, answers: Answer[], remark: string, photos: Record<string, OfflinePhoto>, id: string, now: number): OfflineEntry {
  if (Object.keys(answerErrors(row.task.standardSnapshot, answers)).length) throw new Error('Mobile.offlineIncomplete')
  const submission = submissionFor(row.task, answers, remark, id, { collectedTime: now, networkStatus: 'offline' })
  const needed: Record<string, OfflinePhoto> = {}
  for (const answer of submission.answers) if (answer.attachmentId) {
    const photo = photos[answer.attachmentId]
    if (!photo) throw new Error('Mobile.offlinePhotoMissing')
    needed[answer.attachmentId] = photo
  }
  return { id, row: JSON.parse(JSON.stringify(row)), submission, photos: needed, receipts: {}, state: 'pending' }
}
