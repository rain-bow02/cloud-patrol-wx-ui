<script setup lang="ts">
import { Field } from 'vant'
import { Radio, RadioGroup } from 'vant'
import Image from './EvidenceImage.vue'
import { watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { Answer, CheckItem } from '../../api/types'
import { itemType } from '../../model/standards'
const props = defineProps<{ items: CheckItem[]; answers: Answer[]; errors: Record<string, string>; images: Record<string, string>; locked: boolean }>()
const emit = defineEmits<{ answer: [id: string, value: string]; upload: [id: string, file: File]; preview: [id: string] }>()
const { t } = useI18n()
watch(() => [props.items, props.answers] as const, ([items, answers]) => {
  const ids = [...items.map(row => row.exampleFileId), ...answers.map(row => row.attachmentId)]
  for (const id of new Set(ids.filter((id): id is string => !!id))) if (!props.images[id]) emit('preview', id)
}, { immediate: true, deep: true })
const answer = (id: string) => props.answers.find(item => item.itemId === id)
function choose(id: string, event: Event) {
  const input = event.target as HTMLInputElement
  if (input.files?.[0]) emit('upload', id, input.files[0])
  input.value = ''
}
</script>
<template>
  <section v-for="(item, index) in items" :key="item.id" class="panel check-item">
    <h3 :id="`label-${item.id}`"><span class="item-no">{{ index + 1 }}</span>{{ item.title }}
      <span v-if="item.required" class="required">{{ t('Mobile.mandatory') }}</span></h3>
    <p v-if="item.referenceText" class="reference">{{ item.referenceText }}</p>
    <p v-if="itemType(item) === 'number' && (item.lowerLimit != null || item.upperLimit != null)" class="reference">
      {{ t('Mobile.range') }}：{{ item.lowerLimit != null ? t('Mobile.minimum', { value: item.lowerLimit }) : '' }}
      {{ item.upperLimit != null ? t('Mobile.maximum', { value: item.upperLimit }) : '' }}
    </p>
    <button v-if="item.exampleFileId && !images[item.exampleFileId]" type="button" class="text-button" @click="emit('preview', item.exampleFileId)">{{ t('Mobile.example') }}</button>
    <Image v-if="item.exampleFileId && images[item.exampleFileId]" class="evidence" :width="160" :src="images[item.exampleFileId]" :alt="t('Mobile.example')" />
    <RadioGroup v-if="itemType(item) === 'choice'" class="choice-list" :model-value="answer(item.id)?.value" :disabled="locked"
      :aria-labelledby="`label-${item.id}`" @update:model-value="emit('answer', item.id, String($event))">
      <Radio v-for="option in item.options" :key="option" :name="option">{{ option }}</Radio>
    </RadioGroup>
    <Field v-else-if="itemType(item) === 'number'" :id="`answer-${item.id}`" :aria-labelledby="`label-${item.id}`"
      :model-value="answer(item.id)?.value ?? ''" inputmode="decimal" :maxlength="27" :placeholder="t('Mobile.numberHint')" :disabled="locked"
      @update:model-value="emit('answer', item.id, $event)" />
    <Field type="textarea" v-else-if="itemType(item) === 'text'" :aria-labelledby="`label-${item.id}`" :model-value="answer(item.id)?.value ?? ''"
      :maxlength="2000" autosize :placeholder="t('Mobile.textHint')" :disabled="locked"
      @update:model-value="emit('answer', item.id, $event)" />
    <div v-if="itemType(item) === 'image' || item.photoRequired" class="upload-area">
      <label class="upload-button" :class="{ disabled: locked }">
        {{ t(answer(item.id)?.attachmentId ? 'Mobile.replace' : 'Mobile.upload') }}
        <input type="file" accept="image/jpeg,image/png,image/webp" :disabled="locked" @change="choose(item.id, $event)" />
      </label>
      <p class="muted">{{ t('Mobile.imageHint') }}</p>
      <template v-if="answer(item.id)?.attachmentId">
        <Image v-if="images[answer(item.id)!.attachmentId!]" class="evidence" :width="160" :src="images[answer(item.id)!.attachmentId!]" :alt="t('Mobile.attachment')" />
        <button v-else type="button" class="text-button" @click="emit('preview', answer(item.id)!.attachmentId!)">{{ t('Mobile.preview') }}</button>
      </template>
    </div>
    <p v-if="errors[item.id]" role="alert" class="field-error">{{ t(errors[item.id]) }}</p>
  </section>
</template>
