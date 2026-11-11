<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Button, Cell, Checkbox, CheckboxGroup, Empty, Field, Popup, Search } from 'vant'
import { useI18n } from 'vue-i18n'
interface Option { value?: string; key?: string; id?: string; label?: string; title?: string; name?: string; disabled?: boolean; children?: Option[] }
const props = defineProps<{ modelValue?: string | string[]; options: Option[]; placeholder?: string; disabled?: boolean; multiple?: boolean; clearable?: boolean; label?: string }>()
const emit = defineEmits<{ 'update:modelValue': [value: string | string[] | undefined] }>()
const { t } = useI18n(), show = ref(false), keyword = ref(''), draft = ref<string[]>([])
const flat = computed(() => {
  const result: { value: string; text: string; disabled: boolean; depth: number }[] = []
  function visit(rows: Option[], depth: number) { for (const row of rows) {
    result.push({ value: row.value || row.key || row.id || '', text: row.label || row.title || row.name || '', disabled: !!row.disabled, depth })
    if (row.children) visit(row.children, depth + 1)
  } }
  visit(props.options, 0); return result
})
const shown = computed(() => flat.value.filter(row => !keyword.value || row.text.toLocaleLowerCase().includes(keyword.value.toLocaleLowerCase())))
const selected = computed(() => Array.isArray(props.modelValue) ? props.modelValue : props.modelValue ? [props.modelValue] : [])
const text = computed(() => selected.value.map(id => flat.value.find(row => row.value === id)?.text || id).join('、'))
watch(show, value => { if (value) { keyword.value = ''; draft.value = [...selected.value] } })
function choose(value: string) { emit('update:modelValue', value || undefined); show.value = false }
function confirm() { emit('update:modelValue', [...draft.value]); show.value = false }
</script>
<template>
  <Field :model-value="text" :label="label" readonly is-link :disabled="disabled" :placeholder="placeholder || t('Patrol.select')" @click="!disabled && (show = true)" />
  <Popup v-model:show="show" position="bottom" round safe-area-inset-bottom closeable :style="{ maxHeight: '80dvh' }" teleport="body">
    <div class="selection-sheet">
      <h3>{{ label || placeholder || t('Patrol.select') }}</h3>
      <Search v-model="keyword" :placeholder="t('Mobile.search')" />
      <div class="selection-options">
        <Cell v-if="clearable && !multiple" :title="t('Mobile.all')" clickable @click="choose('')" />
        <CheckboxGroup v-if="multiple" v-model="draft">
          <Cell v-for="row in shown" :key="row.value" :title="row.text" :class="{ 'option-disabled': row.disabled }" :style="{ paddingLeft: `${16 + row.depth * 16}px` }" clickable @click="!row.disabled && (draft = draft.includes(row.value) ? draft.filter(id => id !== row.value) : [...draft, row.value])">
            <template #right-icon><Checkbox :name="row.value" :disabled="row.disabled" @click.stop /></template>
          </Cell>
        </CheckboxGroup>
        <template v-else><Cell v-for="row in shown" :key="row.value" :title="row.text" :class="{ 'option-disabled': row.disabled }" :style="{ paddingLeft: `${16 + row.depth * 16}px` }" :clickable="!row.disabled" :value="modelValue === row.value ? '✓' : ''" @click="!row.disabled && choose(row.value)" /></template>
        <Empty v-if="!shown.length" :description="t('Mobile.noOptions')" />
      </div>
      <Button v-if="multiple" type="primary" block @click="confirm">{{ t('Mobile.confirm') }}</Button>
    </div>
  </Popup>
</template>
<style scoped>
.selection-sheet { padding: 20px 0 12px; }.selection-sheet h3 { margin: 0 44px 8px 16px; font-size: 17px; }
.selection-options { overflow-y: auto; max-height: 52dvh; overscroll-behavior: contain; }.option-disabled { color: #b7bdc8; background: #fafbfc; cursor: default; }
.selection-sheet > .van-button { width: calc(100% - 32px); margin: 12px 16px 0; }
</style>
