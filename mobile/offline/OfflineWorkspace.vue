<script setup lang="ts">
import { Field } from 'vant'
import { computed, watch } from 'vue'
import { Button, Empty, Radio, Loading as Spin, RadioGroup, showConfirmDialog, Switch, Tag } from 'vant'
import Alert from '../components/Notice.vue'
import { useI18n } from 'vue-i18n'
import { dateTime } from '../../model/display'
import CheckForm from '../components/CheckForm.vue'
import RecordDetails from '../components/RecordDetails.vue'
import { useOfflinePatrol } from './useOfflinePatrol'
const emit = defineEmits<{ busy: [value: boolean]; screen: [value: { key: string; depth: number }] }>()
const { t, te } = useI18n()
const { data, selected, viewed, answers, remark, images, errors, error, notice, loading, downloading, saving, syncing,
  networkOnline, workingOffline, tab, keyword, busy, canNetwork, pending, filtered, dirty, download, reason, open, close, answer, photo, save, view, sync } = useOfflinePatrol()
const active = computed(() => selected.value || viewed.value?.row)
const readOnly = computed(() => !!viewed.value || busy.value)
const previewError = () => { error.value = 'Mobile.offlinePhotoMissing' }
const message = (value: string) => te(value) ? t(value) : value
watch(busy, value => emit('busy', value), { immediate: true })
watch([selected, viewed], () => emit('screen', { key: active.value ? `offline:${active.value.task.id}` : 'offline', depth: active.value ? 2 : 1 }), { immediate: true })
function back() {
  if (busy.value) return
  if (dirty.value) void showConfirmDialog({ title: t('Mobile.offlineDiscardTitle'), message: t('Mobile.offlineDiscardHint'), confirmButtonText: t('Mobile.offlineDiscard'), cancelButtonText: t('Mobile.back') }).then(close).catch(() => {})
  else close()
}
defineExpose({ back })
</script>
<template>
  <div class="offline-workspace">
    <Alert v-if="error" type="error" show-icon :message="message(error)" />
    <Alert v-if="notice && !active" type="success" show-icon :message="message(notice)" />
    <div v-if="loading" class="empty"><Spin /></div>
    <template v-else-if="active">
      <section class="panel">
        <Tag color="blue">{{ t(viewed ? `Mobile.offlineStates.${viewed.state}` : 'Mobile.offlineCollecting') }}</Tag>
        <h2>{{ active.task.pointName || active.task.name }}</h2>
        <p class="muted">{{ [active.task.projectName, active.task.categoryName, active.task.roleName].filter(Boolean).join(' · ') }}</p>
        <p class="time-window">{{ dateTime(active.task.startTime) }} — {{ dateTime(active.task.endTime) }}</p>
        <p v-if="viewed" class="muted">{{ t('Mobile.collected') }}：{{ dateTime(viewed.submission.collectedTime ?? undefined) }}</p>
        <Alert v-if="viewed?.error" type="warning" show-icon :message="message(viewed.error)" />
      </section>
      <RecordDetails v-if="viewed?.record" :record="viewed.record" :images="images" @preview="previewError" />
      <form v-else @submit.prevent="save">
        <CheckForm :items="active.task.standardSnapshot" :answers="viewed?.submission.answers || answers" :errors="errors" :images="images" :locked="readOnly" @answer="answer" @upload="photo" @preview="previewError" />
        <section class="panel"><label>{{ t('Mobile.remark') }}</label><Field type="textarea" v-if="!viewed" v-model="remark" :rows="3" :maxlength="1000" :disabled="busy" /><p v-else>{{ viewed.submission.remark || '—' }}</p></section>
        <Alert type="info" show-icon :message="t('Mobile.offlineSaveHint')" />
        <Button v-if="!viewed" type="primary" native-type="submit" block size="large" :loading="saving">{{ t('Mobile.offlineSave') }}</Button>
      </form>
      <Button block :disabled="busy" @click="back">{{ t('Mobile.back') }}</Button>
    </template>
    <template v-else>
      <section class="panel offline-status">
        <div class="card-heading"><h2><Icon name="link-o" /> {{ t('Mobile.offlineTitle') }}</h2><Tag :color="canNetwork ? 'green' : 'orange'">{{ t(canNetwork ? 'Mobile.offlineConnected' : 'Mobile.offlineWorking') }}</Tag></div>
        <p>{{ t('Mobile.offlineHint') }}</p>
        <div class="offline-toggle"><span>{{ t('Mobile.offlineWorkSwitch') }}</span><Switch v-model="workingOffline" :disabled="busy || !networkOnline" :aria-label="t('Mobile.offlineWorkSwitch')" /></div>
        <p class="muted">{{ t('Mobile.offlineDemoHint') }}</p>
        <p>{{ t('Mobile.offlineCacheSummary', { tasks: data.rows.length, pending }) }}</p>
        <p class="muted">{{ t('Mobile.offlineCacheTime') }}：{{ data.cachedAt ? dateTime(data.cachedAt) : t('Mobile.unrecorded') }}</p>
        <div class="offline-actions"><Button :disabled="!canNetwork || busy" :loading="downloading" @click="download"><Icon name="down" />{{ t('Mobile.offlineDownload') }}</Button><Button type="primary" :disabled="!canNetwork || !pending || busy" :loading="syncing" @click="sync"><Icon name="upgrade" />{{ t('Mobile.offlineSync') }}</Button></div>
      </section>
      <Alert v-if="!canNetwork" type="warning" show-icon :message="t('Mobile.offlineReconnectHint')" />
      <RadioGroup v-model="tab" button-style="solid" class="offline-tabs"><Radio name="tasks">{{ t('Mobile.offlineTasks') }}</Radio><Radio name="queue">{{ t('Mobile.offlineQueue', { count: pending }) }}</Radio></RadioGroup>
      <template v-if="tab === 'tasks'">
        <Field v-model="keyword" clearable :placeholder="t('Mobile.namePlaceholder')" :aria-label="t('Mobile.pointName')" />
        <Empty v-if="!filtered.length" :description="t('Mobile.offlineEmpty')" />
        <section v-for="row in filtered" :key="row.task.id" class="panel offline-task">
          <h3>{{ row.task.pointName || row.task.name }}</h3>
          <p class="muted">{{ [row.task.categoryName, row.task.roleName].filter(Boolean).join(' · ') }}</p>
          <p class="time-window">{{ dateTime(row.task.startTime) }} — {{ dateTime(row.task.endTime) }}</p>
          <p class="muted">{{ t('Mobile.progress', { done: row.task.completedCount, total: row.task.requiredCount }) }}</p>
          <p v-if="reason(row)" class="muted">{{ t(reason(row)) }}</p>
          <Button type="primary" :disabled="busy || !!reason(row)" @click="open(row)">{{ t('Mobile.offlineStart') }}</Button>
        </section>
      </template>
      <template v-else>
        <Empty v-if="!data.entries.length" :description="t('Mobile.offlineQueueEmpty')" />
        <section v-for="entry in [...data.entries].reverse()" :key="entry.id" class="panel offline-task">
          <div class="card-heading"><h3>{{ entry.row.task.pointName }}</h3><Tag :color="entry.state === 'synced' ? 'green' : entry.state === 'failed' ? 'red' : 'orange'">{{ t(`Mobile.offlineStates.${entry.state}`) }}</Tag></div>
          <p class="muted">{{ t('Mobile.collected') }}：{{ dateTime(entry.submission.collectedTime ?? undefined) }}</p>
          <p v-if="entry.record" class="muted">{{ t('Mobile.received') }}：{{ dateTime(entry.record.receiveTime) }}</p>
          <p v-if="entry.error" role="alert" class="field-error">{{ message(entry.error) }}</p>
          <Button :disabled="busy" @click="view(entry)">{{ t('Mobile.details') }}</Button>
        </section>
      </template>
    </template>
  </div>
</template>
<style scoped>
.offline-workspace { display: flex; flex-direction: column; gap: 14px; }
.offline-workspace .panel { margin: 0; }
.offline-status h2 { display: flex; align-items: center; gap: 8px; }
.offline-status p { line-height: 1.7; }
.offline-status .card-heading, .offline-task .card-heading { gap: 10px; flex-wrap: wrap; }
.offline-toggle { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin: 16px 0; }
.offline-actions { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 16px; }
.offline-actions > .van-button { flex: 1 1 130px; }
.offline-tabs { display: flex; }.offline-tabs > * { flex: 1; text-align: center; }
.offline-workspace form { display: flex; flex-direction: column; gap: 14px; }
.offline-task h3 { margin: 0; }.offline-task .time-window { font-size: 13px; }
</style>
