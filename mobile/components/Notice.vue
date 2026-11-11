<script setup lang="ts">
import { NoticeBar } from 'vant'
defineProps<{ message: string; description?: string; type?: string }>()
</script>
<template><NoticeBar wrapable :scrollable="false" :color="type === 'error' ? '#b42318' : type === 'success' ? '#16794c' : '#526983'" :background="type === 'error' ? '#fff1f0' : type === 'success' ? '#edf9f3' : '#eef5ff'" :text="[message, description].filter(Boolean).join(' ')" /></template>
