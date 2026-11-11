import type { Answer, CheckItem, Task, CollectionMetadata } from '../api/types'
import { itemType } from '../model/standards.ts'
export interface MobileTask { task: Task; executable: boolean; reason: string }
export interface Submission extends CollectionMetadata { taskId: string; requestId: string; answers: Answer[]; remark: string }
/** 后端决定合格/不合格；前端只校验必填、选项、数字格式和附件是否齐全。 */
export function answerErrors(items: CheckItem[], answers: Answer[]): Record<string, string> {
  const errors: Record<string, string> = {}
  for (const item of items) {
    const answer = answers.find(value => value.itemId === item.id)
    const value = answer?.value?.trim() || ''
    const type = itemType(item)
    if (type !== 'image' && item.required && !value) errors[item.id] = 'Mobile.required'
    else if (type === 'number' && value && !/^[+-]?\d{1,18}(\.\d{1,6})?$/.test(value)) errors[item.id] = 'Mobile.invalidNumber'
    else if (type === 'choice' && value && !item.options.includes(value)) errors[item.id] = 'Mobile.invalidChoice'
    if ((item.photoRequired || type === 'image' && item.required) && !answer?.attachmentId)
      errors[item.id] = 'Mobile.photoRequired'
  }
  return errors
}
export function submissionFor(task: Task, answers: Answer[], remark: string, requestId: string, metadata: CollectionMetadata): Submission {
  return { taskId: task.id, requestId, collectedTime: metadata.collectedTime, networkStatus: metadata.networkStatus, remark: remark.trim(), answers: task.standardSnapshot.map(item => {
    const answer = answers.find(value => value.itemId === item.id)
    return { itemId: item.id, value: itemType(item) === 'image' ? null : answer?.value?.trim() || null,
      attachmentId: answer?.attachmentId || null }
  }) }
}
export function newRequestId(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), n => n.toString(16).padStart(2, '0')).join('')
}
export const imageAllowed = (file: Pick<File, 'type' | 'size'>) =>
  ['image/jpeg', 'image/png', 'image/webp'].includes(file.type) && file.size > 0 && file.size <= 5 * 1024 * 1024
