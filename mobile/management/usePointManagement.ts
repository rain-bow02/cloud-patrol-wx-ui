import { computed, onMounted, onScopeDispose, ref, watch } from 'vue'
import type { ConfigEntity } from '../../api/types'
import { patrolProject } from '../projectScope'
import { configurationOptions } from '../api'
import { resolveContext, type MobileContext } from '../transport'
import { canManage, pointPayload, pointQuery, rulesValid } from './model'
import * as api from './api'

/** 管理流程复用PC的点位、分类关系和角色规则接口；不将管理授权当作打卡资格。 */
export function usePointManagement() {
  const context = ref<MobileContext>(), rows = ref<ConfigEntity[]>([]), categories = ref<ConfigEntity[]>([]), tags = ref<ConfigEntity[]>([])
  const roles = ref<ConfigEntity[]>([]), levels = ref<ConfigEntity[]>([]), standards = ref<ConfigEntity[]>([])
  const name = ref(''), category = ref<string>(), page = ref(0), total = ref(0)
  const loading = ref(false), saving = ref(false), error = ref(''), saved = ref(false), editor = ref<ConfigEntity>(), qr = ref(false)
  const assignmentCategory = ref<string>(), rules = ref<api.RoleRule[]>(), assignmentLoading = ref(false), assignmentError = ref('')
  const canSave = computed(() => canManage(context.value, 'patrol-point', 'save'))
  const canConfigure = computed(() => canManage(context.value, 'patrol-plan', 'save'))
  const canReadConfiguration = computed(() => canManage(context.value, 'patrol-plan', 'query'))
  let version = 0, detailVersion = 0, ruleVersion = 0, disposed = false
  const applied = ref({ name: '', category: '' })
  onScopeDispose(() => { disposed = true; version++; detailVersion++; ruleVersion++ })
  const fail = (cause: unknown) => { error.value = cause instanceof Error ? cause.message : 'Mobile.requestFailed' }
  async function load(more = false) {
    const current = ++version
    const projectId = patrolProject.value
    if (!patrolProject.value) { rows.value = []; total.value = 0; loading.value = false; error.value = ''; return }
    loading.value = true; error.value = ''
    try {
      context.value = await resolveContext()
      if (disposed || current !== version || patrolProject.value !== projectId) return
      const next = more ? page.value + 1 : 0
      const data = await api.queryPoints(pointQuery(applied.value.name, applied.value.category, next))
      if (!disposed && current === version) {
        rows.value = more ? [...rows.value, ...data.data] : data.data; total.value = data.total; page.value = next
      }
    } catch (cause) { if (!disposed && current === version) { fail(cause); if (!more) rows.value = [] } }
    finally { if (!disposed && current === version) loading.value = false }
  }
  async function loadCategories() {
    const projectId = patrolProject.value
    if (!projectId) { categories.value = []; return }
    try { const data = await configurationOptions('categories', projectId); if (!disposed && patrolProject.value === projectId) categories.value = data }
    catch (cause) { if (!disposed) fail(cause) }
  }
  function search(reset = false) {
    if (reset) { name.value = ''; category.value = undefined }
    applied.value = { name: name.value, category: category.value || '' }; void load()
  }
  async function edit(point?: ConfigEntity) {
    if (!patrolProject.value || loading.value || saving.value) return
    const current = ++detailVersion
    error.value = ''; saved.value = false; qr.value = false; assignmentCategory.value = undefined; rules.value = undefined
    loading.value = true
    try {
      const data = point?.id ? await api.readPoint(point.id, point.projectId)
        : { name: '', enabled: true, projectId: patrolProject.value, tagIds: [], categoryId: undefined }
      // 标签不足授权时不提供可编辑选项；保留原值，避免保存其他字段时丢掉已有标签。
      const tagRows = canManage(context.value, 'patrol-tag', 'query') ? await configurationOptions('tags', data.projectId) : []
      if (disposed || current !== detailVersion) return
      editor.value = pointPayload(data); editor.value.projectName = data.projectName; editor.value.categoryIds = data.categoryIds
      tags.value = tagRows
    } catch (cause) { if (!disposed && current === detailVersion) fail(cause) }
    finally { if (!disposed && current === detailVersion) loading.value = false }
  }
  function close() {
    if (saving.value || assignmentLoading.value) return
    if (qr.value) qr.value = false
    else if (assignmentCategory.value) { assignmentCategory.value = undefined; rules.value = undefined; assignmentError.value = ''; ruleVersion++ }
    else { editor.value = undefined; detailVersion++; void load() }
  }
  async function save(value: ConfigEntity) {
    if (saving.value || !canSave.value) return
    saving.value = true; error.value = ''; saved.value = false
    try {
      const result = await api.savePoint(pointPayload(value))
      if (disposed) return
      editor.value = { ...result, categoryIds: result.categoryIds || [result.categoryId!] }; saved.value = true
    } catch (cause) { if (!disposed) fail(cause) }
    finally { saving.value = false }
  }
  async function categoryChange(action: 'link' | 'cancel', id: string) {
    if (!editor.value?.id || saving.value || !canSave.value) return
    saving.value = true; error.value = ''; saved.value = false
    try {
      await api.changeCategory(action, editor.value, id)
      editor.value = await api.readPoint(editor.value.id!, editor.value.projectId); saved.value = true
    } catch (cause) { if (!disposed) fail(cause) }
    finally { saving.value = false }
  }
  async function configure(categoryId: string) {
    if (!editor.value?.id || saving.value || assignmentLoading.value) return
    const current = ++ruleVersion
    assignmentCategory.value = categoryId; rules.value = undefined; assignmentError.value = ''; assignmentLoading.value = true
    try {
      const [detail, roleRows, levelRows, standardRows] = await Promise.all([
        api.readAssignments(editor.value, categoryId), configurationOptions('roles', editor.value.projectId), configurationOptions('levels', editor.value.projectId), configurationOptions('standards', editor.value.projectId),
      ])
      if (disposed || current !== ruleVersion) return
      roles.value = roleRows; levels.value = levelRows; standards.value = standardRows
      rules.value = (detail[0]?.assignments || []).map(row => ({ roleId: row.roleId || '', levelId: row.levelId, standardId: row.standardId }))
    } catch (cause) { if (!disposed && current === ruleVersion) assignmentError.value = cause instanceof Error ? cause.message : 'Mobile.requestFailed' }
    finally { if (!disposed && current === ruleVersion) assignmentLoading.value = false }
  }
  async function saveRules() {
    if (!editor.value || !assignmentCategory.value || !rules.value || saving.value || !canConfigure.value) return
    if (!rulesValid(rules.value)) { assignmentError.value = 'Mobile.rulePair'; return }
    saving.value = true; assignmentError.value = ''
    try {
      await api.saveAssignments(editor.value, assignmentCategory.value, rules.value)
      if (disposed) return
      assignmentCategory.value = undefined; rules.value = undefined; saved.value = true
    } catch (cause) { if (!disposed) assignmentError.value = cause instanceof Error ? cause.message : 'Mobile.requestFailed' }
    finally { saving.value = false }
  }
  watch(patrolProject, () => { category.value = undefined; rows.value = []; categories.value = []; search(); void loadCategories() })
  onMounted(() => { void load(); void loadCategories() })
  return { context, rows, categories, tags, roles, levels, standards, name, category, total, loading, saving, error, saved,
    editor, qr, assignmentCategory, rules, assignmentLoading, assignmentError, canSave, canConfigure, canReadConfiguration,
    load, search, edit, close, save, categoryChange, configure, saveRules }
}
