<script setup lang="ts">
import { Field } from 'vant'
import { ref } from 'vue'
import { Button, Loading as Spin } from 'vant'
import Alert from '../components/Notice.vue'
import { useI18n } from 'vue-i18n'
import type { MobileTask } from '../model'
import { dateTime } from '../../model/display'
import { usePointScanner } from './usePointScanner'
const props = defineProps<{ resolve: (raw: string) => Promise<MobileTask[]>; nfc?: boolean }>()
const emit = defineEmits<{ select: [row: MobileTask] }>()
const { t } = useI18n(), fileInput = ref<HTMLInputElement>(), code = ref('')
const { matches, busy, scanning, error, start, startCode } = usePointScanner(raw => props.resolve(raw), row => emit('select', row))
function chooseFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (file) void start(file)
}
</script>
<template>
  <section class="panel scan-panel">
    <h2>{{ t(nfc ? 'Mobile.nfcTitle' : 'Mobile.scanTitle') }}</h2>
    <p>{{ t(nfc ? 'Mobile.nfcHint' : 'Mobile.scanHint') }}</p>
    <form v-if="nfc" @submit.prevent="startCode(code)">
      <Field v-model="code" :maxlength="128" :aria-label="t('Mobile.nfcCode')" :placeholder="t('Mobile.nfcCode')" :disabled="scanning || busy" />
      <Button type="primary" native-type="submit" block :disabled="!code.trim() || scanning || busy">{{ t('Mobile.nfcMatch') }}</Button>
    </form>
    <input v-if="!nfc" ref="fileInput" class="scan-file-input" type="file" accept="image/*" :aria-label="t('Mobile.scanSelectFile')" @change="chooseFile" />
    <Button v-if="!nfc" block :disabled="scanning || busy" @click="fileInput?.click()">{{ t('Mobile.scanSelectFile') }}</Button>
    <Spin v-if="scanning || busy" >{{ t(scanning ? 'Mobile.scanWaiting' : 'Mobile.scanMatching') }}</Spin>
    <Alert v-if="error" type="warning" show-icon :message="t(error)" />
    <template v-if="matches.length > 1">
      <h3>{{ t('Mobile.scanChoose') }}</h3>
      <section v-for="row in matches" :key="row.task.id" class="scan-task">
        <h3>{{ row.task.pointName || row.task.name }}</h3>
        <p>{{ row.task.roleId ? row.task.roleName : t('Patrol.allStaffPatrol') }}</p>
        <p>{{ dateTime(row.task.startTime) }} — {{ dateTime(row.task.endTime) }}</p>
        <p>{{ t('Mobile.progress', { done: row.task.completedCount, total: row.task.requiredCount }) }}</p>
        <Button type="primary" @click="emit('select', row)">{{ t('Mobile.start') }}</Button>
      </section>
    </template>
  </section>
</template>
<style scoped>
.scan-file-input { display: none; }
.scan-task { padding: 12px 0; border-bottom: 1px solid #eee; }
.scan-panel form > .van-button, .scan-panel > .van-button { margin-top: 16px; }
</style>
