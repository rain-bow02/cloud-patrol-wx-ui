import type { EnumValue } from '../api/types'
export type MissedStatus = 'none' | 'pending' | 'approved' | 'rejected' | 'withdrawn'
export interface MissedItem {
  id: string; taskId: string; taskGroupId: string; occurrenceNo: number
  status: MissedStatus | EnumValue<MissedStatus>; applicationId?: string
  applicantId?: string; applicantName?: string; reason?: string; applyTime?: number
  auditorName?: string; auditTime?: number; auditRemark?: string
  pointName?: string; roleName?: string; periodStartTime: number; periodEndTime: number
}
export interface MissedEvent {
  id: string; applicationId: string; action: 'apply' | 'approve' | 'reject' | 'withdraw'
  actorName?: string; remark?: string; createTime: number
}
export function missedState(item: MissedItem): MissedStatus {
  return typeof item.status === 'string' ? item.status : item.status.value
}
export function canApplyMissed(item: MissedItem): boolean {
  return ['none', 'rejected', 'withdrawn'].includes(missedState(item))
}
export function missedDecisions(items: MissedItem[]) {
  return items.map(item => ({ itemId: item.id, applicationId: item.applicationId! }))
}
