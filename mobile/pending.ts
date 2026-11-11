import type { MobileTask, Submission } from './model'
import type { MobileContext } from './transport'

export interface PendingAttempt { row: MobileTask; submission: Submission }
const key = (context: MobileContext) => `patrol:pending:${JSON.stringify([context.projectId, context.applicationId, context.userId])}`
/** 只保存待确认提交，不做离线自动上传；恢复时仍由后端重新鉴权并按请求号返回原结果。 */
export function pendingStore(storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>) {
  return {
    read(context: MobileContext): PendingAttempt | undefined {
      try {
        const value = JSON.parse(storage.getItem(key(context)) || 'null')
        if (value?.row?.task?.id && value.submission?.taskId === value.row.task.id
          && typeof value.submission.requestId === 'string' && Array.isArray(value.submission.answers)) return value
      } catch { /* 无效缓存不作为提交依据。 */ }
    },
    write(context: MobileContext, attempt: PendingAttempt) { storage.setItem(key(context), JSON.stringify(attempt)) },
    clear(context: MobileContext) { storage.removeItem(key(context)) },
  }
}
