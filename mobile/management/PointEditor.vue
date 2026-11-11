<script setup lang="ts">
import { Field, Form, type FormInstance } from 'vant'
import SelectField from '../components/SelectField.vue'
import { computed, reactive, ref, watch } from 'vue'
import { Button, Switch } from 'vant'

import { useI18n } from 'vue-i18n'
import type { ConfigEntity } from '../../api/types'
import { categoryTree } from '../../model/categories'
import MobileProjectFilter from '../components/MobileProjectFilter.vue'
const props = defineProps<{ value: ConfigEntity; categories: ConfigEntity[]; tags: ConfigEntity[]; canSave: boolean; canConfigure: boolean; saving: boolean }>()
const emit = defineEmits<{ save: [point: ConfigEntity]; configure: [category: string]; qr: [] }>()
const { t } = useI18n(), form = ref<FormInstance>(), model = reactive<ConfigEntity>({ name: '', enabled: true })
watch(() => props.value, value => { Object.assign(model, value, { tagIds: [...(value.tagIds || [])] }) }, { immediate: true })
const categoryRows = computed(() => props.categories.filter(row => row.projectId === model.projectId))
const categoryOptions = computed(() => categoryTree(categoryRows.value.filter(row => row.enabled)))
const categoryIds = computed(() => props.value.categoryIds || (props.value.categoryId ? [props.value.categoryId] : []))
const currentCategories = computed(() => categoryIds.value.map(id => props.categories.find(row => row.id === id) || { id, name: id }))
const tagOptions = computed(() => props.tags.filter(row => row.projectId === model.projectId && (row.enabled || model.tagIds?.includes(row.id!))).map(row => ({ value: row.id!, label: row.name })))
const required = [{ required: true, validator: (value: string) => !!value?.trim(), message: t('Mobile.required') }]
watch(() => model.categoryId, id => {
  if (model.id) return
  const category = props.categories.find(row => row.id === id)
  if (category) model.projectId = category.projectId
})
watch(() => model.projectId, () => {
  if (model.id) return
  if (!categoryRows.value.some(row => row.id === model.categoryId)) model.categoryId = undefined
  model.tagIds = []
})
async function save() {
  try { await form.value?.validate() } catch { return }
  emit('save', { ...model, tagIds: [...(model.tagIds || [])] })
}
</script>
<template>
  <Form ref="form" class="panel point-editor" :disabled="!canSave || saving" @submit="save">
    <MobileProjectFilter v-if="!model.id" v-model:value="model.projectId" local disabled />
    <Field v-else :label="t('Patrol.projects.label')" :model-value="value.projectName || value.projectId" readonly />
    <Field v-model="model.name" name="name" :label="t('Mobile.pointName')" :maxlength="128" :rules="required" />
    <Field v-model="model.code" :label="t('Patrol.code')" :maxlength="64" :placeholder="t('Mobile.codeAuto')" />
    <Field v-if="!model.id" name="categoryId" :rules="[{ validator: () => !!model.categoryId, message: t('Mobile.required') }]">
      <template #input><SelectField v-model="model.categoryId" :label="t('Mobile.category')" :options="categoryOptions" :placeholder="t('Patrol.select')" :disabled="!canSave || saving" /></template>
    </Field>
    <Field v-model="model.nfcCode" :label="t('Mobile.nfcCode')" :maxlength="128" />
    <Field v-model="model.location" name="location" :label="t('Mobile.pointLocation')" :maxlength="255" :rules="required" />
    <SelectField v-model="model.tagIds" :label="t('Patrol.tags')" multiple :options="tagOptions" :disabled="saving || !canSave || !tags.length" />
    <Field :label="t('Patrol.enabled')"><template #input><Switch v-model="model.enabled" :disabled="!canSave || saving" /></template></Field>
    <Field v-model="model.description" type="textarea" :label="t('Mobile.remark')" :maxlength="512" :rows="3" />
    <Button v-if="canSave" type="primary" native-type="submit" block size="large" :loading="saving">{{ t('Patrol.save') }}</Button>
  </Form>
  <template v-if="value.id">
    <section class="panel">
      <div class="card-heading"><h2>{{ t('Mobile.pointQr') }}</h2><Button @click="emit('qr')">{{ t('Mobile.showQr') }}</Button></div>
    </section>
    <section class="panel">
      <h2>{{ t('Mobile.category') }}</h2>
      <div v-for="item in currentCategories" :key="item.id" class="category-relation">
        <span>{{ item.name }}</span><div class="inline-actions">
          <Button v-if="canConfigure" :disabled="saving" @click="emit('configure', item.id!)">{{ t('Patrol.patrolConfiguration') }}</Button>
        </div>
      </div>

    </section>
  </template>
</template>
