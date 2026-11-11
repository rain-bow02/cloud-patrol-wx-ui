<script setup lang="ts">
import { ref, watch } from 'vue'
import { DatePicker, Field, Popup } from 'vant'
import { businessTime } from '../../model/display'
const props = defineProps<{ modelValue: string; label?: string; min?: string; max?: string; disabled?: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
const show = ref(false), values = ref<string[]>([])
const asDate = (value?: string) => value ? new Date(`${value}T00:00:00`) : undefined
watch(show, value => { if (value) values.value = (props.modelValue || businessTime().format('YYYY-MM-DD')).split('-') })
function confirm({ selectedValues }: { selectedValues: (string | number)[] }) { emit('update:modelValue', selectedValues.join('-')); show.value = false }
</script>
<template>
  <Field :model-value="modelValue" :label="label" readonly is-link :disabled="disabled" @click="!disabled && (show = true)" />
  <Popup v-model:show="show" position="bottom" round safe-area-inset-bottom teleport="body">
    <DatePicker v-model="values" :title="label" :min-date="asDate(min) || new Date(1970, 0, 1)" :max-date="asDate(max) || new Date(2100, 11, 31)" @confirm="confirm" @cancel="show = false" />
  </Popup>
</template>
