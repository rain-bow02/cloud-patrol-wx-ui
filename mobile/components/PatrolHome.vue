<script setup lang="ts">
import { Button, Icon } from 'vant'

import { useI18n } from 'vue-i18n'
import patrolScene from '../assets/patrol-scene.svg'
import type { HomeTaskState } from '../home'
defineProps<{ summary: { ready: number; cooldown: number; completed: number }; missed?: number; loading: boolean; failed: boolean; missedFailed: boolean; projectSelected: boolean }>()
const emit = defineEmits<{ enter: [page: 'tasks' | 'manage' | 'history' | 'missed' | 'offline']; tasks: [state: HomeTaskState]; refresh: [] }>()
const { t } = useI18n()
const statIcons = { ready: 'location-o', cooldown: 'clock-o', completed: 'passed' }
const entryIcons = { tasks: 'scan', manage: 'location-o', history: 'records-o', missed: 'warning-o' }
</script>
<template>
  <section class="patrol-hero">
    <div><span class="hero-eyebrow">{{ t('Mobile.loginWorkplace') }}</span><h2>{{ t('Mobile.heroTitle') }}</h2><p>{{ t('Mobile.heroHint') }}</p></div>
    <img :src="patrolScene" alt="" width="320" height="240" />
  </section>
  <div class="home-section-heading"><h2>{{ t('Mobile.todaySummary') }}</h2><Button type="default" plain size="small" :loading="loading" :disabled="!projectSelected" @click="emit('refresh')">{{ t('Mobile.refresh') }}</Button></div>
  <section class="home-stats" :aria-busy="loading" :aria-label="t('Mobile.todaySummary')">
    <button v-for="key in (['ready', 'cooldown', 'completed'] as const)" :key="key" type="button" class="home-stat" :class="key" :disabled="!projectSelected || loading || failed" @click="emit('tasks', key)">
      <span class="home-stat-label"><Icon :name="statIcons[key]" aria-hidden="true" />{{ t(`Mobile.homeStats.${key}`) }}</span><strong>{{ loading || failed || !projectSelected ? '—' : summary[key] }}</strong>
      <small>{{ t('Mobile.details') }} ›</small>
    </button>
    <button type="button" class="home-stat missed" :disabled="!projectSelected" @click="emit('enter', 'missed')">
      <span class="home-stat-label"><Icon name="warning-o" aria-hidden="true" />{{ t('Mobile.homeStats.missed') }}</span><strong>{{ loading || missed === undefined ? '—' : missed }}</strong>
      <small>{{ t(missedFailed ? 'Mobile.summaryFailed' : 'Mobile.missedRange') }} ›</small>
    </button>
  </section>
  <div class="home-section-heading"><h2>{{ t('Mobile.quickEntries') }}</h2></div>
  <nav class="home-menu" :aria-label="t('Mobile.homeTitle')">
    <button v-for="key in (['tasks', 'manage', 'history', 'missed'] as const)" :key="key" type="button" class="home-menu-item" :class="key" :disabled="!projectSelected" @click="emit('enter', key)">
      <span class="home-entry-icon"><Icon :name="entryIcons[key]" aria-hidden="true" /></span><strong>{{ t(`Mobile.entries.${key}`) }}</strong><span class="home-entry-hint">{{ t(`Mobile.entryHints.${key}`) }}</span><Icon name="arrow" class="home-entry-arrow" aria-hidden="true" />
    </button>
  </nav>
  <section class="offline-entry">
    <button type="button" class="home-menu-item" :disabled="!projectSelected" @click="emit('enter', 'offline')">
      <Icon name="down" aria-hidden="true" /><strong>{{ t('Mobile.offlineTitle') }}</strong><span>{{ t('Mobile.offlineEntryHint') }} ›</span>
    </button>
  </section>
</template>
