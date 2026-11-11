import { computed, onMounted, onScopeDispose, ref, shallowRef } from 'vue'
import type { Answer } from '../../api/types'
import { businessTime } from '../../model/display'
import { answerErrors, imageAllowed, newRequestId, type MobileTask } from '../model'
import { resolveContext } from '../transport'
import { patrolProject } from '../projectScope'
import * as api from '../api'
import { collectReason, emptyOfflineData, offlineKey, queueEntry, type OfflineIdentity, type OfflinePhoto, type OfflineEntry } from './model'
import { offlineStore, type OfflineStore } from './store'
import { syncEntry } from './sync'

/** 独立离线工作区只管理本机缓存，不混入在线任务统计；写入仍使用现有后端资格校验。 */
export function useOfflinePatrol() {
  const data = shallowRef(emptyOfflineData()), selected = shallowRef<MobileTask>(), viewed = shallowRef<OfflineEntry>()
  const answers = ref<Answer[]>([]), remark = ref(''), photos: Record<string, OfflinePhoto> = {}
  const images = ref<Record<string, string>>({}), errors = ref<Record<string, string>>({}), error = ref(''), notice = ref('')
  const loading = ref(true), downloading = ref(false), saving = ref(false), syncing = ref(false)
  const networkOnline = ref(navigator.onLine), workingOffline = ref(!navigator.onLine), now = ref(Date.now())
  const tab = ref<'tasks' | 'queue'>('tasks'), keyword = ref('')
  let identity: OfflineIdentity | undefined, store: OfflineStore | undefined, disposed = false
  const urls = new Set<string>()
  const busy = computed(() => loading.value || downloading.value || saving.value || syncing.value)
  const canNetwork = computed(() => networkOnline.value && !workingOffline.value)
  const pending = computed(() => data.value.entries.filter(row => row.state !== 'synced').length)
  const filtered = computed(() => data.value.rows.filter(row => (row.task.pointName || row.task.name).includes(keyword.value.trim())))
  const fail = (cause: unknown) => { if (!disposed) error.value = cause instanceof Error ? cause.message : 'Mobile.requestFailed' }
  function photoUrl(blob: Blob) { const url = URL.createObjectURL(blob); urls.add(url); return url }
  function clearPhotos() {
    for (const url of urls) URL.revokeObjectURL(url)
    urls.clear(); for (const key of Object.keys(photos)) delete photos[key]
    images.value = { ...data.value.images }
  }
  async function assertCurrent() {
    const context = await resolveContext()
    if (disposed || !identity || patrolProject.value !== identity.projectId
      || context.userId !== identity.userId || context.applicationId !== identity.applicationId)
      throw new Error('Mobile.contextChanged')
  }
  async function assertNetwork() {
    if (!canNetwork.value) throw new Error('Mobile.offlineReconnect')
    await assertCurrent()
  }
  async function refresh() { if (store) { const value = await store.read(); if (!disposed) data.value = value } }
  async function initialize() {
    loading.value = true
    try {
      const context = await resolveContext(), projectId = patrolProject.value
      if (!projectId) throw new Error('Mobile.chooseProject')
      identity = { applicationId: context.applicationId, userId: context.userId, projectId }
      store = offlineStore(identity)
      await refresh(); images.value = { ...data.value.images }
    } catch (cause) { fail(cause) }
    finally { if (!disposed) loading.value = false }
  }
  async function download() {
    if (busy.value || !store || selected.value || viewed.value) return
    downloading.value = true; error.value = ''; notice.value = ''
    try {
      await assertNetwork()
      const date = businessTime().format('YYYY-MM-DD'), rows = await api.myTasks(date, true)
      await assertNetwork()
      // 只缓存所选项目本人任务；不会为离线演示获取全员或跨项目任务。
      if (rows.some(row => row.task.projectId !== identity!.projectId)) throw new Error('Mobile.contextChanged')
      const cachedImages: Record<string, string> = {}
      const fileIds = [...new Set(rows.flatMap(row => row.task.standardSnapshot.map(item => item.exampleFileId)).filter((id): id is string => !!id))]
      for (let offset = 0; offset < fileIds.length; offset += 3) {
        await assertNetwork()
        await Promise.all(fileIds.slice(offset, offset + 3).map(async id => { cachedImages[id] = (await api.preview(id, identity!.projectId)).dataUrl }))
      }
      await assertNetwork()
      // 全部任务/例图成功后原子替换，下载失败保留原缓存和未同步记录。
      data.value = await store.update(data => { data.cachedAt = Date.now(); data.date = date; data.rows = rows; data.images = cachedImages })
      images.value = { ...cachedImages }; notice.value = 'Mobile.offlineDownloaded'
    } catch (cause) { fail(cause) }
    finally { if (!disposed) downloading.value = false }
  }
  function reason(row: MobileTask) { return collectReason(row, data.value, now.value) }
  function open(row: MobileTask) {
    if (busy.value || reason(row)) return
    workingOffline.value = true
    clearPhotos(); selected.value = row; viewed.value = undefined; errors.value = {}; error.value = ''; notice.value = ''
    answers.value = row.task.standardSnapshot.map(item => ({ itemId: item.id })); remark.value = ''
  }
  function close() { selected.value = undefined; viewed.value = undefined; clearPhotos(); answers.value = []; remark.value = ''; errors.value = {} }
  function answer(id: string, value: string) {
    const row = answers.value.find(row => row.itemId === id)
    if (row) row.value = value
    delete errors.value[id]
  }
  function photo(id: string, file: File) {
    if (busy.value || !selected.value) return
    if (!imageAllowed(file)) { errors.value[id] = 'Mobile.invalidImage'; return }
    const row = answers.value.find(row => row.itemId === id)
    if (!row) return
    if (row.attachmentId) {
      const old = images.value[row.attachmentId]
      if (old && urls.has(old)) { URL.revokeObjectURL(old); urls.delete(old) }
      delete photos[row.attachmentId]; delete images.value[row.attachmentId]
    }
    const key = `offline:${newRequestId()}`
    photos[key] = { blob: file, name: file.name }; images.value[key] = photoUrl(file); row.attachmentId = key
    delete errors.value[id]
  }
  async function save() {
    if (busy.value || !store || !selected.value) return
    errors.value = answerErrors(selected.value.task.standardSnapshot, answers.value)
    if (Object.keys(errors.value).length) return
    saving.value = true; error.value = ''
    try {
      await assertCurrent()
      const row = selected.value, entry = queueEntry(row, answers.value, remark.value, photos, newRequestId(), Date.now())
      entry.images = Object.fromEntries(row.task.standardSnapshot.filter(item => item.exampleFileId && data.value.images[item.exampleFileId])
        .map(item => [item.exampleFileId!, data.value.images[item.exampleFileId!]]))
      data.value = await store.update(data => {
        const reason = collectReason(row, data, entry.submission.collectedTime!)
        if (reason) throw new Error(reason)
        entry.cacheTime = data.cachedAt
        data.entries.push(entry)
      })
      close(); tab.value = 'queue'; notice.value = 'Mobile.offlineSaved'
    } catch (cause) { fail(cause) }
    finally { if (!disposed) saving.value = false }
  }
  function view(entry: OfflineEntry) {
    clearPhotos(); selected.value = undefined; viewed.value = entry; Object.assign(images.value, entry.images)
    for (const [id, file] of Object.entries(entry.photos)) {
      const url = photoUrl(file.blob); images.value[id] = url
      if (entry.receipts[id]) images.value[entry.receipts[id]] = url
    }
  }
  async function sync() {
    if (busy.value || !store || !identity || !pending.value || selected.value || viewed.value) return
    syncing.value = true; error.value = ''; notice.value = ''
    try {
      await assertNetwork()
      // 多标签页只允许一个同步者；不支持安全锁时明确提示，不并发发送同一队列。
      if (!navigator.locks) throw new Error('Mobile.offlineLockUnavailable')
      await navigator.locks.request(`patrol-sync:${offlineKey(identity)}`, { ifAvailable: true }, async lock => {
        if (!lock) throw new Error('Mobile.offlineSyncBusy')
        const ids = (await store!.read()).entries.filter(row => row.state !== 'synced').map(row => row.id)
        for (const id of ids) {
          await assertNetwork()
          try { await syncEntry(store!, id, identity!.projectId, {
            upload: (file, projectId) => api.upload(file, projectId, identity),
            submit: (body, projectId) => api.submit(body, projectId, identity),
          }, assertNetwork) }
          catch (cause) {
            // 单条业务拒绝保留原因并继续；认证/断网则停止，等待重新登录或联网。
            if (!canNetwork.value || disposed || !identity || patrolProject.value !== identity.projectId
              || cause instanceof Error && ['Mobile.sessionRequired', 'Mobile.contextChanged'].includes(cause.message)) throw cause
          }
          await refresh()
        }
      })
      await refresh(); notice.value = pending.value ? 'Mobile.offlineSyncRemaining' : 'Mobile.offlineSyncDone'
    } catch (cause) { fail(cause) }
    finally { if (!disposed) { syncing.value = false; await refresh().catch(fail) } }
  }
  const dirty = computed(() => !!selected.value && (!!remark.value || answers.value.some(row => row.value || row.attachmentId)))
  function beforeUnload(event: BeforeUnloadEvent) { if (dirty.value || busy.value) { event.preventDefault(); event.returnValue = '' } }
  const networkChanged = () => { networkOnline.value = navigator.onLine; if (!navigator.onLine) workingOffline.value = true }
  const timer = setInterval(() => { now.value = Date.now() }, 15000)
  onMounted(() => {
    void initialize(); window.addEventListener('online', networkChanged); window.addEventListener('offline', networkChanged); window.addEventListener('beforeunload', beforeUnload)
  })
  onScopeDispose(() => {
    disposed = true; clearInterval(timer); clearPhotos()
    window.removeEventListener('online', networkChanged); window.removeEventListener('offline', networkChanged); window.removeEventListener('beforeunload', beforeUnload)
  })
  return { data, selected, viewed, answers, remark, images, errors, error, notice, loading, downloading, saving, syncing,
    networkOnline, workingOffline, now, tab, keyword, busy, canNetwork, pending, filtered, dirty, download, reason, open, close, answer, photo, save, view, sync }
}
