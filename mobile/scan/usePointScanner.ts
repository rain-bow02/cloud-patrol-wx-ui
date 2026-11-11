import { onScopeDispose, ref } from 'vue'
import type { MobileTask } from '../model'
import { readQrImage } from './image'

/** 从本地图片识别点位，再沿现有授权任务查询匹配；返回页面后忽略迟到结果。 */
export function usePointScanner(resolve: (raw: string) => Promise<MobileTask[]>, select: (row: MobileTask) => void) {
  const matches = ref<MobileTask[]>([]), busy = ref(false), error = ref(''), scanning = ref(false)
  let operation: AbortController | undefined
  async function run(read: () => Promise<string>) {
    operation?.abort()
    const current = operation = new AbortController()
    matches.value = []; error.value = ''; busy.value = false; scanning.value = true
    try {
      const raw = await read()
      if (current.signal.aborted) return
      scanning.value = false; busy.value = true
      const rows = await resolve(raw)
      if (current.signal.aborted) return
      matches.value = rows
      if (rows.length === 1) select(rows[0])
      else if (!rows.length) error.value = 'Mobile.scanNoTask'
    } catch (cause) {
      if (!current.signal.aborted) error.value = cause instanceof Error && cause.message.startsWith('Mobile.')
        ? cause.message : 'Mobile.scanFailed'
    } finally {
      if (!current.signal.aborted) { scanning.value = false; busy.value = false }
    }
  }
  onScopeDispose(() => operation?.abort())
  return { matches, busy, scanning, error, start: (file: File) => run(() => readQrImage(file)), startCode: (code: string) => run(() => Promise.resolve(code)) }
}
