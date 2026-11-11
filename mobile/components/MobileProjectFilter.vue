<template>
  <div class="mobile-project-filter">
    <label :for="local ? 'patrol-mobile-editor-project' : 'patrol-mobile-project'">{{ t('Patrol.projects.label') }}</label>
    <SelectField :model-value="selectedValue" :options="options" :placeholder="t('Mobile.chooseProject')" :clearable="!local" :disabled="disabled || loading" @update:model-value="select" />
    <div v-if="failed" class="project-load-error" role="alert"><span>{{ t('Patrol.projects.failed') }}</span><Button @click="load">{{ t('Mobile.refresh') }}</Button></div>
  </div>
</template>
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { Button } from 'vant'
import SelectField from './SelectField.vue'

import { useI18n } from 'vue-i18n'
import { request } from '../transport'
import { patrolProject } from '../projectScope'
import { projectTree, findOrganization, type OrganizationNode } from '../../model/projects'
const props = defineProps<{ disabled?: boolean; local?: boolean; value?: string }>()
const emit = defineEmits<{ 'update:value': [value?: string] }>()
const { t } = useI18n()
const nodes = ref<OrganizationNode[]>([]), loading = ref(false), failed = ref(false)
const options = computed(() => projectTree(nodes.value))
const selectedValue = computed(() => props.local ? props.value : patrolProject.value)
async function load() {
  loading.value = true; failed.value = false
  // 重新取授权树时不携带旧项目筛选，撤权或改为普通组织后仍可恢复选择。
  try { nodes.value = await request<OrganizationNode[]>('/park/patrol/projects/_tree', 'GET', undefined, '')
    const selected = findOrganization(nodes.value, selectedValue.value)
    if (selectedValue.value && (!selected || projectTree([selected])[0].disabled)) select(undefined)
  } catch { failed.value = true; nodes.value = []; select(undefined) }
  finally { loading.value = false }
}
function select(value: unknown) {
  const update = (id?: string) => props.local ? emit('update:value', id) : (patrolProject.value = id)
  if (typeof value !== 'string' || !value) { update(undefined); return }
  const node = findOrganization(nodes.value, value)
  if (node && !projectTree([node])[0].disabled) update(value)
}
onMounted(load)
</script>
<style scoped>
.mobile-project-filter { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; }
.mobile-project-filter > label { flex: 0 0 auto; color: #555; font-size: 13px; }
.mobile-project-filter > .van-cell { flex: 1; min-width: 0; }
.project-load-error { flex-basis: 100%; }
:global(.points-home) .mobile-project-filter { margin: 0 12px 12px; }
.project-load-error { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 6px; color: #bf3333; font-size: 13px; }
</style>
