import { ref, computed, onScopeDispose } from 'vue'
import type { Answer, Execution, ConfigEntity } from '../api/types'
import { businessTime } from '../model/display'
import { answerErrors, imageAllowed, newRequestId, submissionFor, type MobileTask, type Submission } from './model'
import { resolveContext, MobileError, type MobileContext } from './transport'
import * as api from './api'
import { pendingStore } from './pending'
import { historyQuery, type HistoryFilters } from './history'
import { matchScannedTasks, scannedPointId } from './scan/match'
import { canManage } from './management/model'
import { patrolProject } from './projectScope'

interface Draft { answers: Answer[]; remark: string; pending?: Submission }
/** 页面会话保存草稿；响应丢失后锁定原请求体与请求号，重试不会创建第二次巡更。 */
export function useMobilePatrol() {
  const context = ref<MobileContext>(), date = ref(businessTime().format('YYYY-MM-DD'))
  const tab = ref<'home' | 'tasks' | 'history' | 'manage'>('home'), rows = ref<MobileTask[]>([]), records = ref<Execution[]>([])
  const missedCount = ref<number>(), missedError = ref(false)
  const historyScope = ref<'mine' | 'authorized'>('mine'), people = ref<ConfigEntity[]>([])
  const canReadProjectHistory = computed(() => canManage(context.value, 'patrol-execution', 'query') && canManage(context.value, 'patrol-point', 'query'))
  const mine = ref(true), categories = ref<ConfigEntity[]>([]), levels = ref<ConfigEntity[]>([])
  const defaultHistory = (): HistoryFilters => ({ from: businessTime().format('YYYY-MM-DD'), to: businessTime().format('YYYY-MM-DD'), pointName: '', categoryId: '', levelId: '' })
  const historyFilters = ref<HistoryFilters>(defaultHistory()), appliedHistory = ref<HistoryFilters>(defaultHistory())
  const filterError = ref(false)
  const selected = ref<MobileTask>(), record = ref<Execution>(), success = ref<Execution>()
  const loading = ref(false), sending = ref(false), uploading = ref(false), error = ref('')
  const draft = ref<Draft>({ answers: [], remark: '' }), errors = ref<Record<string, string>>({})
  const images = ref<Record<string, string>>({}), total = ref(0), page = ref(0)
  const imageRequests = new Map<string, Promise<void>>()
  const drafts = new Map<string, Draft>()
  const pending = pendingStore(sessionStorage)
  const localImages = new Set<string>()
  let version = 0, disposed = false
  onScopeDispose(() => { disposed = true; version++; localImages.forEach(url => URL.revokeObjectURL(url)) })
  const locked = computed(() => sending.value || uploading.value || !!draft.value.pending)
  const reason = (value: string) => ({
    'error.patrol.execution.completed': 'Mobile.completed',
    'error.patrol.execution.outside_window': 'Mobile.outsideWindow',
    'error.patrol.execution.cooldown': 'Mobile.cooldown',
    'error.patrol.execution.off_shift': 'Mobile.offShift',
    'error.patrol.execution.unassigned': 'Mobile.unassigned',
    'error.patrol.reference.unavailable': 'Mobile.unavailable',
  })[value] || 'Mobile.unknownReason'
  function fail(cause: unknown) {
    error.value = cause instanceof Error ? cause.message : 'Mobile.requestFailed'
  }
  async function load(more = false) {
    if (locked.value) return
    const current = ++version
    const projectId = patrolProject.value
    // 初始化、清空项目和自动刷新均不能退回全部项目查询；同时作废旧项目的在途响应。
    if (!patrolProject.value) {
      rows.value = []; records.value = []; total.value = 0; missedCount.value = undefined
      loading.value = false; error.value = ''; missedError.value = false
      return
    }
    loading.value = true; error.value = ''
    try {
      context.value = await resolveContext()
      if (disposed || current !== version || patrolProject.value !== projectId) return
      const unresolved = pending.read(context.value)
      if (unresolved) {
        open(unresolved.row)
        draft.value = { answers: unresolved.submission.answers, remark: unresolved.submission.remark, pending: unresolved.submission }
        error.value = 'Mobile.submitUncertain'
        return
      }
      if (tab.value === 'manage') return
      if (tab.value === 'home') {
        missedCount.value = undefined; missedError.value = false
        // 与漏检列表默认的近七日范围一致，失败不冒充零条，也不阻塞其余首页统计。
        const [tasks, missed] = await Promise.allSettled([
          api.myTasks(date.value, true), api.myMissed(businessTime().subtract(6, 'day').format('YYYY-MM-DD'), date.value),
        ])
        if (disposed || current !== version) return
        if (missed.status === 'fulfilled') missedCount.value = missed.value.length
        else missedError.value = true
        if (tasks.status === 'rejected') throw tasks.reason
        rows.value = tasks.value
      } else if (tab.value === 'tasks') {
        const [data, categoryPage] = await Promise.all([api.myTasks(date.value, mine.value), api.configurationOptions('categories')])
        if (!disposed && current === version) { rows.value = data; categories.value = categoryPage }
      } else {
        const nextPage = more ? page.value + 1 : 0
        const query = historyQuery({ ...appliedHistory.value, userId: historyScope.value === 'authorized' && canReadProjectHistory.value ? appliedHistory.value.userId : undefined }, nextPage)
        const data = historyScope.value === 'authorized' && canReadProjectHistory.value ? await api.authorizedHistory(query) : await api.myHistory(query)
        if (!disposed && current === version) {
          records.value = more ? [...records.value, ...data.data] : data.data
          total.value = data.total; page.value = nextPage
        }
      }
    } catch (cause) { if (!disposed && current === version) fail(cause) }
    finally { if (!disposed && current === version) loading.value = false }
  }
  let optionVersion = 0
  async function loadHistoryOptions() {
    const current = ++optionVersion
    const projectId = patrolProject.value
    if (!patrolProject.value) {
      categories.value = []; levels.value = []; people.value = []; filterError.value = false
      return
    }
    filterError.value = false
    try {
      context.value = await resolveContext()
      if (disposed || current !== optionVersion || patrolProject.value !== projectId) return
      const [categoryRows, levelRows, personRows] = await Promise.all([
        api.configurationOptions('categories'), api.configurationOptions('levels'),
        canReadProjectHistory.value ? api.configurationOptions('persons') : Promise.resolve([]),
      ])
      if (!disposed && current === optionVersion && patrolProject.value === projectId) { categories.value = categoryRows; levels.value = levelRows; people.value = personRows }
    } catch { if (!disposed && current === optionVersion) filterError.value = true }
  }
  async function scanPoint(raw: string): Promise<MobileTask[]> {
    const projectId = patrolProject.value
    if (!patrolProject.value) throw new Error('Mobile.chooseProject')
    if (locked.value) throw new Error('Mobile.submitUncertain')
    scannedPointId(raw)
    context.value = await resolveContext()
    if (patrolProject.value !== projectId) throw new Error('Mobile.chooseProject')
    if (pending.read(context.value)) throw new Error('Mobile.submitUncertain')
    // 扫码不受首页“我的/全员”切换影响；后端始终按当前应用资产及当前用户计算资格。
    const data = await api.myTasks(businessTime().format('YYYY-MM-DD'), false)
    return matchScannedTasks(raw, data, Date.now())
  }
  async function scanNfc(raw: string): Promise<MobileTask[]> {
    const code = raw.trim(), projectId = patrolProject.value
    if (!code || code.length > 128) throw new Error('Mobile.nfcInvalid')
    if (!projectId) throw new Error('Mobile.chooseProject')
    if (locked.value) throw new Error('Mobile.submitUncertain')
    context.value = await resolveContext()
    if (patrolProject.value !== projectId) throw new Error('Mobile.chooseProject')
    if (pending.read(context.value)) throw new Error('Mobile.submitUncertain')
    const data = await api.myTasks(businessTime().format('YYYY-MM-DD'), false, code)
    if (disposed || patrolProject.value !== projectId) throw new Error('Mobile.chooseProject')
    const now = Date.now()
    return data.filter(row => row.executable && now >= row.task.startTime && now < row.task.endTime && row.task.completedCount < row.task.requiredCount)
  }
  function searchHistory(reset = false) {
    if (locked.value) return
    if (reset) historyFilters.value = defaultHistory()
    try { historyQuery(historyFilters.value) } catch (cause) { fail(cause); return }
    appliedHistory.value = { ...historyFilters.value }
    records.value = []; total.value = 0; page.value = 0
    void load()
  }
  function open(row: MobileTask) {
    selected.value = row; record.value = undefined; success.value = undefined; error.value = ''; errors.value = {}
    draft.value = drafts.get(row.task.id) || { answers: row.task.standardSnapshot.map(item => ({ itemId: item.id })), remark: '' }
    drafts.set(row.task.id, draft.value)
  }
  function leave() {
    if (sending.value || uploading.value || draft.value.pending) return
    selected.value = undefined; record.value = undefined; success.value = undefined; error.value = ''
    void load()
  }
  function changeAnswer(id: string, value: string) {
    if (locked.value) return
    const answer = draft.value.answers.find(item => item.itemId === id)
    if (answer) answer.value = value
    delete errors.value[id]
  }
  async function upload(id: string, file: File) {
    if (locked.value) return
    if (!imageAllowed(file)) { errors.value[id] = 'Mobile.invalidImage'; return }
    uploading.value = true; error.value = ''
    try {
      const receipt = await api.upload(file, selected.value?.task.projectId)
      const answer = draft.value.answers.find(item => item.itemId === id)
      if (answer) answer.attachmentId = receipt.id
      delete errors.value[id]
      // 上传成功即展示所选文件；缩略图不依赖第二次网络读取，附件 ID 仍以服务端回执为准。
      const localUrl = URL.createObjectURL(file)
      if (disposed) { URL.revokeObjectURL(localUrl); return }
      localImages.add(localUrl)
      images.value[receipt.id] = localUrl
    } catch (cause) { fail(cause) }
    finally { uploading.value = false }
  }
  async function preview(id: string) {
    if (images.value[id]) return
    const projectId = selected.value?.task.projectId ?? record.value?.projectId
    const key = JSON.stringify([projectId, id])
    if (imageRequests.has(key)) return imageRequests.get(key)
    // 自动加载与手动重试共享在途请求，检查项更新时不重复读取同一图片。
    const request = (async () => {
      try {
        const data = await api.preview(id, projectId)
        if (!disposed) images.value[id] = data.dataUrl
      } catch (cause) { if (!disposed) fail(cause) }
      finally { imageRequests.delete(key) }
    })()
    imageRequests.set(key, request)
    return request
  }
  async function submit() {
    if (!selected.value || sending.value || uploading.value) return
    if (!draft.value.pending) {
      errors.value = answerErrors(selected.value.task.standardSnapshot, draft.value.answers)
      if (Object.keys(errors.value).length) return
      // 只在首次提交取样；响应丢失后重试沿用原始采集信息，不以重试时间覆盖。
      draft.value.pending = submissionFor(selected.value.task, draft.value.answers, draft.value.remark, newRequestId(), { collectedTime: Date.now(), networkStatus: navigator.onLine ? 'online' : 'offline' })
      // 缓存写入失败时不发送，避免响应丢失且刷新后无法恢复同一次请求。
      try {
        if (!context.value) throw new Error('Mobile.sessionRequired')
        pending.write(context.value, { row: selected.value, submission: draft.value.pending })
      } catch (cause) { draft.value.pending = undefined; fail(cause); return }
    }
    sending.value = true; error.value = ''
    try {
      const result = await api.submit(draft.value.pending)
      if (context.value) pending.clear(context.value)
      success.value = result; record.value = result
      drafts.delete(selected.value.task.id); draft.value.pending = undefined; selected.value = undefined
    } catch (cause) {
      // 明确的业务拒绝未产生写入，可修改后重新提交；网络/5xx 保持原幂等号和请求体。
      if (cause instanceof MobileError && cause.status >= 400 && cause.status < 500 && cause.status !== 408) {
        if (context.value) pending.clear(context.value)
        draft.value.pending = undefined; fail(cause)
      } else error.value = 'Mobile.submitUncertain'
    } finally { sending.value = false }
  }
  return { context, date, tab, mine, missedCount, missedError, historyScope, canReadProjectHistory, people, categories, levels, historyFilters, filterError, searchHistory, loadHistoryOptions, rows, records, selected, record, success, loading, sending, uploading,
    error, draft, errors, images, total, locked, reason, load, open, leave, changeAnswer, upload, preview, submit, scanPoint, scanNfc }
}
