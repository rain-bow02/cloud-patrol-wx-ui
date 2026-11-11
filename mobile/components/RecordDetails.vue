<script setup lang="ts">
import Image from './EvidenceImage.vue'
import { watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { Execution } from '../../api/types'
import { enumValue, answerIsAbnormal } from '../../model/standards'
import { dateTime } from '../../model/display'
const props = defineProps<{ record: Execution; images: Record<string, string> }>()
const emit = defineEmits<{ preview: [id: string] }>()
const { t } = useI18n()
watch(() => props.record, record => { for (const id of new Set(record.answers.map(row => row.attachmentId).filter((id): id is string => !!id))) if (!props.images[id]) emit('preview', id) }, { immediate: true })
</script>
<template>
  <section class="panel">
    <h2>{{ record.pointName }}</h2>
    <dl><dt>{{ t('Mobile.user') }}</dt><dd>{{ record.userName }}</dd>
      <dt>{{ t('Mobile.window') }}</dt><dd>{{ dateTime(record.periodStartTime) }} — {{ dateTime(record.periodEndTime) }}</dd>
      <dt v-if="record.categoryName">{{ t('Mobile.category') }}</dt><dd v-if="record.categoryName">{{ record.categoryName }}</dd>
      <dt v-if="record.levelName">{{ t('Mobile.level') }}</dt><dd v-if="record.levelName">{{ record.levelName }}</dd>
      <dt>{{ t('Mobile.collected') }}</dt><dd>{{ record.collectedTime == null ? t('Mobile.unrecorded') : dateTime(record.collectedTime) }}</dd>
      <dt>{{ t('Mobile.networkStatus') }}</dt><dd>{{ t(`Mobile.networkStates.${enumValue(record.networkStatus) ?? 'unrecorded'}`) }}</dd>
      <dt>{{ t('Mobile.received') }}</dt><dd>{{ dateTime(record.receiveTime) }}</dd>
    </dl>
  </section>
  <section v-for="(item, index) in record.standardSnapshot" :key="item.id" class="panel check-item">
    <h3><span class="item-no">{{ index + 1 }}</span>{{ item.title }}</h3>
    <p v-if="record.answers.find(answer => answer.itemId === item.id)?.value || !record.answers.find(answer => answer.itemId === item.id)?.attachmentId" :class="['record-answer', { 'result-fail': answerIsAbnormal(item, record.answers.find(answer => answer.itemId === item.id)) }]">{{ record.answers.find(answer => answer.itemId === item.id)?.value || t('Mobile.noAnswer') }}</p>
    <template v-for="answer in record.answers.filter(answer => answer.itemId === item.id && answer.attachmentId)" :key="answer.itemId">
      <Image v-if="images[answer.attachmentId!]" class="evidence" :width="160" :src="images[answer.attachmentId!]" :alt="t('Mobile.attachment')" />
      <button v-else type="button" class="text-button" @click="emit('preview', answer.attachmentId!)">{{ t('Mobile.attachment') }}</button>
    </template>
  </section>
  <section v-if="record.remark" class="panel"><h3>{{ t('Mobile.remark') }}</h3><p class="record-answer">{{ record.remark }}</p></section>
</template>
