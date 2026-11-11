import type { AttachmentReceipt, Execution } from '../../api/types'
import type { Submission } from '../model'
import type { OfflineEntry } from './model'
import type { OfflineStore } from './store'

export interface OfflineSyncApi {
  upload(file: File, projectId: string): Promise<AttachmentReceipt>
  submit(body: Submission, projectId: string): Promise<Execution>
}
/** 回执和最终请求先落盘再发送；网络超时不换requestId，避免重复计次。 */
export async function syncEntry(store: OfflineStore, id: string, projectId: string, api: OfflineSyncApi, assertCurrent: () => Promise<void>): Promise<void> {
  let entry = (await store.read()).entries.find(value => value.id === id)
  if (!entry || entry.state === 'synced') return
  const persist = async (change: (row: OfflineEntry) => void) => {
    const data = await store.update(data => {
      const current = data.entries.find(value => value.id === id)
      if (!current) throw new Error('Mobile.offlineRecordMissing')
      change(current)
    })
    entry = data.entries.find(value => value.id === id)!
  }
  try {
    if (entry.row.task.projectId !== projectId || entry.submission.taskId !== entry.row.task.id) throw new Error('Mobile.contextChanged')
    if (!entry.payload) {
      for (const [photoId, photo] of Object.entries(entry.photos)) {
        if (entry.receipts[photoId]) continue
        await assertCurrent()
        const receipt = await api.upload(new File([photo.blob], photo.name, { type: photo.blob.type }), projectId)
        if (!receipt.id) throw new Error('Mobile.offlinePhotoMissing')
        await persist(row => { row.receipts[photoId] = receipt.id })
      }
      await persist(row => {
        row.payload = { ...row.submission, answers: row.submission.answers.map(answer => ({ ...answer,
          attachmentId: answer.attachmentId ? row.receipts[answer.attachmentId] : null })) }
        if (row.payload.answers.some((answer, index) => row.submission.answers[index].attachmentId && !answer.attachmentId)) throw new Error('Mobile.offlinePhotoMissing')
      })
    }
    await assertCurrent()
    const record = await api.submit(entry.payload!, projectId)
    if (!record?.id || record.taskId !== entry.submission.taskId) throw new Error('Mobile.requestFailed')
    await persist(row => { row.state = 'synced'; row.record = record; row.error = undefined })
  } catch (cause) {
    await persist(row => { row.state = 'failed'; row.error = cause instanceof Error ? cause.message : 'Mobile.requestFailed' })
    throw cause
  }
}
