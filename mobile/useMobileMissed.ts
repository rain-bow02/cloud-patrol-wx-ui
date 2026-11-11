import { ref, computed, onMounted } from 'vue'
import { businessTime } from '../model/display'
import { canApplyMissed, missedState, type MissedItem, type MissedEvent } from '../model/missed'
import { myMissed, applyMyMissed, withdrawMyMissed, myMissedHistory } from './api'
import { resolveContext } from './transport'
import { patrolProject } from './projectScope'
/** 手机漏检独立查询范围，不复用“今日可巡任务”冒充历史漏检。 */
export function useMobileMissed() {
  const from = ref(businessTime().subtract(6, 'day').format('YYYY-MM-DD')), to = ref(businessTime().format('YYYY-MM-DD'))
  const rows = ref<MissedItem[]>([]), selection = ref<string[]>([]), state = ref(''), loading = ref(false), saving = ref(false)
  const error = ref(''), userId = ref(''), reason = ref(''), open = ref(false), invalid = ref(false)
  const events = ref<MissedEvent[]>(), historyLoading = ref(false)
  const filtered = computed(() => state.value ? rows.value.filter(row => missedState(row) === state.value) : rows.value)
  const chosen = computed(() => rows.value.filter(row => selection.value.includes(row.id)))
  const submittable = computed(() => chosen.value.length > 0 && chosen.value.every(canApplyMissed))
  function fail(cause: unknown) { error.value = cause instanceof Error ? cause.message : 'Mobile.requestFailed' }
  async function load() {
    const projectId = patrolProject.value
    if (!patrolProject.value) { rows.value = []; selection.value = []; return }
    if (loading.value || saving.value) return
    if (!from.value || !to.value || to.value < from.value || businessTime(Date.parse(to.value + 'T00:00:00+08:00')).diff(businessTime(Date.parse(from.value + 'T00:00:00+08:00')), 'day') > 30) {
      error.value = 'Patrol.missed.range'; return
    }
    loading.value = true; error.value = ''; selection.value = []
    try {
      userId.value = (await resolveContext()).userId
      if (patrolProject.value !== projectId) return
      const data = await myMissed(from.value, to.value)
      if (patrolProject.value === projectId) rows.value = data
    }
    catch (cause) { fail(cause); rows.value = [] }
    finally { loading.value = false }
  }
  async function apply() {
    invalid.value = !reason.value.trim() || reason.value.trim().length > 500
    if (invalid.value || !submittable.value || saving.value) return
    saving.value = true; error.value = ''
    try { await applyMyMissed(selection.value, reason.value.trim()); open.value = false }
    catch (cause) { fail(cause); return }
    finally { saving.value = false }
    await load()
  }
  async function withdraw(row: MissedItem) {
    if (saving.value) return
    saving.value = true; error.value = ''
    try { await withdrawMyMissed(row) }
    catch (cause) { fail(cause); return }
    finally { saving.value = false }
    await load()
  }
  async function history(row: MissedItem) {
    events.value = []; historyLoading.value = true; error.value = ''
    try { events.value = await myMissedHistory(row.id) }
    catch (cause) { fail(cause); events.value = undefined }
    finally { historyLoading.value = false }
  }
  onMounted(load)
  return { from, to, rows: filtered, selection, state, loading, saving, error, userId, reason, open, invalid, events,
    historyLoading, submittable, load, apply, withdraw, history }
}
